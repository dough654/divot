import Foundation
import CoreML
import Vision
import UIKit

/**
 * Wrapper around a custom YOLOv8-nano-pose CoreML model for golf club detection.
 *
 * Detects 3 keypoints (grip end, shaft midpoint, club head) from a CMSampleBuffer
 * and returns a flat [Double] array of 9 values:
 * [grip_x, grip_y, grip_conf, shaftMid_x, shaftMid_y, shaftMid_conf, head_x, head_y, head_conf].
 *
 * The model outputs raw YOLO predictions that require transpose + NMS post-processing
 * since CoreML pose model exports do NOT bake in NMS.
 *
 * Coordinate system matches the pose detector:
 *   - With orientation hint, coordinates are screen-space
 *   - X is flipped to correct mirror effect
 *   - Y is already in top-left origin (y increases downward)
 *   - Values are normalized 0-1 relative to the image dimensions
 */
final class CoreMLClubDetector {

  /// Input image size the model was trained on.
  private let inputSize: CGFloat = 320.0

  /// Confidence threshold for filtering detections.
  private let confidenceThreshold: Float = 0.25

  /// IoU threshold for non-maximum suppression.
  private let iouThreshold: Float = 0.45

  /// Number of keypoints the model outputs (grip + shaft midpoint + head).
  private let numKeypoints = 3

  /// Total values per detection: 4 (bbox) + 1 (obj_conf) + 9 (3 keypoints × 3).
  /// Output shape from YOLOv8-pose with 3 keypoints: (1, 14, N)
  private let valuesPerDetection = 14

  private var coreMLModel: VNCoreMLModel?
  private var modelLoadFailed = false

  init() {
    loadModel()
  }

  private func loadModel() {
    // Look for the compiled model in the pod's resource bundle first,
    // then fall back to the main bundle. CocoaPods bundles resources
    // alongside the pod's compiled code, NOT in Bundle.main.
    let podBundle = Bundle(for: CoreMLClubDetector.self)
    guard let modelURL = podBundle.url(forResource: "golf-club-pose", withExtension: "mlmodelc")
            ?? Bundle.main.url(forResource: "golf-club-pose", withExtension: "mlmodelc") else {
      NSLog("[ClubDetector] golf-club-pose.mlmodelc not found in bundle — club detection disabled")
      NSLog("[ClubDetector] Searched pod bundle: \(podBundle.bundlePath)")
      NSLog("[ClubDetector] Searched main bundle: \(Bundle.main.bundlePath)")
      modelLoadFailed = true
      return
    }

    do {
      let config = MLModelConfiguration()
      config.computeUnits = .all
      let mlModel = try MLModel(contentsOf: modelURL, configuration: config)
      coreMLModel = try VNCoreMLModel(for: mlModel)
      NSLog("[ClubDetector] CoreML model loaded successfully")
    } catch {
      NSLog("[ClubDetector] Failed to load CoreML model: \(error.localizedDescription)")
      modelLoadFailed = true
    }
  }

  /**
   * Runs club detection on the given sample buffer.
   *
   * @param sampleBuffer The camera frame to analyze
   * @param orientation The UIImage.Orientation of the frame (from VisionCamera CoreMotion)
   * @returns Flat array of 9 Doubles [grip_x, grip_y, grip_conf, shaftMid_x, shaftMid_y, shaftMid_conf, head_x, head_y, head_conf],
   *          or nil if no club detected or model unavailable
   */
  func detectClub(sampleBuffer: CMSampleBuffer, orientation: UIImage.Orientation) -> [Double]? {
    guard let model = coreMLModel, !modelLoadFailed else {
      return nil
    }

    let handler = VNImageRequestHandler(
      cmSampleBuffer: sampleBuffer,
      orientation: cgImageOrientation(from: orientation),
      options: [:]
    )

    var detectionResult: [Double]?

    let request = VNCoreMLRequest(model: model) { [weak self] request, error in
      guard let self = self, error == nil else { return }
      guard let results = request.results as? [VNCoreMLFeatureValueObservation],
            let multiArray = results.first?.featureValue.multiArrayValue else {
        return
      }

      detectionResult = self.postProcess(multiArray: multiArray)
    }

    request.imageCropAndScaleOption = .scaleFill

    do {
      try handler.perform([request])
    } catch {
      return nil
    }

    return detectionResult
  }

