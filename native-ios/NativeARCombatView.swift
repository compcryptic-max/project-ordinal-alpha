import SwiftUI
import RealityKit
import ARKit
import UIKit

struct NativeARCombatView: View {
    @ObservedObject var world: WorldStore
    @EnvironmentObject private var location: CoarseLocationService
    @Environment(\.scenePhase) private var scenePhase
    var onExitAR: () -> Void = {}
    @State private var trackingReady = false
    @State private var trackingStatus = "Move slowly to establish tracking."

    private var combat: OrdinalAPI.Combat? { world.state?.combat }
    private var isHeavy: Bool { combat?.intent.localizedCaseInsensitiveContains("HEAVY") == true }
    private var reactionSeconds: Double { isHeavy ? 3.4 : 4.8 }

    var body: some View {
        ZStack {
            ARCombatScene(
                enemyName: combat?.name ?? "Hostile",
                healthFraction: Double(combat?.hp ?? 0) / Double(max(1, combat?.maxHp ?? 1)),
                urgent: isHeavy,
                onTracking: { ready, status in trackingReady = ready; trackingStatus = status },
                onMotion: { type in
                    combatAction(type, style: type == "attack" ? .heavy : type == "dodge" ? .light : .rigid)
                }
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
                Text(trackingStatus).font(.caption).padding(6).background(.black.opacity(0.5))
                Button("Use standard combat") { onExitAR() }.font(.caption)
                Spacer()
                gestureSurface
                Spacer()
                resources
                abilities
            }
            .padding(14)
        }
        .foregroundStyle(.white)
        .task(id: "\(combat?.turn ?? -1)-\(location.rapidTravel)-\(scenePhase)-\(trackingReady)-\(world.busy)") {
            guard scenePhase == .active, trackingReady, !location.rapidTravel, !world.busy, let turn = combat?.turn else { return }
            try? await Task.sleep(for: .seconds(reactionSeconds))
            guard !Task.isCancelled,
                  world.state?.combat?.turn == turn,
                  !location.rapidTravel, scenePhase == .active, trackingReady else { return }
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

            if trackingReady && scenePhase == .active && !world.busy && !location.rapidTravel {
                ARReactionBar(seconds: reactionSeconds, urgent: isHeavy)
                    .id(combat?.turn)
            } else {
                Text("REACTION PAUSED").font(.caption2.monospaced()).foregroundStyle(.secondary)
            }

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
        if intent.localizedCaseInsensitiveContains("EVADE") { return "↔ STEP PHONE SIDEWAYS" }
        if intent.localizedCaseInsensitiveContains("GUARD") { return "◇ RAISE PHONE TO GUARD" }
        return isHeavy ? "! REACT" : "THRUST PHONE TO STRIKE"
    }

    private var gestureSurface: some View {
        ZStack {
            Circle()
                .stroke(.cyan.opacity(0.65), lineWidth: 1)
                .frame(width: 64, height: 64)
            Circle().fill(.cyan).frame(width: 4, height: 4)

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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
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
        .disabled(world.busy || location.rapidTravel || !trackingReady || scenePhase != .active)
    }

    private func combatAction(_ type: String, style: UIImpactFeedbackGenerator.FeedbackStyle) {
        guard !world.busy, !location.rapidTravel, scenePhase == .active, trackingReady else { return }
        UIImpactFeedbackGenerator(style: style).impactOccurred()
        Task { await world.act("combat", type: type) }
    }
}

private struct ARCombatScene: UIViewRepresentable {
    let enemyName: String
    let healthFraction: Double
    let urgent: Bool
    let onTracking: (Bool, String) -> Void
    let onMotion: (String) -> Void

    @MainActor final class Coordinator: NSObject, @preconcurrency ARSessionDelegate {
        weak var view: ARView?
        var scene: ARCombatScene?
        var lastEnemy = ""
        var motionBaseline: simd_float4x4?
        var motionBaselineAt: TimeInterval = 0
        var lastMotionAt: TimeInterval = 0
        var lastPlacementAt: TimeInterval = 0
        var ready = false

        func report(_ isReady: Bool, _ status: String) {
            guard ready != isReady else { return }
            ready = isReady
            scene?.onTracking(isReady, status)
        }
        func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
            switch camera.trackingState {
            case .normal: break
            case .limited: report(false, "Combat paused. Move slowly in a well-lit area.")
            case .notAvailable: report(false, "Tracking unavailable. Use standard combat to continue.")
            }
        }
        func session(_ session: ARSession, didFailWithError error: Error) { report(false, "Camera failed. Use standard combat to continue.") }
        func sessionWasInterrupted(_ session: ARSession) { report(false, "Camera interrupted. Combat paused.") }
        func session(_ session: ARSession, didUpdate frame: ARFrame) {
            guard case .normal = frame.camera.trackingState else {
                motionBaseline = nil
                report(false, "Tracking limited. Combat paused.")
                return
            }
            let now = frame.timestamp
            guard let view, let scene else { return }
            if view.scene.findEntity(named: "ordinal-ar-enemy") == nil {
                if now - lastPlacementAt >= 0.5 {
                    lastPlacementAt = now
                    scene.installEnemy(in: view)
                }
                motionBaseline = nil
                report(false, "Scan the ground to place the enemy. Combat paused.")
                return
            }
            report(true, "Enemy anchored. Aim at it, then use a small phone motion.")
            guard let baseline = motionBaseline else {
                motionBaseline = frame.camera.transform
                motionBaselineAt = now
                return
            }
            guard now - motionBaselineAt >= 0.18 else { return }

            let delta = simd_mul(simd_inverse(baseline), frame.camera.transform).columns.3
            motionBaseline = frame.camera.transform
            motionBaselineAt = now
            guard now - lastMotionAt >= 0.72 else { return }

            let action: String?
            if abs(delta.x) > 0.13 {
                action = "dodge"
            } else if delta.y > 0.13 {
                action = "guard"
            } else if delta.z < -0.11, enemyIsAimedAt(in: view) {
                action = "attack"
            } else {
                action = nil
            }

            if let action {
                lastMotionAt = now
                scene.onMotion(action)
            }
        }
        private func enemyIsAimedAt(in view: ARView) -> Bool {
            guard let enemy = view.scene.findEntity(named: "ordinal-ar-enemy"),
                  let point = view.project(enemy.position(relativeTo: nil) + SIMD3<Float>(0, 0.66, 0)) else { return false }
            return hypot(point.x - view.bounds.midX, point.y - view.bounds.midY) < min(view.bounds.width, view.bounds.height) * 0.25
        }

        func sessionInterruptionEnded(_ session: ARSession) {
            guard let view, let scene else { return }
            motionBaseline = nil
            lastPlacementAt = 0
            report(false, "Re-establish the ground surface. Combat paused.")
            for anchor in view.scene.anchors where anchor.name == "ordinal-combat-anchor" {
                view.scene.removeAnchor(anchor)
            }
            OrdinalARView.runTracking(on: view, reset: true)
            scene.installEnemy(in: view)
        }
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    static func dismantleUIView(_ view: ARView, coordinator: Coordinator) {
        view.session.pause(); view.session.delegate = nil; view.scene.anchors.removeAll()
    }

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        view.automaticallyConfigureSession = false
        context.coordinator.view = view
        context.coordinator.scene = self
        context.coordinator.lastEnemy = enemyName
        view.session.delegate = context.coordinator

        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal]
        configuration.environmentTexturing = .automatic
        view.session.run(configuration)

        installEnemy(in: view)
        return view
    }

