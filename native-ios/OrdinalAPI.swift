import Foundation

actor OrdinalAPI {
    static let shared = OrdinalAPI()
    private let baseURL = URL(string: "https://project-ordinal-alpha.onrender.com")!
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let transport: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 25
        return URLSession(configuration: configuration)
    }()

    static func isMissingIdentity(_ error: Error) -> Bool {
        let failure = error as NSError
        return failure.domain == "OrdinalAPI" && failure.code == 404
            && ["player_not_found", "session_not_found"].contains(failure.localizedDescription)
    }

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
        let home: Home?
        let companion: Companion?
        let environment: Environment?
        let nextObjective: NextObjective?
        let inventory: [Item]
        let equipment: Equipment
        let mastery: Mastery
        let journey: Journey
        let contractList: [Contract]
        let callingOptions: [String: Calling]
        let directive: Directive?
        let path: CombatPath
        let storyDecision: StoryDecision?
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
        let history: [String]?
    }

    struct NextObjective: Decodable {
        let title: String
        let detail: String
        let action: String
        let choice: String?
        let type: String?
    }
    struct Environment: Decodable {
        let status: String
        let rainBoost: Bool
        let isDay: Bool?
        let timezone: String?
    }
    struct Companion: Decodable {
        let name: String
        let unlocked: Bool
        let ready: Bool
        let expedition: Expedition?
        struct Expedition: Decodable { let returnAt: Double }
    }
    struct Home: Decodable {
        let investigations: Int
        let nextInvestigationAt: Double
        let npc: Keeper
    }
    struct Keeper: Decodable {
        let name: String
        let trust: Int
        let memories: [String]
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

    struct Directive: Decodable, Identifiable {
        let id: String
        let kind: String
        let title: String
        let desc: String
        let target: Int
        let progress: Int
        let reward: String
        let regionName: String
        let canReroute: Bool
    }

    struct Calling: Decodable {
        let name: String
        let desc: String
        let metric: String
    }

    struct StoryDecision: Decodable {
        let id: String
        let chapter: Int
        let kind: String
        let title: String
        let prompt: String
        let options: [StoryOption]
    }

    struct StoryOption: Decodable, Identifiable {
        let id: String
        let label: String
    }

    struct CombatPath: Decodable {
        let attack: Int
        let guardCount: Int
        let evade: Int
        let skill: Int
        let specialization: String?
        let revealedAt: Int

        enum CodingKeys: String, CodingKey {
            case attack, evade, skill, specialization, revealedAt
            case guardCount = "guard"
        }
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
        let label: String
        let detail: String
        let reward: String
        let action: String?
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
        var type: String? = nil
        var id: String? = nil
        var choice: String? = nil
        var lat: Double? = nil
        var lon: Double? = nil
    }

    func health() async throws -> Health {
        let (data, response) = try await transport.data(from: baseURL.appending(path: "health"))
        try validate(response, data: data)
        return try decoder.decode(Health.self, from: data)
    }

    struct AccountEnvelope: Decodable { let account: TestAccount }
    struct TestAccount: Decodable {
        let login: String
        let displayName: String
        let playerKey: String
        let persistent: Bool
        let recoveryCode: String?
    }
    struct AccountInput: Encodable {
        let login: String
        let password: String
        let displayName: String
        let recoveryCode: String
    }
    func account(action: String, input: AccountInput) async throws -> TestAccount {
        var request = URLRequest(url: baseURL.appending(path: "api/account/\(action)"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(input)
        let (data, response) = try await transport.data(for: request)
        try validate(response, data: data)
        return try decoder.decode(AccountEnvelope.self, from: data).account
    }

    func createSession(playerKey: String, playerName: String, origin: String, lat: Double? = nil, lon: Double? = nil, recoverOnly: Bool = false) async throws -> SessionEnvelope {
        var request = URLRequest(url: baseURL.appending(path: "api/session"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(CreateSession(playerKey: playerKey, playerName: playerName, origin: origin, lat: lat, lon: lon, recoverOnly: recoverOnly))
        let (data, response) = try await transport.data(for: request)
        try validate(response, data: data)
        return try decoder.decode(SessionEnvelope.self, from: data)
    }

    func createRecoveryCode(sessionID: String) async throws -> String {
        var request = URLRequest(url: baseURL.appending(path: "api/recovery/create"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(RecoveryCreateRequest(sessionId: sessionID))
        let (data, response) = try await transport.data(for: request)
        try validate(response, data: data)
        return try decoder.decode(RecoveryCreateResponse.self, from: data).code
    }

    func recover(code: String) async throws -> SessionEnvelope {
        var request = URLRequest(url: baseURL.appending(path: "api/recovery/use"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(RecoveryRequest(code: code))
        let (data, response) = try await transport.data(for: request)
        try validate(response, data: data)
        return try decoder.decode(SessionEnvelope.self, from: data)
    }

    func state(sessionID: String) async throws -> PlayerState {
        let url = baseURL.appending(path: "api/session/\(sessionID)")
        let (data, response) = try await transport.data(from: url)
        try validate(response, data: data)
        return try decoder.decode(StateEnvelope.self, from: data).state
    }

    func presence(sessionID: String) async throws -> [Presence] {
        let url = baseURL.appending(path: "api/session/\(sessionID)/presence")
        let (data, response) = try await transport.data(from: url)
        try validate(response, data: data)
        return try decoder.decode(PresenceEnvelope.self, from: data).players
    }

    func leaderboard(sessionID: String) async throws -> LeaderboardEnvelope {
        let url = baseURL.appending(path: "api/session/\(sessionID)/leaderboard")
        let (data, response) = try await transport.data(from: url)
        try validate(response, data: data)
        return try decoder.decode(LeaderboardEnvelope.self, from: data)
    }

    func action(sessionID: String, name: String, body: ActionEnvelope = .init()) async throws -> PlayerState {
        let url = baseURL.appending(path: "api/session/\(sessionID)/\(name)")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await transport.data(for: request)
        try validate(response, data: data)
        return try decoder.decode(StateEnvelope.self, from: data).state
    }

    struct GuildEnvelope: Decodable {
        let persistent: Bool
        let guild: Guild?
        let mystery: Mystery?
        let bounties: [EchoBounty]?
        let market: [MarketListing]?
        let contracts: [PlayerOrder]?
        let state: PlayerState?
    }
    struct MarketListing: Decodable, Identifiable {
        var id: String { listing }
        let listing: String
        let seller: String
        let price: Int
        let item: Item
        let own: Bool
    }
    struct PlayerOrder: Decodable, Identifiable {
        var id: String { contract }
        let contract: String
        let author: String
        let metric: String
        let target: Int
        let payment: Int
        let status: String
        let own: Bool
        let accepted: Bool
        let progress: Int
    }
    struct ArenaEnvelope: Decodable { let record: ArenaRecord; let match: ArenaMatch? }
    struct ArenaRecord: Decodable { let wins: Int; let losses: Int; let draws: Int }
    struct ArenaFighter: Decodable { let name: String; let origin: String; let hp: Int; let focus: Int; let stamina: Int }
    struct ArenaMatch: Decodable {
        let status: String
        let invitation: String?
        let revision: Int
        let yourTurn: Bool
        let secondsLeft: Int
        let you: ArenaFighter
        let opponent: ArenaFighter?
        let result: String?
        let events: [String]
    }
    struct ArenaInput: Encodable {
        let action: String
        var code: String? = nil
        var move: String? = nil
        var revision: Int? = nil
    }
    func arena(sessionID: String, input: ArenaInput? = nil) async throws -> ArenaEnvelope {
        var request = URLRequest(url: baseURL.appending(path: "api/session/\(sessionID)/pvp"))
        if let input {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(input)
        }
        let (data, response) = try await transport.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            struct Failure: Decodable { let error: String }
            throw NSError(domain: "OrdinalArena", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: (try? decoder.decode(Failure.self, from: data).error) ?? "Arena unavailable"])
        }
        try validate(response, data: data)
        return try decoder.decode(ArenaEnvelope.self, from: data)
    }
    struct EchoBounty: Decodable, Identifiable {
        var id: String { bounty }
        let bounty: String
        let name: String
        let origin: String
        let level: Int
        let own: Bool
    }
    struct Mystery: Decodable {
        let title: String
        let stage: Int
        let complete: Bool
        let opened: Bool
        let artifact: String?
        let layer: MysteryLayer?
    }
    struct MysteryLayer: Decodable {
        let prompt: String
        let options: [String]
        let requirement: String
    }
    struct Guild: Decodable {
        let name: String
        let invitation: String?
        let role: String
        let hallLevel: Int
        let resources: Int
        let renown: Int
        let specialty: String?
        let specialtyEffect: String?
        let alliances: [String]
        let requests: [String]
        let chronicle: [String]
        let members: [GuildMember]
    }
    struct GuildMember: Decodable {
        let name: String
        let role: String
        let member: String?
    }
    struct GuildInput: Encodable {
        let action: String
        var name: String? = nil
        var code: String? = nil
        var member: String? = nil
        var specialty: String? = nil
        var choice: String? = nil
        var bounty: String? = nil
        var item: String? = nil
        var price: Int? = nil
        var listing: String? = nil
        var metric: String? = nil
        var target: Int? = nil
        var payment: Int? = nil
        var contract: String? = nil
    }
    func guild(sessionID: String, input: GuildInput? = nil) async throws -> GuildEnvelope {
        var request = URLRequest(url: baseURL.appending(path: "api/session/\(sessionID)/guild"))
        if let input {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(input)
        }
        let (data, response) = try await transport.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            struct Failure: Decodable { let error: String }
            let message = (try? decoder.decode(Failure.self, from: data).error) ?? "Guild unavailable"
            throw NSError(domain: "OrdinalGuild", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
        }
        try validate(response, data: data)
        return try decoder.decode(GuildEnvelope.self, from: data)
    }

    private func validate(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            struct Failure: Decodable { let error: String }
            let message = (try? decoder.decode(Failure.self, from: data).error) ?? "The world server could not complete this request."
            throw NSError(domain: "OrdinalAPI", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: message])
        }
    }
}