  /**
   * Post-processes raw YOLOv8-pose model output.
   *
   * Raw output shape: (1, 14, N) where N = number of prediction anchors.
   * Each column: [cx, cy, w, h, obj_conf, kp0_x, kp0_y, kp0_conf, kp1_x, kp1_y, kp1_conf, kp2_x, kp2_y, kp2_conf]
   *
   * Steps:
   * 1. Transpose (1, 14, N) → array of N detections with 14 values each
   * 2. Filter by confidence threshold
   * 3. Apply greedy NMS
   * 4. Extract keypoints from top detection
   */
  private func postProcess(multiArray: MLMultiArray) -> [Double]? {
    let shape = multiArray.shape.map { $0.intValue }

    // Expected shape: [1, 14, N]
    guard shape.count == 3, shape[0] == 1, shape[1] == valuesPerDetection else {
      NSLog("[ClubDetector] Unexpected output shape: \(shape)")
      return nil
    }

    let numDetections = shape[2]
    let pointer = multiArray.dataPointer.bindMemory(to: Float.self, capacity: valuesPerDetection * numDetections)

    // Transpose: raw layout is [1, 11, N] contiguous, so element [0, row, col] = pointer[row * N + col]
    var candidates: [(box: [Float], confidence: Float, keypoints: [Float])] = []

    for col in 0..<numDetections {
      let confidence = pointer[4 * numDetections + col]
      guard confidence >= confidenceThreshold else { continue }

      let cx = pointer[0 * numDetections + col]
      let cy = pointer[1 * numDetections + col]
      let w  = pointer[2 * numDetections + col]
      let h  = pointer[3 * numDetections + col]

      // Convert center format to corner format for NMS
      let x1 = cx - w / 2
      let y1 = cy - h / 2
      let x2 = cx + w / 2
      let y2 = cy + h / 2

      // Extract keypoint data: 3 keypoints × 3 values (x, y, conf)
      var keypoints = [Float](repeating: 0, count: numKeypoints * 3)
      for kp in 0..<numKeypoints {
        let baseIdx = (5 + kp * 3)
        keypoints[kp * 3]     = pointer[baseIdx * numDetections + col]       // x
        keypoints[kp * 3 + 1] = pointer[(baseIdx + 1) * numDetections + col] // y
        keypoints[kp * 3 + 2] = pointer[(baseIdx + 2) * numDetections + col] // conf
      }

      candidates.append((
        box: [x1, y1, x2, y2],
        confidence: confidence,
        keypoints: keypoints
      ))
    }

    guard !candidates.isEmpty else { return nil }

    // Sort by confidence descending
    candidates.sort { $0.confidence > $1.confidence }

    // Greedy NMS — for single-class single-object this is simple
    let kept = greedyNMS(candidates: candidates, iouThreshold: iouThreshold)

    guard let best = kept.first else { return nil }

    // Convert keypoints from pixel coords (0-inputSize) to normalized (0-1)
    // and apply coordinate corrections matching the pose detector
    var result = [Double](repeating: 0.0, count: 9)
    for kp in 0..<numKeypoints {
      let offset = kp * 3
      // Normalize to 0-1 from model input space
      let normalizedX = Double(best.keypoints[offset]) / Double(inputSize)
      let normalizedY = Double(best.keypoints[offset + 1]) / Double(inputSize)
      let conf = Double(best.keypoints[offset + 2])

      // Flip X to correct mirror effect (same as pose detector)
      result[offset] = 1.0 - normalizedX
      result[offset + 1] = normalizedY
      result[offset + 2] = conf
    }

    return result
  }

  /**
   * Greedy non-maximum suppression.
   *
   * For golf club detection (single object), this is typically just picking
   * the highest-confidence detection, but we implement full NMS for robustness.
   */
  private func greedyNMS(
    candidates: [(box: [Float], confidence: Float, keypoints: [Float])],
    iouThreshold: Float
  ) -> [(box: [Float], confidence: Float, keypoints: [Float])] {
    var kept = [(box: [Float], confidence: Float, keypoints: [Float])]()
    var suppressed = Set<Int>()

    for i in 0..<candidates.count {
      if suppressed.contains(i) { continue }
      kept.append(candidates[i])

      for j in (i + 1)..<candidates.count {
        if suppressed.contains(j) { continue }
        if computeIoU(candidates[i].box, candidates[j].box) > iouThreshold {
          suppressed.insert(j)
        }
      }
    }

    return kept
  }

  /// Compute Intersection over Union for two boxes in [x1, y1, x2, y2] format.
  private func computeIoU(_ a: [Float], _ b: [Float]) -> Float {
    let interX1 = max(a[0], b[0])
    let interY1 = max(a[1], b[1])
    let interX2 = min(a[2], b[2])
    let interY2 = min(a[3], b[3])

    let interArea = max(0, interX2 - interX1) * max(0, interY2 - interY1)
    let areaA = (a[2] - a[0]) * (a[3] - a[1])
    let areaB = (b[2] - b[0]) * (b[3] - b[1])

    let union = areaA + areaB - interArea
    return union > 0 ? interArea / union : 0
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
