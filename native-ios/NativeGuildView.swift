import SwiftUI

struct NativeGuildView: View {
    @ObservedObject var world: WorldStore
    @Environment(\.dismiss) private var dismiss
    @State private var envelope: OrdinalAPI.GuildEnvelope?
    @State private var arenaOpen = false
    @State private var exchangeOpen = false
    @State private var name = ""
    @State private var code = ""
    @State private var allianceCode = ""
    @State private var error: String?
    @State private var busy = false
    @State private var pending: OrdinalAPI.GuildInput?

    var body: some View {
        NavigationStack {
            Form {
                Section("Wayfall activities") {
                    Button("Live player duel") { arenaOpen = true }
                    Button("Exchange and player contracts") { exchangeOpen = true }
                }
                if let error { Text(error).foregroundStyle(.red) }
                if let envelope {
                    if !envelope.persistent {
                        Text("Temporary server storage: guilds reset when the server restarts.")
                    }
                    if let guild = envelope.guild {
                        Section(guild.name) {
                            Text("Town Hall · Level \(guild.hallLevel)")
                            Text(guild.role)
                            Text("\(guild.resources) supplies · \(guild.renown) renown")
                            Button("Bring field supplies") { Task { await request(.init(action: "contribute")) } }
                            if ["Leader", "Officer"].contains(guild.role), guild.hallLevel < 5 {
                                Button("Restore Hall · \(guild.hallLevel * 25) supplies") { Task { await request(.init(action: "upgrade")) } }
                            }
                            Text("Hall specialty: " + (guild.specialty ?? "Unchosen")).font(.headline)
                            Text(guild.specialtyEffect ?? "Restore Hall level 2 to choose a specialty.").font(.caption)
                            if guild.role == "Leader", guild.hallLevel >= 2 {
                                ForEach(["Pathfinders", "Sentinels", "Artisans"], id: \.self) { specialty in
                                    Button(specialty) { Task { await request(.init(action: "specialize", specialty: specialty)) } }
                                        .disabled(guild.specialty == specialty)
                                }
                            }
                            Text("Allies: " + (guild.alliances.isEmpty ? "None yet" : guild.alliances.joined(separator: ", ")))
                            if guild.role == "Leader" {
                                TextField("Other guild invitation", text: $allianceCode).autocorrectionDisabled()
                                Button("Propose alliance") { Task { await request(.init(action: "alliance", code: allianceCode)) } }
                                ForEach(guild.requests, id: \.self) { name in
                                    Button("Ally with " + name) { Task { await request(.init(action: "accept-alliance", name: name)) } }
                                }
                            }
                            if let invitation = guild.invitation {
                                Text("Private invitation")
                                Text(invitation).font(.body.monospaced()).textSelection(.enabled)
                            }
                        }
                        Section("Guild roster") {
                            ForEach(guild.members.indices, id: \.self) { index in
                                let member = guild.members[index]
                                VStack(alignment: .leading) {
                                    Text(member.name)
                                    Text(member.role).font(.caption)
                                    if let key = member.member {
                                        Button("Transfer leadership") {
                                            pending = .init(action: "transfer", member: key)
                                        }
                                        if member.role == "Member" {
                                            Button("Promote to officer") { Task { await request(.init(action: "promote", member: key)) } }
                                        } else if member.role == "Officer" {
                                            Button("Demote to member") { Task { await request(.init(action: "demote", member: key)) } }
                                        }
                                    }
                                }
                            }
                        }
                        Section("Hall chronicle") {
                            ForEach(guild.chronicle.indices, id: \.self) { i in Text(guild.chronicle[i]) }
                        }
                        Button("Leave guild", role: .destructive) { pending = .init(action: "leave") }
                    } else {
                        Section("Found a guild") {
                            TextField("Guild name", text: $name)
                            Button("Found guild") { Task { await request(.init(action: "create", name: name)) } }
                        }
                        Section("Join a guild") {
                            TextField("Private invitation", text: $code).autocorrectionDisabled()
                            Button("Join guild") { Task { await request(.init(action: "join", code: code)) } }
                        }
                        Text("Your solo story and progression stay yours.")
                    }
                } else { ProgressView("Opening Town Hall") }
                if let mystery = envelope?.mystery {
                    Section(mystery.title) {
                        if mystery.opened { Text("The First Door has opened in the shared world.") }
                        if let layer = mystery.layer {
                            Text(layer.prompt)
                            Text(layer.requirement).font(.caption)
                            ForEach(layer.options, id: \.self) { choice in
                                Button(choice.capitalized) { Task { await request(.init(action: "mystery", choice: choice)) } }
                            }
                        } else {
                            Text("You unraveled the mystery.")
                            if let artifact = mystery.artifact { Text("Your relic: " + artifact) }
                        }
                    }
                }
                Section("Voluntary Echo arena") {
                    Text("Recorded Echo duels are asynchronous and opt-in. Your field character returns unharmed. A verified win pays 20 gold and 2 reputation.")
                    Button("Offer my Echo") { Task { await request(.init(action: "create-bounty")) } }
                    ForEach(envelope?.bounties ?? []) { bounty in
                        VStack(alignment: .leading) {
                            Text(bounty.name + " · " + bounty.origin + " · Level \(bounty.level)")
                            if bounty.own { Text("Your Echo").font(.caption) }
                            else { Button("Duel Echo") { Task { await request(.init(action: "hunt-bounty", bounty: bounty.bounty)) } } }
                        }
                    }
                }
                Section("Solo sanctuary") {
                    Text("Rest, craft supplies, and trace your story from home.")
                    Text("Gold: \(world.state?.gold ?? 0)")
                    Button("Rest · 10 gold") { Task { await world.act("home", type: "rest") } }
                    Button("Craft tonic · 15 gold") { Task { await world.act("home", type: "craft") } }
                    Button("Reinforce equipped weapon") { Task { await world.act("home", type: "reinforce") } }
                    Text("+2 weapon power per reinforcement; costs 25, 50, then 75 gold. Maximum three per weapon.").font(.caption)
                    Button("Trace archive signal") { Task { await world.act("home", type: "investigate") } }
                    if let companion = world.state?.companion {
                        Text("Mossling companion").font(.headline)
                        if !companion.unlocked {
                            Text("Reach level 2 to befriend a Mossling.")
                        } else if let expedition = companion.expedition {
                            Text(companion.ready ? "Your Mossling brought back a tonic and 12 gold." : "Gathering until \(Date(timeIntervalSince1970: expedition.returnAt / 1000).formatted(date: .omitted, time: .shortened)).")
                            Button(companion.ready ? "Collect supplies" : "Check return") { Task { await world.act("home", type: "companion-claim") } }
                        } else {
                            Button("Send Mossling to gather · 2 hours") { Task { await world.act("home", type: "companion-dispatch") } }
                        }
                        Text("Progress continues while the app is closed.").font(.caption)
                    }
                    if let home = world.state?.home {
                        Text(home.npc.name).font(.headline)
                        Text(home.npc.trust > 0 ? "Sera remembers your help." : home.npc.trust < 0 ? "Sera remains wary of you." : "Sera asks for help repairing the sanctuary.")
                        Button("Help · 10 gold") { Task { await world.act("keeper", choice: "help") } }
                        Button("Decline") { Task { await world.act("keeper", choice: "refuse") } }
                        Button("Threaten") { Task { await world.act("keeper", choice: "threaten") } }
                        ForEach(home.npc.memories.indices, id: \.self) { i in Text(home.npc.memories[i]).font(.caption) }
                    }
                    if let error = world.lastError { Text(error).foregroundStyle(.red) }
                }
            }
            .disabled(busy || world.busy)
            .navigationTitle("Town Hall")
            .toolbar { Button("Done") { dismiss() } }
            .confirmationDialog("Confirm guild change", isPresented: Binding(get: { pending != nil }, set: { if !$0 { pending = nil } })) {
                Button("Confirm", role: .destructive) {
                    let action = pending; pending = nil
                    Task { await request(action) }
                }
                Button("Cancel", role: .cancel) { pending = nil }
            }
            .sheet(isPresented: $arenaOpen) { NativePvPView(world: world) }
            .sheet(isPresented: $exchangeOpen, onDismiss: { Task { await request(nil) } }) { NativeExchangeView(world: world) }
            .task { await request(nil) }
        }
    }

    @MainActor private func request(_ input: OrdinalAPI.GuildInput?) async {
        guard let sessionID = world.sessionID, !busy else { return }
        busy = true
        defer { busy = false }
        do { let result = try await OrdinalAPI.shared.guild(sessionID: sessionID, input: input); envelope = result; if let state = result.state { world.state = state }; error = nil }
        catch { self.error = error.localizedDescription }
    }
}
