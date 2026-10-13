import ARKit
import RealityKit

/// Use the best supported AR occlusion mode without requiring a LiDAR phone.
/// People segmentation works on supported non-LiDAR iPhones; scene mesh is
/// enabled only when ARKit reports scene reconstruction support.
enum OrdinalAROcclusion {
    @MainActor
    static func configure(_ configuration: ARWorldTrackingConfiguration, view: ARView) {
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentationWithDepth) {
            configuration.frameSemantics.insert(.personSegmentationWithDepth)
        } else if ARWorldTrackingConfiguration.supportsFrameSemantics(.personSegmentation) {
            configuration.frameSemantics.insert(.personSegmentation)
        }

        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            configuration.sceneReconstruction = .mesh
            view.environment.sceneUnderstanding.options.insert(.occlusion)
            view.environment.sceneUnderstanding.options.insert(.collision)
        }
    }
}
