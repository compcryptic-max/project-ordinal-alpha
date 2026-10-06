import SwiftUI

struct NativeExchangeView: View {
    @ObservedObject var world: WorldStore
    @Environment(\.dismiss) private var dismiss
    @State private var envelope: OrdinalAPI.GuildEnvelope?
    @State private var item = ""
    @State private var price = 25
    @State private var metric = "hunt"
    @State private var target = 3
    @State private var payment = 10
    @State private var busy = false
    @State private var error: String?
    private var relics: [OrdinalAPI.Item] {
        (world.state?.inventory ?? []).filter { ($0.power ?? 0) > 0 && $0.qty == nil && $0.id != world.state?.equipment.weapon }
    }
    var body: some View {
        NavigationStack {
            Form {
                Text("Gold: \(world.state?.gold ?? 0)")
                if let error { Text(error).foregroundStyle(.red) }
                Section("List a relic") {
                    Text("Listed relics are held until sold or cancelled.")
                    Picker("Relic", selection: $item) {
                        Text("Choose relic").tag("")
                        ForEach(relics) { relic in Text(relic.name).tag(relic.id) }
                    }
                    TextField("Price", value: $price, format: .number).keyboardType(.numberPad)
                    Button("List relic") { Task { await request(.init(action: "list-item", item: item, price: price)) } }
                }
                Section("Wayfall Exchange") {
                    ForEach(envelope?.market ?? []) { listing in
                        VStack(alignment: .leading) {
                            Text(listing.item.name)
                            Text("\(listing.seller) · \(listing.price) gold").font(.caption)
                            Button(listing.own ? "Cancel listing" : "Buy relic") {
                                Task { await request(.init(action: listing.own ? "cancel-listing" : "buy-item", listing: listing.listing)) }
                            }
                        }
                    }
                }
                Section("Fund player contract") {
                    Text("Rewards are paid upfront. Only new work after acceptance counts.")
                    Picker("Work", selection: $metric) {
                        Text("Hunt hostiles").tag("hunt")
                        Text("Chart discoveries").tag("discover")
                        Text("Field work").tag("field")
                    }
                    Stepper("Target: \(target)", value: $target, in: 1...25)
                    Stepper("Reward: \(payment) gold", value: $payment, in: 5...500, step: 5)
                    Button("Fund contract") { Task { await request(.init(action: "post-contract", metric: metric, target: target, payment: payment)) } }
                }
                Section("Player contracts") {
                    ForEach(envelope?.contracts ?? []) { order in orderRow(order) }
                }
            }
            .disabled(busy || world.busy)
            .navigationTitle("Wayfall Exchange")
            .toolbar { Button("Done") { dismiss() }; Button("Refresh") { Task { await request(nil) } } }
            .task { await request(nil) }
        }
    }
    @ViewBuilder private func orderRow(_ order: OrdinalAPI.PlayerOrder) -> some View {
        VStack(alignment: .leading) {
            Text("\(order.metric.capitalized) · \(order.target) · \(order.payment) gold")
            Text(order.author).font(.caption)
            if order.accepted {
                Text("\(order.progress) / \(order.target)")
                Button("Claim reward") { Task { await request(.init(action: "claim-contract", contract: order.contract)) } }.disabled(order.progress < order.target)
                Button("Abandon") { Task { await request(.init(action: "abandon-contract", contract: order.contract)) } }
            } else if order.own {
                if order.status == "open" { Button("Cancel and refund") { Task { await request(.init(action: "cancel-contract", contract: order.contract)) } } }
                else { Text("Work in progress") }
            } else { Button("Accept contract") { Task { await request(.init(action: "accept-contract", contract: order.contract)) } } }
        }
    }
    @MainActor private func request(_ input: OrdinalAPI.GuildInput?) async {
        guard !busy, let sid = world.sessionID else { return }
        busy = true
        defer { busy = false }
        do {
            envelope = try await OrdinalAPI.shared.guild(sessionID: sid, input: input)
            if let state = envelope?.state { world.state = state }
            if !relics.contains(where: { $0.id == item }) { item = "" }
            error = nil
        } catch { error = error.localizedDescription }
    }
}
