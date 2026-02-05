import Foundation
import UIKit
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
  @objc func pushFrame(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation) {
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
      rotation: rtcRotation(from: orientation),
      timeStampNs: timestampNsInt
    )

    source.capturer(capturer, didCapture: videoFrame)
  }

  /// Convert UIImage.Orientation (from VisionCamera Frame) to RTCVideoRotation.
  ///
  /// VisionCamera uses CoreMotion (accelerometer) to determine orientation, NOT UIDevice orientation.
  /// This means it works regardless of the app's UI orientation lock — rotating the physical device
  /// will produce the correct orientation value even if the UI stays portrait.
  ///
  /// iPhone rear camera sensor is physically mounted in landscape, with "top" pointing toward the
  /// device's right edge. VisionCamera normalizes this and reports the frame's UIImageOrientation
  /// relative to the device's physical position:
  ///
  ///   Device position    → UIImage.Orientation → RTCVideoRotation
  ///   Portrait (upright) → .up                 → ._0   (no rotation needed)
  ///   Landscape left     → .left               → ._90  (90° clockwise)
  ///   Upside down        → .down               → ._180
  ///   Landscape right    → .right              → ._270 (90° counter-clockwise)
  ///
  /// Mirrored variants (front camera) use the same rotation degrees — the mirror flip
  /// is handled separately by the WebRTC video track.
  private func rtcRotation(from orientation: UIImage.Orientation) -> RTCVideoRotation {
    switch orientation {
    case .up:            return ._0
    case .left:          return ._90
    case .down:          return ._180
    case .right:         return ._270
    case .upMirrored:    return ._0
    case .leftMirrored:  return ._90
    case .downMirrored:  return ._180
    case .rightMirrored: return ._270
    @unknown default:    return ._0
    }
  }

  /// Stop forwarding and release references.
  func stop() {
    isConfigured = false
    dummyCapturer = nil
    videoSource = nil
  }
}
