import Foundation
import WebRTC

/**
 * Singleton that holds an RTCVideoSource and pushes CMSampleBuffer frames into it.
 * VisionCamera's frame processor plugin calls `pushFrame` on every camera frame.
 * The RTCVideoSource feeds into an RTCVideoTrack registered with react-native-webrtc.
 */
final class VisionCameraFrameForwarder: NSObject {
  static let shared = VisionCameraFrameForwarder()

  private(set) var videoSource: RTCVideoSource?
  private var dummyCapturer: RTCVideoCapturer?
  private var isConfigured = false

  private override init() {
    super.init()
  }

  /// Configure with an RTCVideoSource created from the WebRTC factory.
  func configure(source: RTCVideoSource) {
    videoSource = source
    dummyCapturer = RTCVideoCapturer(delegate: source)
    isConfigured = true
  }

  /// Push a CMSampleBuffer frame from VisionCamera into the WebRTC video source.
  /// Called from the frame processor plugin on the camera thread.
  @objc func pushFrame(sampleBuffer: CMSampleBuffer) {
    guard isConfigured,
          let source = videoSource,
          let capturer = dummyCapturer,
          let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }

    let timestampNs = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    let timestampNsInt = Int64(CMTimeGetSeconds(timestampNs) * 1_000_000_000)

    let rtcPixelBuffer = RTCCVPixelBuffer(pixelBuffer: pixelBuffer)
    let videoFrame = RTCVideoFrame(
      buffer: rtcPixelBuffer,
      rotation: ._0,
      timeStampNs: timestampNsInt
    )

    source.capturer(capturer, didCapture: videoFrame)
  }

  /// Stop forwarding and release references.
  func stop() {
    isConfigured = false
    dummyCapturer = nil
    videoSource = nil
  }
}
