import Foundation
import Vision
import UIKit

/**
 * Wrapper around Apple Vision's VNDetectHumanBodyPoseRequest.
 *
 * Detects 14 body joints from a CMSampleBuffer and returns a flat [Double]
 * array of 42 values: [x, y, confidence] for each joint in the standard order.
 *
 * Coordinate system:
 *   - With the orientation hint, Apple Vision returns screen-space coordinates
 *   - We flip X to correct the mirror effect
 *   - Y is already in top-left origin (y increases downward)
 *   - Values are normalized 0-1 relative to the image dimensions
 */
final class AppleVisionPoseDetector {

  /// Maps our 14-joint model to Apple Vision joint names.
  /// Order matches JOINT_NAMES in pose-normalization.ts.
  private static let jointMapping: [(VNHumanBodyPoseObservation.JointName, String)] = [
    (.nose, "nose"),
    (.neck, "neck"),
    (.leftShoulder, "leftShoulder"),
    (.rightShoulder, "rightShoulder"),
    (.leftElbow, "leftElbow"),
    (.rightElbow, "rightElbow"),
    (.leftWrist, "leftWrist"),
    (.rightWrist, "rightWrist"),
    (.leftHip, "leftHip"),
    (.rightHip, "rightHip"),
    (.leftKnee, "leftKnee"),
    (.rightKnee, "rightKnee"),
    (.leftAnkle, "leftAnkle"),
    (.rightAnkle, "rightAnkle"),
  ]

  private let request = VNDetectHumanBodyPoseRequest()

  /**
   * Runs pose detection synchronously on the given sample buffer.
   *
   * @param sampleBuffer The camera frame to analyze
   * @param orientation The UIImage.Orientation of the frame (from VisionCamera CoreMotion)
   * @returns Flat array of 42 Doubles, or nil if no pose detected
   */
  func detectPose(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation) -> [Double]? {
    let handler = VNImageRequestHandler(
      cmSampleBuffer: sampleBuffer,
      orientation: cgImageOrientation(from: orientation),
      options: [:]
    )

    do {
      try handler.perform([request])
    } catch {
      return nil
    }

    guard let observation = request.results?.first else {
      return nil
    }

    var result = [Double](repeating: 0.0, count: 42)

    for (index, (jointName, _)) in Self.jointMapping.enumerated() {
      let offset = index * 3
      guard let point = try? observation.recognizedPoint(jointName) else {
        // Joint not detected — leave as zeros (confidence 0)
        continue
      }

      // With the orientation hint, Vision returns screen-space coordinates.
      // Flip X to correct mirror, Y is already top-to-bottom.
      result[offset] = 1.0 - point.location.x
      result[offset + 1] = point.location.y
      result[offset + 2] = Double(point.confidence)
    }

    return result
  }

  /// Convert UIImage.Orientation to CGImagePropertyOrientation for Vision framework.
  private func cgImageOrientation(from uiOrientation: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch uiOrientation {
    case .up:            return .up
    case .down:          return .down
    case .left:          return .left
    case .right:         return .right
    case .upMirrored:    return .upMirrored
    case .downMirrored:  return .downMirrored
    case .leftMirrored:  return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default:    return .up
    }
  }
}
