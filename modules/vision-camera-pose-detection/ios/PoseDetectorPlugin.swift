import VisionCamera

/**
 * VisionCamera frame processor plugin that runs MediaPipe Pose Landmarker
 * on each camera frame.
 *
 * Registered as "detectPose" — called from JS via:
 *   `VisionCameraProxy.initFrameProcessorPlugin('detectPose')`
 *
 * Returns a flat array of 42 Doubles (14 joints × [x, y, confidence]),
 * or nil if no pose was detected.
 *
 * Also stores the latest result in a thread-safe static property so the
 * Expo module can expose it to JS via synchronous polling (avoids the
 * broken react-native-worklets `runOnJS` serialization in VisionCamera's
 * frame processor context).
 */
@objc(PoseDetectorPlugin)
class PoseDetectorPlugin: FrameProcessorPlugin {

  private let detector = MediaPipePoseDetector()

  // Thread-safe storage for latest pose result.
  // Written from the frame processor thread, read from JS thread via Expo module.
  private static let lock = NSLock()
  private static var _latestPoseData: [Double]?

  static var latestPoseData: [Double]? {
    get {
      lock.lock()
      defer { lock.unlock() }
      return _latestPoseData
    }
    set {
      lock.lock()
      defer { lock.unlock() }
      _latestPoseData = newValue
    }
  }

  override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = nil) {
    super.init(proxy: proxy, options: options)
  }

  override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    let buffer = frame.buffer
    let orientation = frame.orientation

    guard let result = detector.detectPose(sampleBuffer: buffer, orientation: orientation) else {
      PoseDetectorPlugin.latestPoseData = nil
      return nil
    }

    PoseDetectorPlugin.latestPoseData = result
    return result
  }
}
