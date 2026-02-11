import VisionCamera

/**
 * VisionCamera frame processor plugin that runs Apple Vision body pose
 * detection on each camera frame.
 *
 * Registered as "detectPose" — called from JS via:
 *   `VisionCameraProxy.initFrameProcessorPlugin('detectPose')`
 *
 * Returns a flat array of 42 Doubles (14 joints × [x, y, confidence]),
 * or nil if no pose was detected.
 */
@objc(PoseDetectorPlugin)
class PoseDetectorPlugin: FrameProcessorPlugin {

  private let detector = AppleVisionPoseDetector()

  override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = nil) {
    super.init(proxy: proxy, options: options)
  }

  override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    let buffer = frame.buffer
    let orientation = frame.orientation

    guard let result = detector.detectPose(sampleBuffer: buffer, orientation: orientation) else {
      return nil
    }

    return result
  }
}
