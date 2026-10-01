import Foundation
import Combine

@MainActor
final class WorldStore: ObservableObject {
    @Published var state: OrdinalAPI.PlayerState?
    @Published var status = "CONNECTING TO WORLD"
    @Published var busy = false
    @Published var lastError: String?

    private(set) var sessionID: String?
    private let playerKey: String
    private var lastLat: Double?
    private var lastLon: Double?

    init() {
        if let saved = UserDefaults.standard.string(forKey: "ordinal.playerKey") {
            playerKey = saved
        } else {
            let created = UUID().uuidString.replacingOccurrences(of: "-", with: "")
            playerKey = created
            UserDefaults.standard.set(created, forKey: "ordinal.playerKey")
        }
    }

    func connect(lat: Double? = nil, lon: Double? = nil) async {
        guard !busy else { return }
        if let lat { lastLat = lat }
        if let lon { lastLon = lon }
        busy = true
        defer { busy = false }
        do {
            let session = try await OrdinalAPI.shared.createSession(
                playerKey: playerKey,
                playerName: "Wayfarer",
                origin: "Rogue",
                lat: lat ?? lastLat,
                lon: lon ?? lastLon
            )
            sessionID = session.sessionId
            state = session.state
            status = "WORLD LINK // ONLINE"
            lastError = nil
        } catch {
            status = "WORLD LINK // OFFLINE"
            lastError = error.localizedDescription
        }
    }

    func refresh() async {
        guard let sessionID, !busy else { return }
        do {
            state = try await OrdinalAPI.shared.state(sessionID: sessionID)
            status = "WORLD LINK // ONLINE"
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
        } catch {
            lastError = error.localizedDescription
        }
    }
}
