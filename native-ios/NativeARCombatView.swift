import SwiftUI
import RealityKit
import ARKit
import UIKit

struct NativeARCombatView: View {
    @ObservedObject var world: WorldStore
    @EnvironmentObject private var location: CoarseLocationService

    private var combat: OrdinalAPI.Combat? { world.state?.combat }
    private var isHeavy: Bool { combat?.intent.localizedCaseInsensitiveContains("HEAVY") == true }
    private var reactionSeconds: Double { isHeavy ? 3.4 : 4.8 }

    var body: some View {
        ZStack {
            ARCombatScene(
                enemyName: combat?.name ?? "Hostile",
                healthFraction: Double(combat?.hp ?? 0) / Double(max(1, combat?.maxHp ?? 1)),
                urgent: isHeavy
            )
            .ignoresSafeArea()

            LinearGradient(
                colors: [.black.opacity(0.58), .clear, .black.opacity(0.62)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
            .allowsHitTesting(false)

            VStack(spacing: 12) {
                combatHUD
                Spacer()
                gestureSurface
                Spacer()
                resources
                abilities
            }
            .padding(14)
        }
        .foregroundStyle(.white)
        .task(id: "\(combat?.turn ?? -1)-\(location.rapidTravel)") {
            guard !location.rapidTravel, let turn = combat?.turn else { return }
            try? await Task.sleep(for: .seconds(reactionSeconds))
            guard !Task.isCancelled,
                  world.state?.combat?.turn == turn,
                  !location.rapidTravel else { return }
            await world.act("combat", type: "idle")
        }
    }

    private var combatHUD: some View {
        VStack(spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ORDINAL // AR ENGAGEMENT")
                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                        .foregroundStyle(.cyan)
                    Text(combat?.name.uppercased() ?? "HOSTILE")
                        .font(.caption.monospaced().bold())
                }

                Spacer()

                Text(combat?.rift == true ? "RIFT \(combat?.riftWave ?? 1)/3" : "PHASE \(combat?.phase ?? 1)")
                    .font(.caption2.monospaced().bold())
            }

            ARReactionBar(seconds: reactionSeconds, urgent: isHeavy)
                .id(combat?.turn)

            HStack {
                Text(reactionPrompt)
                    .font(.caption.monospaced().bold())
                    .foregroundStyle(isHeavy ? .red : .white)
                Spacer()
                Text("\(combat?.hp ?? 0) / \(combat?.maxHp ?? 1)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(11)
        .background(.black.opacity(0.48), in: RoundedRectangle(cornerRadius: 13))
    }

    private var reactionPrompt: String {
        let intent = combat?.intent ?? ""
        if intent.localizedCaseInsensitiveContains("EVADE") { return "↔ SWIPE TO EVADE" }
        if intent.localizedCaseInsensitiveContains("GUARD") { return "◇ HOLD TO GUARD" }
        return isHeavy ? "! REACT" : "TAP TO STRIKE"
    }

    private var gestureSurface: some View {
        ZStack {
            Circle()
                .stroke(isHeavy ? .red.opacity(0.54) : .cyan.opacity(0.20), lineWidth: 1)
                .frame(width: 240, height: 240)

            Circle()
                .fill(.clear)
                .frame(width: 230, height: 230)

            if isHeavy {
                VStack(spacing: 3) {
                    Text(reactionPrompt.hasPrefix("↔") ? "↔" : reactionPrompt.hasPrefix("◇") ? "◇" : "!")
                        .font(.system(size: 52, weight: .thin, design: .monospaced))
                    Text(reactionPrompt.replacingOccurrences(of: "↔ ", with: "").replacingOccurrences(of: "◇ ", with: "").replacingOccurrences(of: "! ", with: ""))
                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                }
                .foregroundStyle(.red.opacity(0.9))
                .allowsHitTesting(false)
            }
        }
        .contentShape(Circle())
        .gesture(
            LongPressGesture(minimumDuration: 0.45)
                .exclusively(before: TapGesture())
                .onEnded { result in
                    switch result {
                    case .first: combatAction("guard", style: .rigid)
                    case .second: combatAction("attack", style: .medium)
                    }
                }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 36)
                .onEnded { value in
                    if hypot(value.translation.width, value.translation.height) > 52 {
                        combatAction("dodge", style: .light)
                    }
                }
        )
    }

    private var resources: some View {
        HStack {
            Label("\(world.state?.hp ?? 0) HP", systemImage: "heart.fill")
            Spacer()
            Text("STA \(combat?.stamina ?? 0)")
            Spacer()
            Text("FOC \(combat?.focus ?? 0)")
        }
        .font(.caption2.monospaced().bold())
        .padding(.horizontal, 4)
    }

    private var abilities: some View {
        HStack(spacing: 10) {
            ability("SKILL", "sparkles", "skill")
            ability("TONIC", "cross.case.fill", "potion")
            ability("EXIT", "figure.run", "retreat")
        }
    }

    private func ability(_ label: String, _ icon: String, _ type: String) -> some View {
        Button {
            combatAction(type, style: type == "skill" ? .heavy : .soft)
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                Text(label)
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 48)
        }
        .buttonStyle(.borderedProminent)
        .tint(.black.opacity(0.56))
        .disabled(world.busy || location.rapidTravel)
    }

    private func combatAction(_ type: String, style: UIImpactFeedbackGenerator.FeedbackStyle) {
        guard !world.busy, !location.rapidTravel else { return }
        UIImpactFeedbackGenerator(style: style).impactOccurred()
        Task { await world.act("combat", type: type) }
    }
}

private struct ARCombatScene: UIViewRepresentable {
    let enemyName: String
    let healthFraction: Double
    let urgent: Bool

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        view.automaticallyConfigureSession = false

        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal]
        configuration.environmentTexturing = .automatic
        view.session.run(configuration)

