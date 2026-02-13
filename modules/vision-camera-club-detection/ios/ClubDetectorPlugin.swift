import VisionCamera

/**
 * VisionCamera frame processor plugin that runs a custom YOLOv8-nano-pose
 * CoreML model on each camera frame to detect golf club keypoints.
 *
 * Registered as "detectClub" — called from JS via:
 *   `VisionCameraProxy.initFrameProcessorPlugin('detectClub')`
 *
 * Returns a flat array of 6 Doubles (2 keypoints × [x, y, confidence]):
 *   [grip_x, grip_y, grip_conf, head_x, head_y, head_conf]
 * or nil if no club was detected.
 *
 * Stores the latest result in a thread-safe static property so the
 * Expo module can expose it to JS via synchronous polling (avoids the
 * broken react-native-worklets `runOnJS` serialization in VisionCamera's
 * frame processor context).
 */
@objc(ClubDetectorPlugin)
class ClubDetectorPlugin: FrameProcessorPlugin {

  private let detector = CoreMLClubDetector()

  // Thread-safe storage for latest club result.
  // Written from the frame processor thread, read from JS thread via Expo module.
  private static let lock = NSLock()
  private static var _latestClubData: [Double]?

  static var latestClubData: [Double]? {
    get {
      lock.lock()
      defer { lock.unlock() }
      return _latestClubData
    }
    set {
      lock.lock()
      defer { lock.unlock() }
      _latestClubData = newValue
    }
  }

  override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = nil) {
    super.init(proxy: proxy, options: options)
  }

  override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    let buffer = frame.buffer
    let orientation = frame.orientation

    guard let result = detector.detectClub(sampleBuffer: buffer, orientation: orientation) else {
      ClubDetectorPlugin.latestClubData = nil
      return nil
    }

    ClubDetectorPlugin.latestClubData = result
    return result
  }
}
