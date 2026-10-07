import SwiftUI
import RealityKit
import ARKit
import UIKit

struct OrdinalARView: UIViewRepresentable {
    let nodes: [OrdinalAPI.FieldNode]
    var onStatus: (String) -> Void = { _ in }
    let onSelect: (OrdinalAPI.FieldNode) -> Void

    @MainActor
    final class Coordinator: NSObject, @preconcurrency ARSessionDelegate {
        weak var view: ARView?
        var nodesByID: [String: OrdinalAPI.FieldNode] = [:]
        var onSelect: ((OrdinalAPI.FieldNode) -> Void)?
        var onStatus: ((String) -> Void)?

        @objc func tapped(_ recognizer: UITapGestureRecognizer) {
            guard let view,
                  let entity = view.entity(at: recognizer.location(in: view)) else { return }

            var current: Entity? = entity
            while let candidate = current {
                if candidate.name.hasPrefix("ordinal-node:") {
                    let id = String(candidate.name.dropFirst("ordinal-node:".count))
                    if let node = nodesByID[id] {
                        UIImpactFeedbackGenerator(style: node.kind == "signal" ? .heavy : .medium).impactOccurred()
                        onSelect?(node)
                    }
                    return
                }
                current = candidate.parent
            }
        }

        func session(_ session: ARSession, didFailWithError error: Error) {
            onStatus?("Tracking failed. Close Veil and reopen it: " + error.localizedDescription)
        }

        func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
            switch camera.trackingState {
            case .normal: onStatus?("Tracking ready. Tap a contact to interact.")
            case .limited: onStatus?("Move slowly in a well-lit area to improve tracking.")
            case .notAvailable: onStatus?("Tracking unavailable. Keep the camera clear.")
            }
        }

        func sessionWasInterrupted(_ session: ARSession) { onStatus?("Camera interrupted. Tracking will resume when available.") }

