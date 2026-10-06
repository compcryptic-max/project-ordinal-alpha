import SwiftUI

struct NativeGearView: View {
    @ObservedObject var world: WorldStore

    var body: some View {
        List {
            Section("WEAPON MASTERY") {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(world.state?.mastery.name ?? "Unproven")
                            .font(.headline)
                        Text("RANK \(world.state?.mastery.rank ?? 1)")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        Text("\(world.state?.mastery.xp ?? 0) / \(world.state?.mastery.next ?? 1)")
                            .font(.caption.monospaced().bold())
                        Text("MASTERY XP")
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                    }
                }

                ProgressView(
                    value: Double(world.state?.mastery.xp ?? 0),
                    total: Double(max(1, world.state?.mastery.next ?? 1))
                )
                .tint(.cyan)
            }

            Section("INVENTORY") {
                ForEach(world.state?.inventory ?? []) { item in
                    itemRow(item)
                }
            }
        }
        .navigationTitle("Gear")
    }

    @ViewBuilder
    private func itemRow(_ item: OrdinalAPI.Item) -> some View {
        let equipped = world.state?.equipment.weapon == item.id
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 9)
                    .fill(rarityColor(item.rarity).opacity(0.10))
                    .frame(width: 44, height: 44)
                Image(systemName: item.qty != nil ? "cross.case.fill" : "diamond.fill")
                    .foregroundStyle(rarityColor(item.rarity))
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(item.name)
                        .font(.subheadline.bold())
                    if equipped {
                        Text("EQUIPPED")
                            .font(.system(size: 7, weight: .bold, design: .monospaced))
                            .foregroundStyle(.cyan)
                    }
                }

                HStack(spacing: 8) {
                    Text(item.rarity.uppercased())
                        .foregroundStyle(rarityColor(item.rarity))
                    if let power = item.power {
                        Text("PWR \(power)")
                    }
                    if let qty = item.qty {
                        Text("×\(qty)")
                    }
                }
                .font(.caption2.monospaced())

                if let history = item.history, !history.isEmpty {
                    DisclosureGroup("Item story") {
                        ForEach(history.indices, id: \.self) { i in Text(history[i]).font(.caption) }
                    }
                }

                if let trait = item.trait {
                    Text(trait)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if item.power != nil && !equipped {
                Button("EQUIP") {
                    Task { await world.act("equip", id: item.id) }
                }
                .font(.caption2.bold())
                .buttonStyle(.bordered)
                .disabled(world.busy)
            }
        }
        .padding(.vertical, 2)
    }

    private func rarityColor(_ rarity: String) -> Color {
        switch rarity.lowercased() {
        case "epic": return .purple
        case "rare": return .cyan
        case "uncommon": return .green
        default: return .secondary
        }
    }
}
