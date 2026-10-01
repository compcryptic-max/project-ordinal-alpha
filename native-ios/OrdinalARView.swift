import SwiftUI
import RealityKit
import ARKit
import UIKit

struct OrdinalARView: UIViewRepresentable {
    let nodes: [OrdinalAPI.FieldNode]

    final class Coordinator: NSObject, ARSessionDelegate {
        weak var view: ARView?

        func session(_ session: ARSession, didFailWithError error: Error) {
            // Native shell keeps the standard Field available if tracking fails.
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
        view.session.delegate = context.coordinator
        view.automaticallyConfigureSession = false

        if ARWorldTrackingConfiguration.isSupported {
            Self.runTracking(on: view, reset: false)
            Self.installPrototypeAnchor(in: view)
            Self.installFieldNodes(nodes, in: view)
        }
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {
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

        for (index, node) in nodes.filter({ !$0.collected }).prefix(6).enumerated() {
            let angle = Float(index) / Float(max(1, min(6, nodes.count))) * .pi * 2
            let radius: Float = node.kind == "signal" ? 1.65 : 2.2
            let position = SIMD3<Float>(sin(angle) * radius, -0.35, -abs(cos(angle) * radius) - 0.8)
            let anchor = AnchorEntity(world: position)
            anchor.name = "ordinal-field-\(node.id)"

            let size: Float = node.kind == "signal" ? 0.13 : 0.075
            let mesh = MeshResource.generateSphere(radius: size)
            let color: UIColor = node.kind == "signal"
                ? UIColor(red: 0.82, green: 0.16, blue: 0.20, alpha: 0.86)
                : UIColor(red: 0.25, green: 0.85, blue: 0.80, alpha: 0.78)
            let entity = ModelEntity(mesh: mesh, materials: [SimpleMaterial(color: color, isMetallic: true)])
            entity.generateCollisionShapes(recursive: true)
            anchor.addChild(entity)
            view.scene.addAnchor(anchor)
        }
    }

    static func installPrototypeAnchor(in view: ARView) {
        let anchor = AnchorEntity(.plane(.horizontal, classification: .any, minimumBounds: SIMD2<Float>(0.25, 0.25)))
        let mesh = MeshResource.generateSphere(radius: 0.08)
        let material = SimpleMaterial(color: UIColor.cyan.withAlphaComponent(0.72), isMetallic: true)
        let signal = ModelEntity(mesh: mesh, materials: [material])
        signal.position = [0, 0.12, 0]
        signal.generateCollisionShapes(recursive: true)
        anchor.addChild(signal)
        view.scene.addAnchor(anchor)
    }
}
