import Foundation
import UIKit
import MediaPipeTasksVision
import os.log

private let logger = Logger(subsystem: "com.divotgolf.videoposeanalysis", category: "VideoPoseDetector")

/// Runs MediaPipe pose detection on CGImage frames from video.
///
/// Adapted from vision-camera-pose-detection MediaPipePoseDetector.
/// Key differences:
/// - Takes CGImage directly (no CVPixelBuffer reconstruction)
/// - No y-flip correction (appliesPreferredTrackTransform handles orientation)
/// - Uses .image running mode (frames are independent, not a live stream)
final class VideoPoseDetector {

    private var poseLandmarker: PoseLandmarker?
    private var initFailed = false

    /// Whether the model loaded successfully.
    var isReady: Bool { poseLandmarker != nil && !initFailed }

    /// Maps our 24-joint model to MediaPipe landmark indices.
    /// Order matches JOINT_NAMES in pose-normalization.ts.
    ///
    /// "neck" = midpoint of landmarks 11 (left_shoulder) and 12 (right_shoulder)
    private struct JointMapping {
        let mpIndex: Int?
        let name: String
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
        JointMapping(mpIndex: 17, name: "leftPinky"),
        JointMapping(mpIndex: 18, name: "rightPinky"),
        JointMapping(mpIndex: 19, name: "leftIndex"),
        JointMapping(mpIndex: 20, name: "rightIndex"),
        JointMapping(mpIndex: 21, name: "leftThumb"),
        JointMapping(mpIndex: 22, name: "rightThumb"),
        JointMapping(mpIndex: 29, name: "leftHeel"),
        JointMapping(mpIndex: 30, name: "rightHeel"),
        JointMapping(mpIndex: 31, name: "leftFootIndex"),
        JointMapping(mpIndex: 32, name: "rightFootIndex"),
    ]

    init() {
        loadModel()
    }

    private func loadModel() {
        let podBundle = Bundle(for: VideoPoseDetector.self)
        let resourceBundle = podBundle.url(forResource: "VideoPoseAnalysis", withExtension: "bundle")
            .flatMap { Bundle(url: $0) }
            ?? Bundle.main.url(forResource: "VideoPoseAnalysis", withExtension: "bundle")
            .flatMap { Bundle(url: $0) }

        guard let modelPath = resourceBundle?.path(forResource: "pose_landmarker_lite", ofType: "task")
                ?? podBundle.path(forResource: "pose_landmarker_lite", ofType: "task")
                ?? Bundle.main.path(forResource: "pose_landmarker_lite", ofType: "task") else {
            logger.error("pose_landmarker_lite.task not found — video pose analysis disabled")
            logger.error("Searched pod bundle: \(podBundle.bundlePath)")
            logger.error("Searched resource bundle: \(resourceBundle?.bundlePath ?? "nil")")
            logger.error("Searched main bundle: \(Bundle.main.bundlePath)")
            initFailed = true
            return
        }

        logger.info("Found model at: \(modelPath)")

        do {
            let options = PoseLandmarkerOptions()
            options.baseOptions.modelAssetPath = modelPath
            options.runningMode = .image
            options.numPoses = 1
            options.minPoseDetectionConfidence = 0.5
            options.minPosePresenceConfidence = 0.5
            options.minTrackingConfidence = 0.5

            poseLandmarker = try PoseLandmarker(options: options)
            logger.info("MediaPipe PoseLandmarker loaded for video analysis")
        } catch {
            logger.error("Failed to create PoseLandmarker: \(error.localizedDescription)")
            initFailed = true
        }
    }

    /// Detects pose landmarks from a CGImage frame.
    ///
    /// The image should already be correctly oriented (via appliesPreferredTrackTransform).
    /// No y-flip or rotation correction is needed — unlike the live camera path,
    /// AVAssetImageGenerator handles orientation transforms.
    ///
    /// Returns 72-element array [x, y, confidence] × 24 joints, or nil on failure.
    func detectPose(in cgImage: CGImage) -> [Double]? {
        guard let landmarker = poseLandmarker, !initFailed else {
            return nil
        }

        let uiImage = UIImage(cgImage: cgImage)
        guard let mpImage = try? MPImage(uiImage: uiImage) else {
            return nil
        }

        guard let result = try? landmarker.detect(image: mpImage),
              let landmarks = result.landmarks.first,
              landmarks.count >= 33 else {
            return nil
        }

        var output = [Double](repeating: 0.0, count: 72)

        for (index, mapping) in Self.jointMappings.enumerated() {
            let offset = index * 3

            if let midpointOf = mapping.midpointOf {
                let (idx1, idx2) = midpointOf
                guard idx1 < landmarks.count, idx2 < landmarks.count else { continue }
                let lm1 = landmarks[idx1]
                let lm2 = landmarks[idx2]

                output[offset] = Double((lm1.x + lm2.x) / 2.0)
                output[offset + 1] = Double((lm1.y + lm2.y) / 2.0)
                output[offset + 2] = Double(min(lm1.visibility?.floatValue ?? 0, lm2.visibility?.floatValue ?? 0))
            } else if let mpIndex = mapping.mpIndex {
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