    func updateUIView(_ view: ARView, context: Context) {
        context.coordinator.scene = self
        if context.coordinator.lastEnemy != enemyName {
            context.coordinator.lastEnemy = enemyName
            installEnemy(in: view)
        }
        guard let enemy = view.scene.findEntity(named: "ordinal-ar-enemy") else {
            installEnemy(in: view)
            return
        }

        // Preserve creature scale instead of shrinking its body with health.
        enemy.scale = SIMD3<Float>(repeating: 1)
        enemy.orientation = urgent
            ? simd_quatf(angle: 0.08, axis: SIMD3<Float>(0, 0, 1))
            : simd_quatf(angle: 0, axis: SIMD3<Float>(0, 1, 0))
    }

    private func installEnemy(in view: ARView) {
        for anchor in view.scene.anchors where anchor.name == "ordinal-combat-anchor" {
            view.scene.removeAnchor(anchor)
        }

        let floorHit = view.raycast(
            from: CGPoint(x: view.bounds.midX, y: view.bounds.height * 0.62),
            allowing: .existingPlaneGeometry,
            alignment: .horizontal
        ).first
        guard let floorHit else { return }
        let anchor = AnchorEntity(world: floorHit.worldTransform)
        anchor.name = "ordinal-combat-anchor"

        let root = Entity()
        root.name = "ordinal-ar-enemy"

        if let texture = try? TextureResource.load(named: OrdinalArt.enemyAsset(for: enemyName)) {
            var spriteMaterial = UnlitMaterial()
            spriteMaterial.color = .init(tint: .white, texture: .init(texture))
            let sprite = ModelEntity(
                mesh: .generatePlane(width: 1.02, height: 1.32, cornerRadius: 0),
                materials: [spriteMaterial]
            )
            sprite.position = [0, 0.66, 0]
            root.addChild(sprite)
            anchor.addChild(root)
            view.scene.addAnchor(anchor)
            return
        }

        let dark = SimpleMaterial(color: UIColor(red: 0.07, green: 0.075, blue: 0.08, alpha: 0.96), isMetallic: true)
        let vein = SimpleMaterial(color: UIColor(red: 0.72, green: 0.08, blue: 0.12, alpha: 0.90), isMetallic: true)
        let glass = SimpleMaterial(color: UIColor(red: 0.25, green: 0.70, blue: 0.78, alpha: 0.68), isMetallic: true)
        let violet = SimpleMaterial(color: UIColor(red: 0.47, green: 0.24, blue: 0.76, alpha: 0.80), isMetallic: true)

        let kind = enemyName.lowercased()
        if kind.contains("mirehorn") {
            addQuadrupedMirehorn(to: root, dark: dark, accent: vein)
        } else if kind.contains("rift weaver") || kind.contains("riftweaver") {
            addRiftWeaver(to: root, dark: dark, accent: violet)
        } else if kind.contains("glass warden") {
            addGlassWarden(to: root, dark: dark, glass: glass)
        } else if kind.contains("hound") {
            addPaleHound(to: root, dark: dark, accent: vein)
        } else if kind.contains("revenant") {
            addRevenant(to: root, dark: dark, accent: vein)
        } else {
            addHumanoid(to: root, dark: dark, accent: vein)
        }

        let haloColor = kind.contains("rift") ? UIColor.purple : kind.contains("glass") ? UIColor.cyan : UIColor.red
        let halo = ModelEntity(
            mesh: .generateSphere(radius: 0.72),
            materials: [UnlitMaterial(color: haloColor.withAlphaComponent(0.035))]
        )
        halo.position = [0, 0.52, 0]
        root.addChild(halo)
        anchor.addChild(root)
        view.scene.addAnchor(anchor)
    }

