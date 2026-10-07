import SwiftUI
import UIKit
import ARKit
import AVFoundation

struct NativeFieldView: View {
    @ObservedObject var world: WorldStore
    @Binding var arOpen: Bool
    @EnvironmentObject private var location: CoarseLocationService
    @StateObject private var spatial = SpatialFieldService()
    @State private var showProfile = false
    @State private var showGuild = false
    @State private var selectedNode: OrdinalAPI.FieldNode?
    @State private var roamMode = false
    @State private var moveVector = CGSize.zero
    @State private var playerX = 0.50
    @State private var playerY = 0.68
    @State private var proximityLocked = false
    @State private var nearestStatus = "ACQUIRING POSITION"
    @State private var lastActivatedNode: String?

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                NativeWorldMapView(contacts: spatial.contacts, heading: location.heading)
                    .ignoresSafeArea()
                    .saturation(0.45)
                    .brightness(-0.18)

                LinearGradient(
                    colors: [.black.opacity(0.52), .clear, .black.opacity(0.72)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()
                .allowsHitTesting(false)

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
        .alert("Ordinal", isPresented: Binding(get: { world.lastError != nil }, set: { if !$0 { world.lastError = nil } })) {
            Button("OK") { world.lastError = nil }
        } message: { Text(world.lastError ?? "") }
        .sheet(isPresented: $showGuild) {
            NativeGuildView(world: world)
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
        .onChange(of: location.rapidTravel) { _, rapid in
            if rapid {
                roamMode = false
                moveVector = .zero
                selectedNode = nil
            }
        }
        .task(id: location.sampleToken) {
            synchronizeSpatialField()
            await checkPhysicalProximity()
        }
        .task(id: spatialContentID) {
            synchronizeSpatialField()
            await checkPhysicalProximity()
        }
        .task(id: movementTaskID) {
            guard roamMode else { return }
            while !Task.isCancelled && roamMode {
                if abs(moveVector.width) > 0.01 || abs(moveVector.height) > 0.01 {
                    playerX = min(0.93, max(0.07, playerX + moveVector.width * 0.0038))
                    playerY = min(0.80, max(0.24, playerY + moveVector.height * 0.0038))
                    await checkProximity()
                }
                try? await Task.sleep(for: .milliseconds(16))
            }
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
                .accessibilityLabel(node.label)
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
                        OrdinalEnemyArt(name: apex.name)
                            .frame(width: 110, height: 110)
                            .shadow(color: .purple.opacity(0.42), radius: 12)
                    }
                    Text("REGIONAL APEX")
                        .font(.system(size: 7, weight: .bold, design: .monospaced))
                        .foregroundStyle(.purple)
                    Text("DISCOVERED THREAT")
                        .font(.system(size: 7, weight: .bold, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)
            .position(x: size.width * 0.78, y: size.height * 0.28)
        }

        VStack(spacing: 4) {
            ZStack {
                Ellipse()
                    .fill(.black.opacity(0.55))
                    .frame(width: 54, height: 15)
                    .offset(y: 28)
                OrdinalWayfarerArt(origin: world.state?.origin ?? "Rogue")
                    .frame(width: 66, height: 82)
            }
            Text(world.state?.name.uppercased() ?? "WAYFARER")
                .font(.system(size: 8, weight: .bold, design: .monospaced))
        }
        .foregroundStyle(.white)
        .position(x: size.width * playerX, y: size.height * playerY)
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

            Button("GUILD") { showGuild = true }
                .font(.caption.bold())
                .frame(minHeight: 44)

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
        if let item = world.state?.journey {
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text("YOUR STORY")
                    Spacer()
                    Text("CHAPTER \(item.chapter)")
                }
                .font(.system(size: 7, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)

                Text(item.title)
                    .font(.caption.bold())

                ProgressView(value: Double(item.progress), total: Double(max(1, item.next)))
                    .tint(.cyan)
            }
            .foregroundStyle(.white)
            .padding(10)
            .background(.black.opacity(0.46), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    @ViewBuilder
    private var actionBar: some View {
        VStack(spacing: 8) {
            HStack {
                Image(systemName: "location.fill")
                    .foregroundStyle(.cyan)
                Text(nearestStatus)
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                Spacer()
                if let accuracy = location.horizontalAccuracy {
                    Text("±\(Int(accuracy.rounded()))M")
                        .font(.system(size: 7, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 4)

            HStack(spacing: 9) {
                action("VEIL", "viewfinder") {
                    Task { await openVeil() }
                }

                action("RIFT", "diamond.inset.filled") {
                    Task { await world.act("rift") }
                }
            }
        }
        .padding(10)
        .background(.black.opacity(0.68), in: RoundedRectangle(cornerRadius: 14))
        .disabled(world.busy || location.rapidTravel)
    }

    @MainActor private func openVeil() async {
        guard ARWorldTrackingConfiguration.isSupported else { world.lastError = "This device does not support native AR."; return }
        let allowed: Bool
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: allowed = true
        case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .video)
        default: allowed = false
        }
        guard allowed else { world.lastError = "Enable Camera for Ordinal in iPhone Settings to open Veil."; return }
        arOpen = true
    }

    private var movementTaskID: String {
        "\(roamMode)-\(Int(moveVector.width * 100))-\(Int(moveVector.height * 100))"
    }

    private var spatialContentID: String {
        let region = world.state?.region.key ?? "none"
        let nodes = world.state?.field?.map { "\($0.id):\($0.collected)" }.joined(separator: "|") ?? ""
        return region + nodes
    }

    private func synchronizeSpatialField() {
        guard let coordinate = location.coordinate,
              let state = world.state else { return }
        spatial.synchronize(nodes: state.field ?? [], regionKey: state.region.key, around: coordinate)
    }

    @MainActor
    private func checkPhysicalProximity() async {
        guard !location.rapidTravel,
              !world.busy,
              selectedNode == nil,
              let coordinate = location.coordinate,
              let nearest = spatial.nearest(to: coordinate) else {
            nearestStatus = location.coordinate == nil ? "ACQUIRING POSITION" : "NO LIVE CONTACTS"
            return
        }

        let meters = Int(nearest.1.rounded())
        nearestStatus = "\(nearest.0.node.label.uppercased()) · \(meters)M"

        if nearest.1 > 30, lastActivatedNode == nearest.0.id {
            lastActivatedNode = nil
        }

        let accuracy = location.horizontalAccuracy ?? 100
        guard accuracy <= 35, nearest.1 <= max(14, accuracy * 0.72), lastActivatedNode != nearest.0.id else { return }
        lastActivatedNode = nearest.0.id
        UINotificationFeedbackGenerator().notificationOccurred(.success)

        if nearest.0.node.kind == "signal" {
            await world.act("investigate")
        } else {
            selectedNode = nearest.0.node
        }
    }

    @MainActor
    private func checkProximity() async {
        guard roamMode, !proximityLocked, !world.busy, selectedNode == nil else { return }
        let live = world.state?.field?.filter { !$0.collected } ?? []
        guard let nearest = live.min(by: { projectedDistance($0) < projectedDistance($1) }) else { return }
        let distance = projectedDistance(nearest)

        if distance > 0.095 {
            proximityLocked = false
            return
        }

        guard distance < 0.065 else { return }
        proximityLocked = true
        moveVector = .zero
        roamMode = false
        UIImpactFeedbackGenerator(style: nearest.kind == "signal" ? .heavy : .medium).impactOccurred()

        if nearest.kind == "signal" {
            await world.act("investigate")
        } else {
            selectedNode = nearest
        }
    }

    private func projectedDistance(_ node: OrdinalAPI.FieldNode) -> Double {
        let nx = clamped(node.x / 100)
        let ny = clamped(node.y / 100)
        return hypot(nx - playerX, ny - playerY)
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


private struct NativeFieldJoystick: View {
    @Binding var vector: CGSize
    @State private var knob = CGSize.zero

    private let radius: CGFloat = 42

    var body: some View {
        ZStack {
            Circle()
                .fill(.black.opacity(0.52))
                .overlay {
                    Circle().stroke(.cyan.opacity(0.22), lineWidth: 1)
                }

            Circle()
                .fill(.cyan.opacity(0.18))
                .overlay {
                    Circle().stroke(.cyan.opacity(0.42), lineWidth: 1)
                }
                .frame(width: 48, height: 48)
                .offset(knob)

            Circle()
                .stroke(.cyan.opacity(0.10), style: StrokeStyle(lineWidth: 1, dash: [2, 5]))
                .frame(width: 72, height: 72)
        }
        .frame(width: 100, height: 100)
        .contentShape(Circle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    let dx = value.translation.width
                    let dy = value.translation.height
                    let length = max(1, hypot(dx, dy))
                    let scale = min(1, radius / length)
                    knob = CGSize(width: dx * scale, height: dy * scale)
                    vector = CGSize(width: knob.width / radius, height: knob.height / radius)
                }
                .onEnded { _ in
                    withAnimation(.easeOut(duration: 0.12)) {
                        knob = .zero
                    }
                    vector = .zero
                }
        )
        .accessibilityLabel("Field movement")
    }
}