        installEnemy(in: view)
        return view
    }

    func updateUIView(_ view: ARView, context: Context) {
        guard let enemy = view.scene.findEntity(named: "ordinal-ar-enemy") else {
            installEnemy(in: view)
            return
        }

        let fraction = Float(max(0.35, min(1, healthFraction)))
        enemy.scale = SIMD3<Float>(repeating: fraction)
        enemy.orientation = urgent
            ? simd_quatf(angle: 0.08, axis: SIMD3<Float>(0, 0, 1))
            : simd_quatf(angle: 0, axis: SIMD3<Float>(0, 1, 0))
    }

    private func installEnemy(in view: ARView) {
        for anchor in view.scene.anchors where anchor.name == "ordinal-combat-anchor" {
            view.scene.removeAnchor(anchor)
        }

        let anchor = AnchorEntity(world: SIMD3<Float>(0, -0.45, -1.7))
        anchor.name = "ordinal-combat-anchor"

        let root = Entity()
        root.name = "ordinal-ar-enemy"

        let dark = SimpleMaterial(color: UIColor(red: 0.07, green: 0.075, blue: 0.08, alpha: 0.96), isMetallic: true)
        let vein = SimpleMaterial(color: UIColor(red: 0.72, green: 0.08, blue: 0.12, alpha: 0.90), isMetallic: true)

        let torso = ModelEntity(mesh: .generateBox(size: SIMD3<Float>(0.42, 0.72, 0.22)), materials: [dark])
        torso.position = [0, 0.48, 0]
        root.addChild(torso)

        let head = ModelEntity(mesh: .generateSphere(radius: 0.19), materials: [dark])
        head.position = [0, 0.98, 0]
        root.addChild(head)

        let eye = ModelEntity(mesh: .generateSphere(radius: 0.045), materials: [vein])
        eye.position = [0, 0.99, 0.18]
        root.addChild(eye)

        for side: Float in [-1, 1] {
            let arm = ModelEntity(mesh: .generateBox(size: SIMD3<Float>(0.13, 0.68, 0.13)), materials: [dark])
            arm.position = [side * 0.29, 0.45, 0]
            arm.orientation = simd_quatf(angle: side * -0.20, axis: SIMD3<Float>(0, 0, 1))
            root.addChild(arm)

            let blade = ModelEntity(mesh: .generateBox(size: SIMD3<Float>(0.055, 0.50, 0.08)), materials: [vein])
            blade.position = [side * 0.38, 0.17, 0]
            blade.orientation = simd_quatf(angle: side * 0.28, axis: SIMD3<Float>(0, 0, 1))
            root.addChild(blade)
        }

        let halo = ModelEntity(
            mesh: .generateSphere(radius: 0.72),
            materials: [UnlitMaterial(color: UIColor.red.withAlphaComponent(0.035))]
        )
        halo.position = [0, 0.52, 0]
        root.addChild(halo)

        anchor.addChild(root)
        view.scene.addAnchor(anchor)
    }
}

private struct ARReactionBar: View {
    let seconds: Double
    let urgent: Bool
    @State private var remaining = 1.0

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.08))
                Capsule()
                    .fill(urgent ? .red : .cyan)
                    .frame(width: proxy.size.width * remaining)
            }
        }
        .frame(height: 4)
        .task {
            remaining = 1
            withAnimation(.linear(duration: seconds)) {
                remaining = 0
            }
        }
    }
}
