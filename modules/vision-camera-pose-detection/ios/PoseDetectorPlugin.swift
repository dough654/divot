import VisionCamera

/**
 * VisionCamera frame processor plugin that runs MediaPipe Pose Landmarker
 * on each camera frame.
 *
 * Detection runs on a background serial queue to avoid blocking the camera
 * pipeline (which would drop the preview framerate to the detection rate).
 * The frame processor callback quickly copies the pixel buffer and dispatches
 * detection to the background.
 *
 * Registered as "detectPose" — called from JS via:
 *   `VisionCameraProxy.initFrameProcessorPlugin('detectPose')`
 *
 * Returns nil (results are stored statically and polled from JS).
 */
@objc(PoseDetectorPlugin)
class PoseDetectorPlugin: FrameProcessorPlugin {

  private let detector = MediaPipePoseDetector()
  private let detectionQueue = DispatchQueue(label: "com.swinglink.posedetection", qos: .userInitiated)
  private var detectionInProgress = false

  // Thread-safe storage for latest pose result.
  // Written from detection queue, read from JS thread via Expo module.
  private static let lock = NSLock()
  private static var _latestPoseData: [Double]?

  /// Model initialization status, readable from JS for diagnostics.
  static var modelStatus: String = "not_initialized"

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
    Self.modelStatus = detector.isReady ? "loaded" : "init_failed"
    NSLog("[PoseDetection] Plugin created, model status: \(Self.modelStatus)")
  }

  private static var frameCount: Int64 = 0

  override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    // Skip if previous detection is still running
    guard !detectionInProgress else {
      return nil
    }

    let mirror = (arguments?["mirror"] as? Bool) ?? false
    let buffer = frame.buffer
    let orientation = frame.orientation

    // Copy the pixel buffer before returning — VisionCamera recycles it
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(buffer) else {
      return nil
    }

    // Lock and copy the pixel buffer so we can use it off the camera thread
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let totalBytes = bytesPerRow * height

    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else {
      CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)
      return nil
    }

    let pixelData = Data(bytes: baseAddress, count: totalBytes)
    let pixelFormat = CVPixelBufferGetPixelFormatType(pixelBuffer)
    CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly)

    // Dispatch detection to background queue — frame processor returns immediately
    detectionInProgress = true
    detectionQueue.async { [weak self] in
      defer { self?.detectionInProgress = false }

      guard let self = self else { return }

      let result = self.detector.detectPoseFromPixelData(
        pixelData,
        width: width,
        height: height,
        bytesPerRow: bytesPerRow,
        pixelFormat: pixelFormat,
        orientation: orientation
      )

      // Front camera preview is mirrored — flip x to match
      if mirror, let r = result {
        var flipped = r
        for i in stride(from: 0, to: flipped.count, by: 3) {
          flipped[i] = 1.0 - flipped[i]
        }
        PoseDetectorPlugin.latestPoseData = flipped
      } else {
        PoseDetectorPlugin.latestPoseData = result
      }

      Self.frameCount += 1
      if Self.frameCount % 60 == 0 {
        if let result = result {
          let maxConf = stride(from: 2, to: result.count, by: 3).map { result[$0] }.max() ?? 0
          let noseX = result[0]; let noseY = result[1]
          let hipX = result[24]; let hipY = result[25]
          NSLog("[PoseDetection] Frame #\(Self.frameCount): pose detected (orient=\(orientation.rawValue) " +
            "img=\(width)x\(height) nose=\(String(format: "%.2f,%.2f", noseX, noseY)) " +
            "hip=\(String(format: "%.2f,%.2f", hipX, hipY)) maxConf=\(String(format: "%.2f", maxConf)))")
        } else {
          NSLog("[PoseDetection] Frame #\(Self.frameCount): no pose detected (orient=\(orientation.rawValue) img=\(width)x\(height))")
        }
      }
    }

    return nil
  }
}
