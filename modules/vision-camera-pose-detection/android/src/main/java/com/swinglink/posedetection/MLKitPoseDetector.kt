package com.swinglink.posedetection

import android.media.Image
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.pose.Pose
import com.google.mlkit.vision.pose.PoseDetection
import com.google.mlkit.vision.pose.PoseDetector
import com.google.mlkit.vision.pose.PoseLandmark
import com.google.mlkit.vision.pose.defaults.PoseDetectorOptions

/**
 * Wrapper around ML Kit's PoseDetector (base model, bundled — no download needed).
 *
 * Detects 14 body joints from an Android Image and returns a flat list of 42 Doubles:
 * [x, y, confidence] for each joint in the standard order matching our JS JOINT_NAMES.
 *
 * Coordinate system:
 *   - ML Kit returns coordinates in image pixel space
 *   - We normalize to 0-1 relative to image dimensions
 *   - Y is already top-left origin (no flip needed, unlike iOS Vision)
 */
class MLKitPoseDetector {

  private val detector: PoseDetector

  init {
    val options = PoseDetectorOptions.Builder()
      .setDetectorMode(PoseDetectorOptions.STREAM_MODE)
      .build()
    detector = PoseDetection.getClient(options)
  }

  /**
   * Maps our 14-joint model to ML Kit landmark types.
   * Order matches JOINT_NAMES in pose-normalization.ts.
   */
  private val landmarkMapping = listOf(
    PoseLandmark.NOSE,
    -1, // neck — ML Kit doesn't have a neck landmark, we'll compute it
    PoseLandmark.LEFT_SHOULDER,
    PoseLandmark.RIGHT_SHOULDER,
    PoseLandmark.LEFT_ELBOW,
    PoseLandmark.RIGHT_ELBOW,
    PoseLandmark.LEFT_WRIST,
    PoseLandmark.RIGHT_WRIST,
    PoseLandmark.LEFT_HIP,
    PoseLandmark.RIGHT_HIP,
    PoseLandmark.LEFT_KNEE,
    PoseLandmark.RIGHT_KNEE,
    PoseLandmark.LEFT_ANKLE,
    PoseLandmark.RIGHT_ANKLE,
  )

  /**
   * Runs pose detection synchronously on the given image.
   *
   * @param image The camera frame as android.media.Image (YUV_420_888)
   * @param rotationDegrees The image rotation in degrees (0, 90, 180, 270)
   * @returns List of 42 Doubles, or null if no pose detected
   */
  fun detectPose(image: Image, rotationDegrees: Int): List<Double>? {
    val inputImage = InputImage.fromMediaImage(image, rotationDegrees)

    val pose: Pose = try {
      Tasks.await(detector.process(inputImage))
    } catch (e: Exception) {
      return null
    }

    if (pose.allPoseLandmarks.isEmpty()) {
      return null
    }

    val imageWidth = inputImage.width.toDouble()
    val imageHeight = inputImage.height.toDouble()
    if (imageWidth <= 0 || imageHeight <= 0) return null

    val result = MutableList(42) { 0.0 }

    for ((index, landmarkType) in landmarkMapping.withIndex()) {
      val offset = index * 3

      if (landmarkType == -1) {
        // Neck: average of left and right shoulder
        val leftShoulder = pose.getPoseLandmark(PoseLandmark.LEFT_SHOULDER)
        val rightShoulder = pose.getPoseLandmark(PoseLandmark.RIGHT_SHOULDER)

        if (leftShoulder != null && rightShoulder != null) {
          result[offset] = ((leftShoulder.position.x + rightShoulder.position.x) / 2.0) / imageWidth
          result[offset + 1] = ((leftShoulder.position.y + rightShoulder.position.y) / 2.0) / imageHeight
          result[offset + 2] = minOf(leftShoulder.inFrameLikelihood, rightShoulder.inFrameLikelihood).toDouble()
        }
        continue
      }

      val landmark = pose.getPoseLandmark(landmarkType) ?: continue
      result[offset] = landmark.position.x.toDouble() / imageWidth
      result[offset + 1] = landmark.position.y.toDouble() / imageHeight
      result[offset + 2] = landmark.inFrameLikelihood.toDouble()
    }

    return result
  }
}
