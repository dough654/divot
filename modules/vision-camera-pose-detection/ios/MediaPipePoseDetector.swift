import Foundation
import UIKit
import MediaPipeTasksVision

/**
 * Wrapper around MediaPipe Pose Landmarker for body pose detection.
 *
 * Detects 33 MediaPipe landmarks from a CMSampleBuffer, maps 33→24 joints
 * matching our app's pose model, and returns a flat [Double] array
 * of 72 values: [x, y, confidence] for each joint.
 *
 * Coordinate system:
 *   - MediaPipe returns landmark positions normalized 0-1 relative to image
 *   - No x-flip needed (MediaPipe uses standard image coordinates)
 *   - Y is already in top-left origin (y increases downward)
 */
final class MediaPipePoseDetector {

  private var poseLandmarker: PoseLandmarker?
  private var initFailed = false

  /// Maps our 24-joint model to MediaPipe landmark indices.
  /// Order matches JOINT_NAMES in pose-normalization.ts.
  ///
  /// "neck" = midpoint of landmarks 11 (left_shoulder) and 12 (right_shoulder)
  private struct JointMapping {
    let mpIndex: Int?       // nil for computed joints (neck)
    let name: String

    /// For computed joints like "neck", store the two source indices.
    let midpointOf: (Int, Int)?

    init(mpIndex: Int, name: String) {
      self.mpIndex = mpIndex
      self.name = name
      self.midpointOf = nil
    }

    init(midpointOf: (Int, Int), name: String) {
      self.mpIndex = nil
      self.name = name
      self.midpointOf = midpointOf
    }
  }

  private static let jointMappings: [JointMapping] = [
    // Original 14 joints (indices 0-13)
    JointMapping(mpIndex: 0, name: "nose"),
    JointMapping(midpointOf: (11, 12), name: "neck"),
    JointMapping(mpIndex: 11, name: "leftShoulder"),
    JointMapping(mpIndex: 12, name: "rightShoulder"),
    JointMapping(mpIndex: 13, name: "leftElbow"),
    JointMapping(mpIndex: 14, name: "rightElbow"),
    JointMapping(mpIndex: 15, name: "leftWrist"),
    JointMapping(mpIndex: 16, name: "rightWrist"),
    JointMapping(mpIndex: 23, name: "leftHip"),
    JointMapping(mpIndex: 24, name: "rightHip"),
    JointMapping(mpIndex: 25, name: "leftKnee"),
    JointMapping(mpIndex: 26, name: "rightKnee"),
    JointMapping(mpIndex: 27, name: "leftAnkle"),
    JointMapping(mpIndex: 28, name: "rightAnkle"),
    // New finger joints (indices 14-19)
    JointMapping(mpIndex: 17, name: "leftPinky"),
    JointMapping(mpIndex: 18, name: "rightPinky"),
    JointMapping(mpIndex: 19, name: "leftIndex"),
    JointMapping(mpIndex: 20, name: "rightIndex"),
    JointMapping(mpIndex: 21, name: "leftThumb"),
    JointMapping(mpIndex: 22, name: "rightThumb"),
    // New foot joints (indices 20-23)
    JointMapping(mpIndex: 29, name: "leftHeel"),
    JointMapping(mpIndex: 30, name: "rightHeel"),
    JointMapping(mpIndex: 31, name: "leftFootIndex"),
    JointMapping(mpIndex: 32, name: "rightFootIndex"),
  ]

  init() {
    loadModel()
  }

  private func loadModel() {
    // Look for the .task model file in multiple bundle locations:
    // 1. Pod's own bundle (static linking → usually Bundle.main)
    // 2. Named resource bundle (from resource_bundles podspec config)
    // 3. Main app bundle (fallback)
    let podBundle = Bundle(for: MediaPipePoseDetector.self)
    let resourceBundle = podBundle.url(forResource: "VisionCameraPoseDetection", withExtension: "bundle")
      .flatMap { Bundle(url: $0) }
      ?? Bundle.main.url(forResource: "VisionCameraPoseDetection", withExtension: "bundle")
      .flatMap { Bundle(url: $0) }

    guard let modelPath = resourceBundle?.path(forResource: "pose_landmarker_lite", ofType: "task")
            ?? podBundle.path(forResource: "pose_landmarker_lite", ofType: "task")
            ?? Bundle.main.path(forResource: "pose_landmarker_lite", ofType: "task") else {
      NSLog("[PoseDetection] pose_landmarker_lite.task not found — pose detection disabled")
      NSLog("[PoseDetection] Searched pod bundle: \(podBundle.bundlePath)")
      NSLog("[PoseDetection] Searched resource bundle: \(resourceBundle?.bundlePath ?? "nil")")
      NSLog("[PoseDetection] Searched main bundle: \(Bundle.main.bundlePath)")
      initFailed = true
      return
    }

    NSLog("[PoseDetection] Found model at: \(modelPath)")

    do {
      let options = PoseLandmarkerOptions()
      options.baseOptions.modelAssetPath = modelPath
      options.runningMode = .image
      options.numPoses = 1
      options.minPoseDetectionConfidence = 0.5
      options.minPosePresenceConfidence = 0.5
      options.minTrackingConfidence = 0.5

      poseLandmarker = try PoseLandmarker(options: options)
      NSLog("[PoseDetection] MediaPipe PoseLandmarker loaded successfully")
    } catch {
      NSLog("[PoseDetection] Failed to create PoseLandmarker: \(error.localizedDescription)")
      initFailed = true
    }
  }

  /**
   * Runs pose detection synchronously on the given sample buffer.
   *
   * @param sampleBuffer The camera frame to analyze
   * @param orientation The UIImage.Orientation of the frame (from VisionCamera CoreMotion)
   * @returns Flat array of 72 Doubles, or nil if no pose detected
   */
  func detectPose(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation) -> [Double]? {
    guard let landmarker = poseLandmarker, !initFailed else {
      return nil
    }

    // Convert CMSampleBuffer to MPImage
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return nil
    }

    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    let context = CIContext()
    guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
      return nil
    }

    let uiImage = UIImage(cgImage: cgImage, scale: 1.0, orientation: orientation)

    guard let mpImage = try? MPImage(uiImage: uiImage) else {
      return nil
    }

    // Run inference
    guard let result = try? landmarker.detect(image: mpImage),
          let landmarks = result.landmarks.first,
          landmarks.count >= 33 else {
      return nil
    }

    // Map 33 MediaPipe landmarks → 24 joints
    var output = [Double](repeating: 0.0, count: 72)

    for (index, mapping) in Self.jointMappings.enumerated() {
      let offset = index * 3

      if let midpointOf = mapping.midpointOf {
        // Computed joint (neck): midpoint of two landmarks
        let (idx1, idx2) = midpointOf
        guard idx1 < landmarks.count, idx2 < landmarks.count else { continue }
        let lm1 = landmarks[idx1]
        let lm2 = landmarks[idx2]

        output[offset] = Double((lm1.x + lm2.x) / 2.0)
        output[offset + 1] = Double((lm1.y + lm2.y) / 2.0)
        output[offset + 2] = Double(min(lm1.visibility?.floatValue ?? 0, lm2.visibility?.floatValue ?? 0))
      } else if let mpIndex = mapping.mpIndex {
        // Direct landmark mapping
        guard mpIndex < landmarks.count else { continue }
        let lm = landmarks[mpIndex]

        output[offset] = Double(lm.x)
        output[offset + 1] = Double(lm.y)
        output[offset + 2] = Double(lm.visibility?.floatValue ?? 0)
      }
    }

    return output
  }
}