    private func addHumanoid(to root: Entity, dark: SimpleMaterial, accent: SimpleMaterial) {
        addBox([0.42, 0.72, 0.22], at: [0, 0.48, 0], material: dark, to: root)
        addSphere(0.19, at: [0, 0.98, 0], material: dark, to: root)
        addSphere(0.045, at: [0, 0.99, 0.18], material: accent, to: root)
        for side: Float in [-1, 1] {
            addBox([0.13, 0.68, 0.13], at: [side * 0.29, 0.45, 0], angle: side * -0.20, material: dark, to: root)
            addBox([0.055, 0.50, 0.08], at: [side * 0.38, 0.17, 0], angle: side * 0.28, material: accent, to: root)
        }
    }

    private func addPaleHound(to root: Entity, dark: SimpleMaterial, accent: SimpleMaterial) {
        addBox([0.62, 0.30, 0.26], at: [0, 0.34, 0], material: dark, to: root)
        addBox([0.30, 0.28, 0.30], at: [0, 0.43, 0.34], material: dark, to: root)
        addSphere(0.04, at: [-0.08, 0.48, 0.48], material: accent, to: root)
        addSphere(0.04, at: [0.08, 0.48, 0.48], material: accent, to: root)
        for x: Float in [-0.22, 0.22] {
            for z: Float in [-0.17, 0.17] {
                addBox([0.09, 0.42, 0.09], at: [x, 0.10, z], material: dark, to: root)
            }
        }
        addBox([0.08, 0.50, 0.08], at: [0, 0.44, -0.38], angle: -0.55, material: dark, to: root)
    }

