import ExpoModulesCore
import VisionCamera

/**
 * Expo Module that registers the "detectClub" frame processor plugin.
 *
 * The plugin uses a custom YOLOv8-nano-pose CoreML model to detect
 * golf club keypoints (grip and clubhead) and returns a flat [Double]
 * array of 6 values (x, y, confidence per keypoint).
 */
public class VisionCameraClubDetectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionCameraClubDetection")

    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectClub") { proxy, options in
        return ClubDetectorPlugin(proxy: proxy, options: options)
      }
    }

    Function("isAvailable") {
      return true
    }

    Function("getLatestClub") { () -> [Double]? in
      return ClubDetectorPlugin.latestClubData
    }
  }
}
