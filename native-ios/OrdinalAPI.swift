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

    func action(sessionID: String, name: String, body: ActionEnvelope = .init()) async throws -> Data {
        let url = baseURL.appending(path: "api/session/\(sessionID)/\(name)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        return data
    }

    private func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
}
