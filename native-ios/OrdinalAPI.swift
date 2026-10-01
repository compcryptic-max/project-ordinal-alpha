import Foundation

actor OrdinalAPI {
    static let shared = OrdinalAPI()
    private let baseURL = URL(string: "https://project-ordinal-alpha.onrender.com")!
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    struct Health: Decodable {
        let ok: Bool
        let name: String
        let version: String
        let storage: String
    }

    struct CreateSession: Encodable {
        let playerKey: String
        let playerName: String
        let origin: String
        let lat: Double?
        let lon: Double?
        var recoverOnly = false
    }

    struct SessionEnvelope: Decodable {
        let sessionId: String
        let playerKey: String
        let state: PlayerState
    }

    struct RecoveryRequest: Encodable {
        let code: String
    }

    struct RecoveryCreateRequest: Encodable {
        let sessionId: String
    }

    struct RecoveryCreateResponse: Decodable {
        let code: String
    }

    struct StateEnvelope: Decodable {
        let state: PlayerState
    }

    struct PresenceEnvelope: Decodable {
        let players: [Presence]
    }

    struct Presence: Decodable, Identifiable {
        var id: String { name + origin }
        let name: String
        let origin: String
        let level: Int
        let rating: Int
        let title: String?
    }

    struct LeaderboardEnvelope: Decodable {
        let rank: Int
        let total: Int
        let leaders: [Leader]
    }

    struct Leader: Decodable, Identifiable {
        var id: Int { rank }
        let name: String
        let origin: String
        let level: Int
        let rating: Int
        let title: String?
        let rank: Int
    }



    struct PlayerState: Decodable {
        let name: String
        let origin: String
        let level: Int
        let hp: Int
        let maxHp: Int
        let gold: Int
        let inventory: [Item]
        let equipment: Equipment
        let mastery: Mastery
        let journey: Journey
        let contractList: [Contract]
        let callingOptions: [String: Calling]
        let path: CombatPath
        let ordinalRating: Int?
        let region: Region
        let field: [FieldNode]?
        let pendingEncounter: PendingEncounter?
        let combat: Combat?
        let pendingLoot: Loot?
        let pendingChoice: String?
    }

    struct Item: Decodable, Identifiable {
        let id: String
        let name: String
        let rarity: String
        let power: Int?
        let trait: String?
        let qty: Int?
    }

    struct Equipment: Decodable {
        let weapon: String?
    }

    struct Mastery: Decodable {
        let rank: Int
        let xp: Int
        let next: Int
        let name: String
    }

    struct Journey: Decodable {
        let title: String
        let hook: String
        let chapter: Int
        let progress: Int
        let next: Int
        let beats: [String]
        let calling: String?
        let callingProgress: Int
        let callingTier: Int
    }

    struct Contract: Decodable, Identifiable {
        let id: String
        let name: String
        let desc: String
        let value: Int
        let target: Int
        let reward: String
    }

    struct Calling: Decodable {
        let name: String
        let desc: String
        let metric: String
    }

    struct CombatPath: Decodable {
        let attack: Int
        let guard: Int
        let evade: Int
        let skill: Int
        let specialization: String?
        let revealedAt: Int
    }

    struct Region: Decodable {
        let key: String
        let name: String
        let stage: String
        let threat: Int
        let apex: Apex?
        let objective: Objective?
    }

    struct Apex: Decodable {
        let name: String
        let seals: Int
        let target: Int
        let complete: Bool
        let contributors: [String]
    }

    struct Objective: Decodable {
        let title: String
        let progress: Int
        let target: Int
    }

    struct FieldNode: Decodable, Identifiable {
        let id: String
        let kind: String
        let name: String?
        let distance: Int
        let x: Double
        let y: Double
        let collected: Bool
    }

    struct PendingEncounter: Decodable {
        let name: String
        let elite: Int
        let archetype: String
        let weakness: String
        let threat: Int
        let rumorTitle: String?
        let modifier: Modifier?
    }

    struct Modifier: Decodable {
        let name: String
        let desc: String
    }

    struct Loot: Decodable {
        let id: String
        let name: String
        let rarity: String
        let source: String
        let power: Int
        let trait: String
    }

    struct Combat: Decodable {
        let name: String
        let hp: Int
        let maxHp: Int
        let intent: String
        let turn: Int?
        let stamina: Int?
        let focus: Int?
        let phase: Int?
        let lastResult: String?
        let rift: Bool?
        let riftWave: Int?
    }

    struct ActionEnvelope: Encodable {
        var type: String?
        var id: String?
        var choice: String?
    }

    func health() async throws -> Health {
        let (data, response) = try await URLSession.shared.data(from: baseURL.appending(path: "health"))
        try validate(response)
        return try decoder.decode(Health.self, from: data)
    }

    func createSession(playerKey: String, playerName: String, origin: String, lat: Double? = nil, lon: Double? = nil, recoverOnly: Bool = false) async throws -> SessionEnvelope {
        var request = URLRequest(url: baseURL.appending(path: "api/session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(CreateSession(playerKey: playerKey, playerName: playerName, origin: origin, lat: lat, lon: lon, recoverOnly: recoverOnly))
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        return try decoder.decode(SessionEnvelope.self, from: data)
    }

    func createRecoveryCode(sessionID: String) async throws -> String {
        var request = URLRequest(url: baseURL.appending(path: "api/recovery/create"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(RecoveryCreateRequest(sessionId: sessionID))
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        return try decoder.decode(RecoveryCreateResponse.self, from: data).code
    }

    func recover(code: String) async throws -> SessionEnvelope {
        var request = URLRequest(url: baseURL.appending(path: "api/recovery/use"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(RecoveryRequest(code: code))
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        return try decoder.decode(SessionEnvelope.self, from: data)
    }

    func state(sessionID: String) async throws -> PlayerState {
        let url = baseURL.appending(path: "api/session/\(sessionID)")
        let (data, response) = try await URLSession.shared.data(from: url)
        try validate(response)
        return try decoder.decode(StateEnvelope.self, from: data).state
    }

    func presence(sessionID: String) async throws -> [Presence] {
        let url = baseURL.appending(path: "api/session/\(sessionID)/presence")
        let (data, response) = try await URLSession.shared.data(from: url)
        try validate(response)
        return try decoder.decode(PresenceEnvelope.self, from: data).players
    }

    func leaderboard(sessionID: String) async throws -> LeaderboardEnvelope {
        let url = baseURL.appending(path: "api/session/\(sessionID)/leaderboard")
        let (data, response) = try await URLSession.shared.data(from: url)
        try validate(response)
        return try decoder.decode(LeaderboardEnvelope.self, from: data)
    }

    func action(sessionID: String, name: String, body: ActionEnvelope = .init()) async throws -> PlayerState {
        let url = baseURL.appending(path: "api/session/\(sessionID)/\(name)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        return try decoder.decode(StateEnvelope.self, from: data).state
    }

    private func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}
