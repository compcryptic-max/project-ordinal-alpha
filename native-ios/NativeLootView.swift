import SwiftUI
import UIKit

struct NativeLootView: View {
    @ObservedObject var world: WorldStore

    private var loot: OrdinalAPI.Loot? { world.state?.pendingLoot }

    var body: some View {
        ZStack {
            RadialGradient(
                colors: [rarityColor.opacity(0.24), .black],
                center: .center,
                startRadius: 20,
                endRadius: 420
            )
            .ignoresSafeArea()

            VStack(spacing: 18) {
                Text("RELIC SIGNAL")
                    .font(.caption.monospaced().bold())
                    .foregroundStyle(rarityColor)

                Spacer()

                ZStack {
                    ForEach(0..<3, id: \.self) { ring in
                        Circle()
                            .stroke(rarityColor.opacity(0.22 - Double(ring) * 0.05), lineWidth: 1)
                            .frame(width: CGFloat(165 + ring * 42), height: CGFloat(165 + ring * 42))
                    }
                    Image(systemName: "diamond.inset.filled")
                        .font(.system(size: 90, weight: .ultraLight))
                        .foregroundStyle(rarityColor)
                        .shadow(color: rarityColor.opacity(0.6), radius: 22)
                }

                VStack(spacing: 7) {
                    Text(loot?.rarity.uppercased() ?? "RELIC")
                        .font(.caption2.monospaced().bold())
                        .foregroundStyle(rarityColor)
                    Text(loot?.name ?? "Unknown Relic")
                        .font(.title2.bold())
                        .multilineTextAlignment(.center)
                    Text("POWER \(loot?.power ?? 0)  //  \(loot?.trait.uppercased() ?? "UNKNOWN TRAIT")")
                        .font(.caption.monospaced().bold())
                        .foregroundStyle(.secondary)
                    Text("Recovered from \(loot?.source ?? "the Veil")")
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Button {
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    Task { await world.act("loot") }
                } label: {
                    Label("SECURE RELIC", systemImage: "lock.open.fill")
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                }
                .buttonStyle(.borderedProminent)
                .tint(rarityColor.opacity(0.78))
                .disabled(world.busy)
            }
            .padding(20)
        }
        .foregroundStyle(.white)
    }

    private var rarityColor: Color {
        switch loot?.rarity.lowercased() {
        case "epic": return .purple
        case "rare": return .cyan
        default: return .white
        }
    }
}

struct NativeShrineChoiceView: View {
    @ObservedObject var world: WorldStore

    var body: some View {
        ZStack {
            LinearGradient(colors: [.black, Color(red: 0.025, green: 0.09, blue: 0.08)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            VStack(spacing: 22) {
                Spacer()
                Image(systemName: "triangle.circle.fill")
                    .font(.system(size: 92, weight: .ultraLight))
                    .foregroundStyle(.cyan)
                    .shadow(color: .cyan.opacity(0.45), radius: 20)

                Text("GLASS SHRINE")
                    .font(.title2.monospaced().bold())
                Text("The relic resonates with the region. Your decision changes the shared world state.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)

                HStack(spacing: 12) {
                    choice("CLEANSE", "sparkles", "cleanse", .cyan)
                    choice("BIND", "link", "bind", .purple)
                }
                Spacer()
            }
            .padding()
        }
        .foregroundStyle(.white)
    }

    private func choice(_ title: String, _ icon: String, _ value: String, _ tint: Color) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
            Task { await world.act("choice", choice: value) }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon)
                Text(title).font(.caption.bold())
            }
            .frame(maxWidth: .infinity)
            .frame(height: 74)
        }
        .buttonStyle(.borderedProminent)
        .tint(tint.opacity(0.65))
        .disabled(world.busy)
    }
}
