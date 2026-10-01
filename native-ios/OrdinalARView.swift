import SwiftUI
import RealityKit
import ARKit

struct OrdinalARView: UIViewRepresentable {
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
        }
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {}

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

    static func installPrototypeAnchor(in view: ARView) {
        let anchor = AnchorEntity(.plane(.horizontal, classification: .any, minimumBounds: [0.25, 0.25]))
        let mesh = MeshResource.generateSphere(radius: 0.08)
        let material = SimpleMaterial(color: .cyan.withAlphaComponent(0.72), isMetallic: true)
        let signal = ModelEntity(mesh: mesh, materials: [material])
        signal.position = [0, 0.12, 0]
        signal.generateCollisionShapes(recursive: true)
        anchor.addChild(signal)
        view.scene.addAnchor(anchor)
    }
}