        func sessionInterruptionEnded(_ session: ARSession) {
            guard let view else { return }
            for anchor in view.scene.anchors where anchor.name.hasPrefix("ordinal-field-") { view.scene.removeAnchor(anchor) }
            OrdinalARView.runTracking(on: view, reset: true)
            OrdinalARView.installFieldNodes(Array(nodesByID.values).sorted { $0.id < $1.id }, in: view)
            onStatus?("Move slowly to restore tracking.")
        }
    }

    static func dismantleUIView(_ view: ARView, coordinator: Coordinator) {
        view.session.pause()
        view.session.delegate = nil
        view.scene.anchors.removeAll()
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        context.coordinator.view = view
        context.coordinator.onSelect = onSelect
        context.coordinator.onStatus = onStatus
        context.coordinator.nodesByID = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
        view.session.delegate = context.coordinator
        view.automaticallyConfigureSession = false

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        view.addGestureRecognizer(tap)

        if ARWorldTrackingConfiguration.isSupported {
            Self.runTracking(on: view, reset: false)
            Self.installFieldNodes(nodes, in: view)
        }
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {
        context.coordinator.onSelect = onSelect
        context.coordinator.onStatus = onStatus
        context.coordinator.nodesByID = Dictionary(uniqueKeysWithValues: nodes.map { ($0.id, $0) })
        Self.installFieldNodes(nodes, in: uiView)
    }

    static func runTracking(on view: ARView, reset: Bool) {
        let configuration = ARWorldTrackingConfiguration()
        configuration.planeDetection = [.horizontal, .vertical]
        configuration.environmentTexturing = .automatic

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            configuration.sceneReconstruction = .mesh
            view.environment.sceneUnderstanding.options.insert(.occlusion)
            view.environment.sceneUnderstanding.options.insert(.collision)
        }

        let options: ARSession.RunOptions = reset ? [.resetTracking, .removeExistingAnchors] : []
        view.session.run(configuration, options: options)
    }

    static func installFieldNodes(_ nodes: [OrdinalAPI.FieldNode], in view: ARView) {
        let live = Array(nodes.filter { !$0.collected }.prefix(6))
        let wanted = Set(live.map { "ordinal-field-" + $0.id })
        for anchor in view.scene.anchors where anchor.name.hasPrefix("ordinal-field-") && !wanted.contains(anchor.name) {
            view.scene.removeAnchor(anchor)
        }
        let existing = Set(view.scene.anchors.map { $0.name })
        for (index, node) in live.enumerated() {
            if existing.contains("ordinal-field-" + node.id) { continue }
            let angle = Float(index) / Float(max(1, live.count)) * .pi * 2
            let radius: Float = node.kind == "signal" ? 1.65 : 2.2
            let fallback = SIMD3<Float>(sin(angle) * radius, -0.35, -abs(cos(angle) * radius) - 0.8)

            let nx = 0.22 + (Double(index % 3) * 0.28)
            let ny = 0.38 + (Double((index / 3) % 2) * 0.24)
            let screenPoint = CGPoint(
                x: max(1, view.bounds.width) * nx,
                y: max(1, view.bounds.height) * ny
            )
            let surface = view.raycast(
                from: screenPoint,
                allowing: .estimatedPlane,
                alignment: .any
            ).first

            var offset = matrix_identity_float4x4
            offset.columns.3 = SIMD4<Float>(fallback.x, fallback.y, fallback.z, 1)
            let placement = (view.session.currentFrame?.camera.transform ?? matrix_identity_float4x4) * offset
            let anchor = surface.map { AnchorEntity(world: $0.worldTransform) } ?? AnchorEntity(world: placement)
            anchor.name = "ordinal-field-\(node.id)"

            let color: UIColor = node.kind == "signal"
                ? UIColor(red: 0.88, green: 0.12, blue: 0.18, alpha: 0.92)
                : UIColor(red: 0.20, green: 0.90, blue: 0.82, alpha: 0.84)

            let entity = fieldEntity(for: node, color: color)
            entity.name = "ordinal-node:\(node.id)"
            entity.generateCollisionShapes(recursive: true)

            let haloMesh = MeshResource.generateSphere(radius: node.kind == "signal" ? 0.42 : 0.16)
            let haloMaterial = UnlitMaterial(color: color.withAlphaComponent(0.10))
            let halo = ModelEntity(mesh: haloMesh, materials: [haloMaterial])
            halo.name = "ordinal-node:\(node.id)"
            entity.addChild(halo)

            anchor.addChild(entity)
            view.scene.addAnchor(anchor)
        }
    }

    static func fieldEntity(for node: OrdinalAPI.FieldNode, color: UIColor) -> Entity {
        let root = Entity()
        if node.kind == "signal", let texture = try? TextureResource.load(named: "veil-stalker") {
            let sprite = ModelEntity(
                mesh: .generatePlane(width: 0.62, height: 0.82, cornerRadius: 0),
                materials: [UnlitMaterial(texture: texture)]
            )
            sprite.position.y = 0.40
            root.addChild(sprite)
            return root
        }

        let material = SimpleMaterial(color: color, isMetallic: true)
        switch node.kind {
        case "cache":
            let chest = ModelEntity(mesh: .generateBox(size: [0.24, 0.14, 0.18]), materials: [material])
            chest.position.y = 0.08
            root.addChild(chest)
            let lid = ModelEntity(mesh: .generateBox(size: [0.25, 0.06, 0.19]), materials: [material])
            lid.position.y = 0.18
            lid.orientation = simd_quatf(angle: -0.18, axis: [1, 0, 0])
            root.addChild(lid)
        case "resource":
            for (x, height) in [(-0.07 as Float, 0.26 as Float), (0, 0.38), (0.08, 0.22)] {
                let shard = ModelEntity(mesh: .generateBox(size: [0.055, height, 0.055]), materials: [material])
                shard.position = [x, height / 2, 0]
                shard.orientation = simd_quatf(angle: x * 2, axis: [0, 0, 1])
                root.addChild(shard)
            }
        case "echo":
            let core = ModelEntity(mesh: .generateSphere(radius: 0.10), materials: [UnlitMaterial(color: color)])
            root.addChild(core)
            let memory = ModelEntity(mesh: .generateBox(size: [0.03, 0.34, 0.03]), materials: [material])
            memory.orientation = simd_quatf(angle: .pi / 4, axis: [0, 0, 1])
            root.addChild(memory)
        default:
            let marker = ModelEntity(mesh: .generateBox(size: [0.16, 0.16, 0.16]), materials: [material])
            marker.orientation = simd_quatf(angle: .pi / 4, axis: [0, 1, 0])
            root.addChild(marker)
        }
        return root
    }
}
