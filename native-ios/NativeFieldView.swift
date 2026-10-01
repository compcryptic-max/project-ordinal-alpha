import SwiftUI

struct NativeFieldView: View {
    @ObservedObject var world: WorldStore
    @Binding var arOpen: Bool

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.02, green: 0.06, blue: 0.055), .black],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                worldLayer(size: proxy.size)

                VStack {
                    header
                    Spacer()
                    actionBar
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(world.state?.region.name.uppercased() ?? "UNKNOWN REGION")
                    .font(.caption.monospaced().bold())
                Text("THREAT \(world.state?.region.threat ?? 0)  //  RATING \(world.state?.ordinalRating ?? 0)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text("LV \(world.state?.level ?? 1)")
                    .font(.caption.monospaced().bold())
                Text("\(world.state?.hp ?? 0) / \(world.state?.maxHp ?? 0) HP")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
        .foregroundStyle(.white)
        .padding(12)
        .background(.black.opacity(0.48), in: RoundedRectangle(cornerRadius: 14))
    }

    @ViewBuilder
    private func worldLayer(size: CGSize) -> some View {
        if let nodes = world.state?.field {
            ForEach(nodes.filter { !$0.collected }) { node in
                Button {
                    Task {
                        if node.kind == "signal" {
                            await world.act("investigate")
                        } else {
                            await world.act("collect", id: node.id)
                        }
                    }
                } label: {
                    ZStack {
                        Circle()
                            .stroke(node.kind == "signal" ? .red.opacity(0.75) : .cyan.opacity(0.55), lineWidth: 1)
                            .frame(width: node.kind == "signal" ? 58 : 42, height: node.kind == "signal" ? 58 : 42)
                        Circle()
                            .fill(node.kind == "signal" ? .red.opacity(0.30) : .cyan.opacity(0.22))
                            .frame(width: 16, height: 16)
                    }
                }
                .position(
                    x: size.width * clamped(node.x / 100),
                    y: size.height * clamped(node.y / 100)
                )
                .accessibilityLabel(node.name ?? node.kind)
            }
        }

        VStack(spacing: 4) {
            Image(systemName: "location.north.fill")
                .font(.title2)
            Text(world.state?.name.uppercased() ?? "WAYFARER")
                .font(.caption2.monospaced().bold())
        }
        .foregroundStyle(.white)
        .position(x: size.width * 0.5, y: size.height * 0.72)
    }

    private var actionBar: some View {
        HStack(spacing: 12) {
            Button {
                Task { await world.act("roam") }
            } label: {
                Label("SCAN", systemImage: "scope")
            }

            Button {
                arOpen = true
            } label: {
                Label("VEIL", systemImage: "viewfinder")
            }

            Button {
                Task { await world.act("rift") }
            } label: {
                Label("RIFT", systemImage: "diamond.inset.filled")
            }
        }
        .buttonStyle(.borderedProminent)
        .tint(.white.opacity(0.16))
        .foregroundStyle(.white)
        .font(.caption.bold())
        .disabled(world.busy)
    }

    private func clamped(_ value: Double) -> Double {
        min(0.92, max(0.08, value))
    }
}
