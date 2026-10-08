import Foundation
import Combine

@MainActor
final class WorldStore: ObservableObject {
    @Published var state: OrdinalAPI.PlayerState? {
        didSet { stateRevision &+= 1 }
    }
    @Published var status = "WORLD LINK // READY"
    @Published var busy = false
    @Published var lastError: String?
    @Published private(set) var requiresResync = false
    @Published var presence: [OrdinalAPI.Presence] = []
    @Published var leaders: [OrdinalAPI.Leader] = []
    @Published var worldRank: Int?
    @Published var rankedPopulation = 0
    @Published var recoveryCode: String?

    private(set) var sessionID: String?
    private var playerKey: String?
    private var accountPlayerKey: String?
    private var lastLat: Double?
    private var lastLon: Double?
    private var stateRevision = 0
    private var refreshing = false

    var hasSavedIdentity: Bool { playerKey != nil }

    init() {
        playerKey = UserDefaults.standard.string(forKey: "ordinal.playerKey")
        if playerKey == nil {
            status = "CREATE OR RECOVER A WAYFARER"
        }
    }

    func setLocation(lat: Double? = nil, lon: Double? = nil) {
        if let lat { lastLat = lat }
        if let lon { lastLon = lon }
    }

    func connect(lat: Double? = nil, lon: Double? = nil) async {
        setLocation(lat: lat, lon: lon)
        guard let playerKey, !busy else {
            if playerKey == nil { status = "CREATE OR RECOVER A WAYFARER" }
            return
        }

        busy = true
        defer { busy = false }
        do {
            let session = try await OrdinalAPI.shared.createSession(
                playerKey: playerKey,
                playerName: "Wayfarer",
                origin: "Rogue",
                lat: lastLat,
                lon: lastLon,
                recoverOnly: true
            )
            adopt(session)
        } catch {
            if OrdinalAPI.isMissingIdentity(error) {
                status = "WORLD LINK // RECOVERY REQUIRED"
                lastError = "No saved Wayfarer was found. Use your recovery code or create a Wayfarer."
                self.playerKey = nil
                UserDefaults.standard.removeObject(forKey: "ordinal.playerKey")
            } else {
                status = "WORLD LINK // RECONNECTING"
                lastError = "Could not connect. Your saved identity is still on this device. Try reconnecting."
            }
        }
    }

    func createCharacter(name: String, origin: String) async {
        guard !busy else { return }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else {
            lastError = "Choose a Wayfarer name."
            return
        }

        busy = true
        defer { busy = false }
        do {
            let key = accountPlayerKey ?? UUID().uuidString.replacingOccurrences(of: "-", with: "")
            let session = try await OrdinalAPI.shared.createSession(
                playerKey: key,
                playerName: cleanName,
                origin: origin,
                lat: lastLat,
                lon: lastLon
            )
            persistIdentity(session.playerKey)
            adopt(session)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func recover(code: String) async {
        guard !busy else { return }
        let clean = code.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else {
            lastError = "Enter a recovery code."
            return
        }

        busy = true
        defer { busy = false }
        do {
            let session = try await OrdinalAPI.shared.recover(code: clean)
            persistIdentity(session.playerKey)
            adopt(session)
        } catch {
            lastError = "Recovery code was not accepted."
        }
    }

    func useAccount(_ account: OrdinalAPI.TestAccount, restore: Bool) async {
        stateRevision &+= 1
        accountPlayerKey = account.playerKey
        playerKey = nil
        sessionID = nil
        state = nil
        lastError = nil
        UserDefaults.standard.removeObject(forKey: "ordinal.playerKey")
        if restore {
            do {
                let session = try await OrdinalAPI.shared.createSession(playerKey: account.playerKey, playerName: "Wayfarer", origin: "Rogue", lat: lastLat, lon: lastLon, recoverOnly: true)
                persistIdentity(session.playerKey)
                adopt(session)
            } catch {
                if OrdinalAPI.isMissingIdentity(error) {
                    status = "CHOOSE YOUR WAYFARER"
                } else {
                    persistIdentity(account.playerKey)
                    status = "WORLD LINK // RECONNECTING"
                    lastError = "Your account signed in, but its Wayfarer could not load. Try reconnecting."
                }
            }
        }
    }

    func generateRecoveryCode() async {
        guard let sessionID, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            recoveryCode = try await OrdinalAPI.shared.createRecoveryCode(sessionID: sessionID)
            lastError = nil
        } catch {
            lastError = "Could not generate a recovery code right now."
        }
    }

    func relocateIfNeeded(lat: Double, lon: Double) async {
        lastLat = lat
        lastLon = lon
        guard let sessionID, !busy else { return }

        let cell = "\(Int(floor(lat * 90))):\(Int(floor(lon * 90)))"
        let currentCell = state.map { $0.region.key.replacingOccurrences(of: "c1200:", with: "") }
        guard currentCell != cell else { return }

        busy = true
        stateRevision &+= 1
        defer { busy = false }
        do {
            state = try await OrdinalAPI.shared.action(
                sessionID: sessionID,
                name: "relocate",
                body: .init(lat: lat, lon: lon)
            )
            status = state?.region.key.hasPrefix("c1200:") == true ? "WORLD LINK // ONLINE" : status
            await syncSocial()
        } catch {
            lastError = "Could not synchronize the new world region."
        }
    }

    func refresh() async {
        guard let sessionID, !busy, !refreshing else { return }
        let revision = stateRevision
        refreshing = true
        defer { refreshing = false }
        do {
            let next = try await OrdinalAPI.shared.state(sessionID: sessionID)
            guard self.sessionID == sessionID, stateRevision == revision, !busy else { return }
            state = next
            requiresResync = false
            status = "WORLD LINK // ONLINE"
            await syncSocial()
        } catch {
            guard self.sessionID == sessionID, stateRevision == revision, !busy else { return }
            status = "WORLD LINK // RECONNECTING"
            if OrdinalAPI.isMissingIdentity(error) { await connect(lat: lastLat, lon: lastLon) }
        }
    }

    func act(_ name: String, type: String? = nil, id: String? = nil, choice: String? = nil) async {
        guard let sessionID, !busy else { return }
        guard !requiresResync else {
            lastError = "Reconnecting to confirm your last action before continuing."
            return
        }
        busy = true
        stateRevision &+= 1
        defer { busy = false }
        do {
            state = try await OrdinalAPI.shared.action(
                sessionID: sessionID,
                name: name,
                body: .init(type: type, id: id, choice: choice)
            )
            lastError = nil
            await syncSocial()
        } catch {
            requiresResync = true
            lastError = error.localizedDescription
        }
    }

    private func persistIdentity(_ key: String) {
        playerKey = key
        UserDefaults.standard.set(key, forKey: "ordinal.playerKey")
    }

    private func adopt(_ session: OrdinalAPI.SessionEnvelope) {
        stateRevision &+= 1
        sessionID = session.sessionId
        state = session.state
        requiresResync = false
        status = "WORLD LINK // ONLINE"
        lastError = nil
        Task { await syncSocial() }
    }

    func syncSocial() async {
        guard let sessionID else { return }
        async let nearby = OrdinalAPI.shared.presence(sessionID: sessionID)
        async let board = OrdinalAPI.shared.leaderboard(sessionID: sessionID)
        do {
            let (players, ranking) = try await (nearby, board)
            guard self.sessionID == sessionID else { return }
            presence = players
            leaders = ranking.leaders
            worldRank = ranking.rank
            rankedPopulation = ranking.total
        } catch {
            // Social state can fail independently without taking the world offline.
        }
    }
}
