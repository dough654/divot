import ExpoModulesCore
import VisionCamera

/**
 * Expo Module that registers the "detectPose" frame processor plugin.
 *
 * The plugin uses Apple's Vision framework VNDetectHumanBodyPoseRequest
 * to detect 14 body joints and returns a flat [Double] array of 42 values
 * (x, y, confidence per joint).
 */
public class VisionCameraPoseDetectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionCameraPoseDetection")

    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectPose") { proxy, options in
        return PoseDetectorPlugin(proxy: proxy, options: options)
      }
    }

    Function("isAvailable") {
      return true
    }

    Function("getLatestPose") { () -> [Double]? in
      return PoseDetectorPlugin.latestPoseData
    }
  }
}
