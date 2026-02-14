import VisionCamera

/**
 * VisionCamera frame processor plugin that computes luminance-based
 * frame differencing on each camera frame.
 *
 * Registered as "frameDiff" — called from JS via:
 *   `VisionCameraProxy.initFrameProcessorPlugin('frameDiff')`
 *
 * Returns a Double (0-1 motion magnitude), or nil on first frame.
 *
 * Also stores the latest result in a thread-safe static property so the
 * Expo module can expose it to JS via synchronous polling.
 */
@objc(FrameDiffPlugin)
class FrameDiffPlugin: FrameProcessorPlugin {

  private let computer = FrameDiffComputer()

  // Thread-safe storage for latest motion magnitude.
  // Written from the frame processor thread, read from JS thread via Expo module.
  private static let lock = NSLock()
  private static var _latestMotion: Double?

  static var latestMotion: Double? {
    get {
      lock.lock()
      defer { lock.unlock() }
      return _latestMotion
    }
    set {
      lock.lock()
      defer { lock.unlock() }
      _latestMotion = newValue
    }
  }

  override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = nil) {
    super.init(proxy: proxy, options: options)
  }

  override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    let buffer = frame.buffer
    let result = computer.computeDiff(sampleBuffer: buffer)

    FrameDiffPlugin.latestMotion = result
    return result
  }
}
