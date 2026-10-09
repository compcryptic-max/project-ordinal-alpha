import SwiftUI
import RealityKit
import ARKit
import UIKit

/// A local, optional AR diorama of the player's actual guild hall.
/// Guild state comes from the server; AR only renders the current hall.
struct NativeGuildHallARView: View {
    let name: String
    let level: Int
    let specialty: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .top) {
            if ARWorldTrackingConfiguration.isSupported {
                GuildHallRealityView(level: level, specialty: specialty)
                    .ignoresSafeArea()
            } else {
                Color.black.ignoresSafeArea()
                ContentUnavailableView("AR unavailable", systemImage: "camera.metering.unknown",
                                       description: Text("Your Town Hall is still available in the normal guild menu."))
            }
            VStack(spacing: 8) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(name).font(.headline)
                        Text("TOWN HALL · LEVEL \(level)")
                            .font(.caption.monospaced())
                    }
                    Spacer()
                    Button("Close") { dismiss() }
                        .buttonStyle(.borderedProminent)
                }
                Text("Move slowly in a clear, well-lit space. A miniature hall appears ahead. AR is optional and does not affect your progress.")
                    .font(.caption)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .foregroundStyle(.white)
            .padding(16)
            .background(.black.opacity(0.75))
        }
        .preferredColorScheme(.dark)
    }
}

private struct GuildHallRealityView: UIViewRepresentable {
    let level: Int
    let specialty: String?

    @MainActor
    final class Coordinator: NSObject, @preconcurrency ARSessionDelegate {
        weak var view: ARView?
        var installed = false
        var level: Int = 1
        var specialty: String?

        func session(_ session: ARSession, didUpdate frame: ARFrame) {
            guard !installed, case .normal = frame.camera.trackingState,
                  let view else { return }
            installed = true
            let translation = simd_float4x4(columns: (
                SIMD4<Float>(1, 0, 0, 0),
                SIMD4<Float>(0, 1, 0, 0),
                SIMD4<Float>(0, 0, 1, 0),
                SIMD4<Float>(0, -0.24, -1.25, 1)
            ))
            let anchor = AnchorEntity(world: simd_mul(frame.camera.transform, translation))
            GuildHallRealityView.constructHall(on: anchor, level: level, specialty: specialty)
            view.scene.addAnchor(anchor)
        }

        func sessionWasInterrupted(_ session: ARSession) {
            installed = false
            view?.scene.anchors.removeAll()
        }

        func sessionInterruptionEnded(_ session: ARSession) {
            installed = false
            view?.scene.anchors.removeAll()
            guard let view else { return }
            let config = ARWorldTrackingConfiguration()
            config.planeDetection = [.horizontal]
            view.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero)
        view.automaticallyConfigureSession = false
        context.coordinator.view = view
        context.coordinator.level = level
        context.coordinator.specialty = specialty
        view.session.delegate = context.coordinator
        if ARWorldTrackingConfiguration.isSupported {
            let config = ARWorldTrackingConfiguration()
            config.planeDetection = [.horizontal]
            view.session.run(config)
        }
        return view
    }

    func updateUIView(_ uiView: ARView, context: Context) {
        // Hall changes are reflected the next time the player opens AR.
    }

    static func dismantleUIView(_ uiView: ARView, coordinator: Coordinator) {
        uiView.session.pause()
        uiView.session.delegate = nil
        uiView.scene.anchors.removeAll()
        coordinator.view = nil
    }

    @MainActor
    static func constructHall(on anchor: AnchorEntity, level: Int, specialty: String?) {
        let tier = min(5, max(1, level))
        let stone = SimpleMaterial(color: UIColor(red: 0.19, green: 0.25, blue: 0.31, alpha: 1), isMetallic: false)
        let trim = SimpleMaterial(color: UIColor(red: 0.65, green: 0.57, blue: 0.37, alpha: 1), isMetallic: true)
        let glow = SimpleMaterial(color: UIColor(red: 0.23, green: 0.79, blue: 0.91, alpha: 1), isMetallic: true)
        let base = ModelEntity(mesh: .generateBox(size: [0.9, 0.04, 0.7]), materials: [stone])
        base.position = [0, -0.02, 0]
        anchor.addChild(base)

        let hallHeight: Float = 0.18 + Float(tier) * 0.045
        let hall = ModelEntity(mesh: .generateBox(size: [0.43, hallHeight, 0.3]), materials: [stone])
        hall.position = [0, hallHeight / 2, -0.05]
        anchor.addChild(hall)

        let roof = ModelEntity(mesh: .generateBox(size: [0.51, 0.045, 0.37]), materials: [trim])
        roof.position = [0, hallHeight + 0.025, -0.05]
        anchor.addChild(roof)

        let door = ModelEntity(mesh: .generateBox(size: [0.095, 0.15, 0.012]), materials: [glow])
        door.position = [0, 0.075, 0.106]
        anchor.addChild(door)

        for side: Float in [-1, 1] {
            let pillar = ModelEntity(mesh: .generateBox(size: [0.035, hallHeight + 0.055, 0.035]), materials: [trim])
            pillar.position = [side * 0.20, (hallHeight + 0.055) / 2, 0.115]
            anchor.addChild(pillar)
        }

        if tier >= 2 {
            for side: Float in [-1, 1] {
                let wing = ModelEntity(mesh: .generateBox(size: [0.16, 0.15, 0.22]), materials: [stone])
                wing.position = [side * 0.31, 0.075, -0.07]
                anchor.addChild(wing)
            }
        }
        if tier >= 3 {
            let tower = ModelEntity(mesh: .generateBox(size: [0.10, 0.26, 0.10]), materials: [trim])
            tower.position = [-0.32, 0.28, -0.08]
            anchor.addChild(tower)
        }
        if tier >= 4 {
            let tower = ModelEntity(mesh: .generateBox(size: [0.10, 0.26, 0.10]), materials: [trim])
            tower.position = [0.32, 0.28, -0.08]
            anchor.addChild(tower)
        }
        if tier >= 5 {
            let beacon = ModelEntity(mesh: .generateSphere(radius: 0.045), materials: [glow])
            beacon.position = [0, hallHeight + 0.13, -0.05]
            anchor.addChild(beacon)
        }

        let crest = ModelEntity(mesh: .generateSphere(radius: 0.06), materials: [
            specialty == "Sentinels" ? trim : glow
        ])
        crest.position = [0, 0.12, 0.31]
        anchor.addChild(crest)
    }
}
