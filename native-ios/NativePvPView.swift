import SwiftUI

struct NativePvPView: View {
    @ObservedObject var world: WorldStore
    @Environment(\.dismiss) private var dismiss
    @State private var arena: OrdinalAPI.ArenaEnvelope?
    @State private var invitation = ""
    @State private var busy = false
    @State private var error: String?
    @State private var confirmForfeit = false

    var body: some View {
        NavigationStack {
            Form {
                Text("Private live duels between two consenting players within three levels. Each turn lasts 45 seconds. Field health is preserved.")
                if let error { Text(error).foregroundStyle(.red) }
                if let record = arena?.record { Text("\(record.wins) wins · \(record.losses) losses · \(record.draws) draws") }
                if let match = arena?.match, match.status == "waiting" {
                    Section("Private invitation") {
                        Text(match.invitation ?? "").font(.body.monospaced()).textSelection(.enabled)
                        Text("Share this code with your opponent. Their acceptance starts the duel.")
                        Button("Cancel invitation") { Task { await request(.init(action: "cancel")) } }
                    }
                } else if let match = arena?.match, match.status == "active" {
                    Section("Live arena") {
                        Text("You: \(match.you.hp) HP · \(match.you.focus) Focus · \(match.you.stamina) stamina")
                        if let foe = match.opponent { Text("\(foe.name): \(foe.hp) HP") }
                        Text((match.yourTurn ? "Your turn" : "Opponent's turn") + " · \(match.secondsLeft) seconds")
                        Text("Guard reduces the next hit and restores stamina. Evade can avoid a hit. Skills cost 40 Focus and 20 stamina.").font(.caption)
                        ForEach(["attack", "guard", "dodge", "skill"], id: \.self) { move in
                            Button(move.capitalized) { Task { await request(.init(action: "move", move: move, revision: match.revision)) } }
                                .disabled(!match.yourTurn || busy)
                        }
                        Button("Forfeit", role: .destructive) { confirmForfeit = true }
                        ForEach(match.events.indices, id: \.self) { i in Text(match.events[i]).font(.caption) }
                    }
                } else {
                    if let result = arena?.match?.result { Text(result) }
                    Button("Create private duel") { Task { await request(.init(action: "create")) } }
                    TextField("Opponent's invitation", text: $invitation).autocorrectionDisabled().textInputAutocapitalization(.characters)
                    Button("Accept duel") { Task { await request(.init(action: "join", code: invitation)) } }
                }
            }
            .disabled(busy)
            .navigationTitle("Live PvP")
            .toolbar { Button("Done") { dismiss() } }
            .confirmationDialog("Forfeit this duel?", isPresented: $confirmForfeit) {
                Button("Forfeit", role: .destructive) { Task { await request(.init(action: "forfeit")) } }
            }
            .task {
                await request(nil)
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(1)) } catch { break }
                    if ["waiting", "active"].contains(arena?.match?.status ?? "") { await request(nil) }
                }
            }
        }
    }

    @MainActor private func request(_ input: OrdinalAPI.ArenaInput?) async {
        guard !busy, let sid = world.sessionID else { return }
        busy = true
        defer { busy = false }
        do { arena = try await OrdinalAPI.shared.arena(sessionID: sid, input: input); error = nil }
        catch { error = error.localizedDescription }
    }
}
