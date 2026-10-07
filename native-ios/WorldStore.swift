import Foundation
import Combine

@MainActor
final class WorldStore: ObservableObject {
    @Published var state: OrdinalAPI.PlayerState?
    @Published var status = "WORLD LINK // READY"
    @Published var busy = false
    @Published var lastError: String?
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
            status = "WORLD LINK // RECOVERY REQUIRED"
            lastError = "This saved device identity could not be restored. Use your recovery code or create a Wayfarer."
            self.playerKey = nil
            UserDefaults.standard.removeObject(forKey: "ordinal.playerKey")
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
                status = "CHOOSE YOUR WAYFARER"
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
        guard let sessionID, !busy else { return }
        do {
            state = try await OrdinalAPI.shared.state(sessionID: sessionID)
            status = "WORLD LINK // ONLINE"
            await syncSocial()
        } catch {
            status = "WORLD LINK // RECONNECTING"
            await connect(lat: lastLat, lon: lastLon)
        }
    }

    func act(_ name: String, type: String? = nil, id: String? = nil, choice: String? = nil) async {
        guard let sessionID, !busy else { return }
        busy = true
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
            lastError = error.localizedDescription
        }
    }

    private func persistIdentity(_ key: String) {
        playerKey = key
        UserDefaults.standard.set(key, forKey: "ordinal.playerKey")
    }

    private func adopt(_ session: OrdinalAPI.SessionEnvelope) {
        sessionID = session.sessionId
        state = session.state
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
            presence = players
            leaders = ranking.leaders
            worldRank = ranking.rank
            rankedPopulation = ranking.total
        } catch {
            // Social state can fail independently without taking the world offline.
        }
    }
}
