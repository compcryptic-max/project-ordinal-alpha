import SwiftUI
import UIKit

struct NativeFieldView: View {
    @ObservedObject var world: WorldStore
    @Binding var arOpen: Bool
    @EnvironmentObject private var location: CoarseLocationService
    @State private var showProfile = false
    @State private var selectedNode: OrdinalAPI.FieldNode?

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                worldBackground
                projectedWorld(size: proxy.size)
                    .allowsHitTesting(!location.rapidTravel)

                VStack(spacing: 10) {
                    header
                    Spacer()
                    objective
                    actionBar
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

                if location.rapidTravel {
                    VStack(spacing: 6) {
                        Image(systemName: "car.fill")
                            .font(.title2)
                        Text("RAPID TRAVEL")
                            .font(.caption.monospaced().bold())
                        Text("Field interactions pause while moving at vehicle speed.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(16)
                    .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 16))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(.orange.opacity(0.30))
                    }
                    .foregroundStyle(.white)
                }
            }
        }
        .sheet(isPresented: $showProfile) {
            NativeProfileView(world: world)
        }
        .fullScreenCover(item: $selectedNode) { node in
            NativeFieldInteractionView(
                world: world,
                node: node,
                onComplete: { selectedNode = nil },
                onCancel: { selectedNode = nil }
            )
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(8))
                guard !Task.isCancelled else { break }
                await world.refresh()
            }
        }
    }

    private var worldBackground: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.04, green: 0.09, blue: 0.085),
                    Color(red: 0.035, green: 0.06, blue: 0.055),
                    .black
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            Circle()
                .fill(.white.opacity(0.12))
                .frame(width: 54, height: 54)
                .blur(radius: 1)
                .offset(x: 110, y: -260)
                .shadow(color: .white.opacity(0.16), radius: 34)

            VStack {
                Spacer()
                LinearGradient(
                    colors: [.clear, .cyan.opacity(0.04)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 360)
                .overlay {
                    FieldGrid()
                        .opacity(0.32)
                }
            }
            .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private func projectedWorld(size: CGSize) -> some View {
        if let nodes = world.state?.field {
            ForEach(nodes.filter { !$0.collected }) { node in
                Button {
                    UIImpactFeedbackGenerator(style: node.kind == "signal" ? .heavy : .light).impactOccurred()
                    if node.kind == "signal" {
                        Task { await world.act("investigate") }
                    } else {
                        selectedNode = node
                    }
                } label: {
                    FieldContact(node: node)
                }
                .position(
                    x: size.width * clamped(node.x / 100),
                    y: size.height * clamped(node.y / 100)
                )
                .accessibilityLabel(node.name ?? node.kind)
            }
        }

        ForEach(Array(world.presence.prefix(5).enumerated()), id: \.element.id) { index, player in
            regionalPresence(player, index: index)
                .position(
                    x: size.width * presenceX(player.name),
                    y: size.height * presenceY(player.name)
                )
        }

        if let apex = world.state?.region.apex, !apex.complete {
            Button {
                UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
                Task { await world.act("apex") }
            } label: {
                VStack(spacing: 4) {
                    ZStack {
                        Circle()
                            .stroke(.purple.opacity(0.45), lineWidth: 1)
                            .frame(width: 86, height: 86)
                        Circle()
                            .stroke(.purple.opacity(0.20), style: StrokeStyle(lineWidth: 1, dash: [3, 5]))
                            .frame(width: 68, height: 68)
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.title2)
                            .foregroundStyle(.purple)
                    }
                    Text("REGIONAL APEX")
                        .font(.system(size: 7, weight: .bold, design: .monospaced))
                        .foregroundStyle(.purple)
                    Text("\(apex.seals)/\(apex.target)")
                        .font(.system(size: 7, weight: .bold, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
            .position(x: size.width * 0.78, y: size.height * 0.28)
        }

        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(.cyan.opacity(0.30), lineWidth: 1)
                    .frame(width: 62, height: 28)
                Image(systemName: "location.north.fill")
                    .font(.title2)
                    .foregroundStyle(.white)
            }
            Text(world.state?.name.uppercased() ?? "WAYFARER")
                .font(.system(size: 8, weight: .bold, design: .monospaced))
        }
        .foregroundStyle(.white)
        .position(x: size.width * 0.5, y: size.height * 0.68)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 3) {
                Text(world.state?.region.name.uppercased() ?? "UNKNOWN REGION")
                    .font(.caption.monospaced().bold())
                Text((world.state?.region.stage.uppercased() ?? "UNSETTLED") + "  //  THREAT \(world.state?.region.threat ?? 0)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                showProfile = true
            } label: {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(world.worldRank.map { "WORLD #\($0)" } ?? "RATING")
                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                        .foregroundStyle(.cyan)
                    Text("\(world.state?.ordinalRating ?? 0)")
                        .font(.title3.monospaced().bold())
                    Text("LV \(world.state?.level ?? 1)  ·  \(world.state?.hp ?? 0) HP")
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
        }
        .foregroundStyle(.white)
        .padding(12)
        .background(.black.opacity(0.46), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(.white.opacity(0.07))
        }
    }

    @ViewBuilder
    private var objective: some View {
        if let item = world.state?.region.objective {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text("REGION DIRECTIVE")
                    Spacer()
                    Text("\(item.progress)/\(item.target)")
                }
                .font(.system(size: 7, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)

                Text(item.title)
                    .font(.caption.bold())

                ProgressView(value: Double(item.progress), total: Double(max(1, item.target)))
                    .tint(.cyan)
            }
            .foregroundStyle(.white)
            .padding(10)
            .background(.black.opacity(0.46), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private var actionBar: some View {
        HStack(spacing: 9) {
            action("SCAN", "scope") {
                Task { await world.act("roam") }
            }

            action("VEIL", "viewfinder") {
                arOpen = true
            }

            action("RIFT", "diamond.inset.filled") {
                Task { await world.act("rift") }
            }
        }
        .disabled(world.busy || location.rapidTravel)
    }

    private func action(_ title: String, _ icon: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.body)
                Text(title)
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
        }
        .buttonStyle(.borderedProminent)
        .tint(.white.opacity(0.11))
        .foregroundStyle(.white)
    }

    private func regionalPresence(_ player: OrdinalAPI.Presence, index: Int) -> some View {
        VStack(spacing: 2) {
            Image(systemName: "person.fill")
                .font(.caption)
            Text(player.name.uppercased())
                .font(.system(size: 6, weight: .bold, design: .monospaced))
            Text("LV \(player.level) · \(player.rating)")
                .font(.system(size: 5, design: .monospaced))
                .foregroundStyle(.secondary)
        }
        .foregroundStyle(.cyan.opacity(0.68))
        .opacity(0.78)
    }

    private func clamped(_ value: Double) -> Double {
        min(0.92, max(0.08, value))
    }

    private func stableHash(_ value: String) -> UInt64 {
        value.utf8.reduce(1469598103934665603) { hash, byte in
            (hash ^ UInt64(byte)) &* 1099511628211
        }
    }

    private func presenceX(_ name: String) -> Double {
        0.16 + Double(stableHash(name) % 68) / 100
    }

    private func presenceY(_ name: String) -> Double {
        0.31 + Double(stableHash(name + "y") % 28) / 100
    }
}

private struct FieldContact: View {
    let node: OrdinalAPI.FieldNode
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .stroke(color.opacity(0.24), lineWidth: 1)
                .frame(width: size * 1.7, height: size * 1.7)
                .scaleEffect(pulse ? 1.35 : 0.8)
                .opacity(pulse ? 0 : 0.8)

            Circle()
                .stroke(color.opacity(0.74), lineWidth: 1)
                .frame(width: size, height: size)

            Circle()
                .fill(color.opacity(0.28))
                .frame(width: size * 0.34, height: size * 0.34)

            Image(systemName: node.kind == "signal" ? "exclamationmark" : "diamond.fill")
                .font(.system(size: node.kind == "signal" ? 13 : 8, weight: .bold))
                .foregroundStyle(color)
        }
        .task {
            withAnimation(.easeOut(duration: 1.8).repeatForever(autoreverses: false)) {
                pulse = true
            }
        }
    }

    private var size: CGFloat { node.kind == "signal" ? 58 : 42 }
    private var color: Color { node.kind == "signal" ? .red : .cyan }
}

private struct FieldGrid: View {
    var body: some View {
        Canvas { context, size in
            let horizon = size.height * 0.08
            let center = CGPoint(x: size.width / 2, y: horizon)

            for i in 0..<9 {
                var path = Path()
                let x = size.width * CGFloat(i) / 8
                path.move(to: CGPoint(x: x, y: size.height))
                path.addLine(to: center)
                context.stroke(path, with: .color(.cyan.opacity(0.12)), lineWidth: 0.6)
            }

            for i in 0..<8 {
                let t = CGFloat(i) / 7
                let y = horizon + pow(t, 1.8) * (size.height - horizon)
                var path = Path()
                path.move(to: CGPoint(x: 0, y: y))
                path.addLine(to: CGPoint(x: size.width, y: y))
                context.stroke(path, with: .color(.cyan.opacity(0.09)), lineWidth: 0.6)
            }
        }
    }
}
