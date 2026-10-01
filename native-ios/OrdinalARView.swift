import SwiftUI
import RealityKit
import ARKit
import UIKit

struct OrdinalARView: UIViewRepresentable {
    let nodes: [OrdinalAPI.FieldNode]
    let onSelect: (OrdinalAPI.FieldNode) -> Void

    @MainActor
    final class Coordinator: NSObject, @preconcurrency ARSessionDelegate {
        weak var view: ARView?
        var nodesByID: [String: OrdinalAPI.FieldNode] = [:]
        var onSelect: ((OrdinalAPI.FieldNode) -> Void)?

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
            // Standard Field remains available if native tracking fails.
        }

        func sessionWasInterrupted(_ session: ARSession) {}

        func sessionInterruptionEnded(_ session: ARSession) {
            guard let view else { return }
            OrdinalARView.runTracking(on: view, reset: true)
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        context.coordinator.view = view
        context.coordinator.onSelect = onSelect
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
        for anchor in view.scene.anchors where anchor.name.hasPrefix("ordinal-field-") {
            view.scene.removeAnchor(anchor)
        }

        let live = Array(nodes.filter { !$0.collected }.prefix(6))
        for (index, node) in live.enumerated() {
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

            let anchor = surface.map { AnchorEntity(world: $0.worldTransform) } ?? AnchorEntity(world: fallback)
            anchor.name = "ordinal-field-\(node.id)"

            let size: Float = node.kind == "signal" ? 0.14 : 0.085
            let mesh = MeshResource.generateSphere(radius: size)
            let color: UIColor = node.kind == "signal"
                ? UIColor(red: 0.88, green: 0.12, blue: 0.18, alpha: 0.92)
                : UIColor(red: 0.20, green: 0.90, blue: 0.82, alpha: 0.84)

            let entity = ModelEntity(mesh: mesh, materials: [SimpleMaterial(color: color, isMetallic: true)])
            entity.name = "ordinal-node:\(node.id)"
            entity.generateCollisionShapes(recursive: true)

            let haloMesh = MeshResource.generateSphere(radius: size * 1.75)
            let haloMaterial = UnlitMaterial(color: color.withAlphaComponent(0.10))
            let halo = ModelEntity(mesh: haloMesh, materials: [haloMaterial])
            halo.name = "ordinal-node:\(node.id)"
            entity.addChild(halo)

            anchor.addChild(entity)
            view.scene.addAnchor(anchor)
        }
    }
}
