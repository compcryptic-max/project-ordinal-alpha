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
        var recoverOnly = false
    }

    struct SessionEnvelope: Decodable {
        let sessionId: String
        let playerKey: String
        let state: PlayerState
    }

    struct StateEnvelope: Decodable {
        let state: PlayerState
    }

    struct PlayerState: Decodable {
        let name: String
        let origin: String
        let level: Int
        let hp: Int
        let maxHp: Int
        let gold: Int
        let ordinalRating: Int?
        let region: Region
        let field: [FieldNode]?
        let combat: Combat?
    }

    struct Region: Decodable {
        let key: String
        let name: String
        let threat: Int
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

    func createSession(playerKey: String, playerName: String, origin: String) async throws -> SessionEnvelope {
        var request = URLRequest(url: baseURL.appending(path: "api/session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(CreateSession(playerKey: playerKey, playerName: playerName, origin: origin))
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