    private func addQuadrupedMirehorn(to root: Entity, dark: SimpleMaterial, accent: SimpleMaterial) {
        addBox([0.72, 0.40, 0.38], at: [0, 0.40, 0], material: dark, to: root)
        addBox([0.36, 0.36, 0.38], at: [0, 0.54, 0.40], material: dark, to: root)
        for x: Float in [-0.23, 0.23] {
            addBox([0.10, 0.52, 0.10], at: [x, 0.10, 0.16], material: dark, to: root)
            addBox([0.10, 0.52, 0.10], at: [x, 0.10, -0.20], material: dark, to: root)
            addBox([0.055, 0.48, 0.055], at: [x * 0.75, 0.76, 0.52], angle: x > 0 ? -0.52 : 0.52, material: accent, to: root)
        }
        addSphere(0.055, at: [0, 0.57, 0.59], material: accent, to: root)
    }

    private func addRiftWeaver(to root: Entity, dark: SimpleMaterial, accent: SimpleMaterial) {
        addSphere(0.28, at: [0, 0.63, 0], material: dark, to: root)
        addSphere(0.10, at: [0, 0.68, 0.24], material: accent, to: root)
        for i in 0..<6 {
            let a = Float(i) / 6 * .pi * 2
            let x = cos(a) * 0.34
            let z = sin(a) * 0.22
            addBox([0.055, 0.62, 0.055], at: [x, 0.38, z], angle: a * 0.25, material: accent, to: root)
        }
        for y: Float in [0.18, 0.63, 1.02] {
            let ring = ModelEntity(mesh: .generateSphere(radius: y == 0.63 ? 0.42 : 0.24), materials: [UnlitMaterial(color: UIColor.purple.withAlphaComponent(0.06))])
            ring.position = [0, y, 0]
            root.addChild(ring)
        }
    }

    private func addGlassWarden(to root: Entity, dark: SimpleMaterial, glass: SimpleMaterial) {
        addHumanoid(to: root, dark: dark, accent: glass)
        addBox([0.55, 0.74, 0.07], at: [-0.40, 0.48, 0.16], angle: 0.08, material: glass, to: root)
        addBox([0.07, 0.92, 0.07], at: [0.42, 0.47, 0.08], angle: -0.18, material: glass, to: root)
    }

    private func addRevenant(to root: Entity, dark: SimpleMaterial, accent: SimpleMaterial) {
        addBox([0.36, 0.82, 0.18], at: [0, 0.47, 0], material: dark, to: root)
        addSphere(0.17, at: [0, 1.02, 0], material: dark, to: root)
        for y: Float in [0.24, 0.50, 0.76] {
            addSphere(0.055, at: [0, y, 0.15], material: accent, to: root)
        }
        for side: Float in [-1, 1] {
            addBox([0.08, 0.82, 0.08], at: [side * 0.29, 0.45, 0], angle: side * 0.16, material: accent, to: root)
        }
    }

    private func addBox(_ size: SIMD3<Float>, at position: SIMD3<Float>, angle: Float = 0, material: SimpleMaterial, to root: Entity) {
        let part = ModelEntity(mesh: .generateBox(size: size), materials: [material])
        part.position = position
        if angle != 0 {
            part.orientation = simd_quatf(angle: angle, axis: SIMD3<Float>(0, 0, 1))
        }
        root.addChild(part)
    }

    private func addSphere(_ radius: Float, at position: SIMD3<Float>, material: SimpleMaterial, to root: Entity) {
        let part = ModelEntity(mesh: .generateSphere(radius: radius), materials: [material])
        part.position = position
        root.addChild(part)
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
