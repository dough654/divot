import ExpoModulesCore
import VisionCamera

/**
 * Expo Module that registers the "frameDiff" frame processor plugin.
 *
 * The plugin computes luminance-based frame differencing on camera frames
 * and stores the result in a thread-safe static property for JS polling.
 */
public class VisionCameraFrameDiffModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionCameraFrameDiff")

    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("frameDiff") { proxy, options in
        return FrameDiffPlugin(proxy: proxy, options: options)
      }
    }

    Function("getLatestMotion") { () -> Double? in
      return FrameDiffPlugin.latestMotion
    }
  }
}
