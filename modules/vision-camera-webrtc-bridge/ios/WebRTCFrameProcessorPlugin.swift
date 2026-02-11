import VisionCamera

/**
 * VisionCamera frame processor plugin that forwards each camera frame
 * to `VisionCameraFrameForwarder` for injection into the WebRTC video track.
 *
 * Registered as "forwardToWebRTC" — called from JS via:
 *   `VisionCameraProxy.initFrameProcessorPlugin('forwardToWebRTC')`
 */
@objc(WebRTCFrameProcessorPlugin)
class WebRTCFrameProcessorPlugin: FrameProcessorPlugin {

  override init(proxy: VisionCameraProxyHolder, options: [AnyHashable: Any]? = nil) {
    super.init(proxy: proxy, options: options)
  }

  override func callback(_ frame: Frame, withArguments arguments: [AnyHashable: Any]?) -> Any? {
    let buffer = frame.buffer
    let orientation = frame.orientation
    VisionCameraFrameForwarder.shared.pushFrame(sampleBuffer: buffer, orientation: orientation)
    return 0
  }
}
