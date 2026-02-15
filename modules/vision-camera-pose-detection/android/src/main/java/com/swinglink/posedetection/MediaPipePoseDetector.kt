package com.swinglink.posedetection

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.media.Image
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerOptions
import java.io.ByteArrayOutputStream

/**
 * Wrapper around MediaPipe Pose Landmarker for body pose detection.
 *
 * Detects 33 MediaPipe landmarks, maps 33→24 joints matching our
 * app's pose model, and returns a flat list of 72 Doubles:
 * [x, y, confidence] for each joint.
 *
 * Coordinate system:
 *   - MediaPipe returns landmark positions normalized 0-1 relative to image
 *   - Image is rotated according to rotationDegrees before inference
 *   - Y is already top-left origin (no flip needed)
 */
class MediaPipePoseDetector(private val context: Context) {

  private var poseLandmarker: PoseLandmarker? = null
  private var initFailed = false
  private var errorCount = 0L

  companion object {
    private const val TAG = "PoseDetection"
    private const val MODEL_ASSET = "pose_landmarker_lite.task"
  }

  /**
   * Maps our 24-joint model to MediaPipe landmark indices.
   * Order matches JOINT_NAMES in pose-normalization.ts.
   *
   * -1 means "neck" = computed as midpoint of left_shoulder (11) and right_shoulder (12).
   */
  private val landmarkMapping = listOf(
    // Original 14 joints (indices 0-13)
    0,   // nose
    -1,  // neck (midpoint of shoulders)
    11,  // left_shoulder
    12,  // right_shoulder
    13,  // left_elbow
    14,  // right_elbow
    15,  // left_wrist
    16,  // right_wrist
    23,  // left_hip
    24,  // right_hip
    25,  // left_knee
    26,  // right_knee
    27,  // left_ankle
    28,  // right_ankle
    // New finger joints (indices 14-19)
    17,  // left_pinky
    18,  // right_pinky
    19,  // left_index
    20,  // right_index
    21,  // left_thumb
    22,  // right_thumb
    // New foot joints (indices 20-23)
    29,  // left_heel
    30,  // right_heel
    31,  // left_foot_index
    32,  // right_foot_index
  )

  init {
    loadModel()
  }

  private fun loadModel() {
    try {
      Log.d(TAG, "Initializing MediaPipe PoseLandmarker")
      val baseOptions = BaseOptions.builder()
        .setModelAssetPath(MODEL_ASSET)
        .build()

      val options = PoseLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setRunningMode(PoseLandmarkerOptions.RunningMode.IMAGE)
        .setNumPoses(1)
        .setMinPoseDetectionConfidence(0.5f)
        .setMinPosePresenceConfidence(0.5f)
        .setMinTrackingConfidence(0.5f)
        .build()

      poseLandmarker = PoseLandmarker.createFromOptions(context, options)
      Log.d(TAG, "MediaPipe PoseLandmarker created successfully")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to create PoseLandmarker: ${e.message}")
      initFailed = true
    }
  }

  /**
   * Runs pose detection synchronously on the given image.
   *
   * @param image The camera frame as android.media.Image (YUV_420_888)
   * @param rotationDegrees The image rotation in degrees (0, 90, 180, 270)
   * @returns List of 72 Doubles, or null if no pose detected
   */
  fun detectPose(image: Image, rotationDegrees: Int): List<Double>? {
    val landmarker = poseLandmarker ?: return null
    if (initFailed) return null

    // Convert YUV Image to Bitmap
    val bitmap = try {
      imageToBitmap(image, rotationDegrees)
    } catch (e: Exception) {
      if (errorCount++ % 60L == 0L) {
        Log.e(TAG, "Image conversion failed (error #$errorCount): ${e.message}")
      }
      return null
    } ?: return null

    // Create MediaPipe image
    val mpImage = BitmapImageBuilder(bitmap).build()

    // Run inference
    val result = try {
      landmarker.detect(mpImage)
    } catch (e: Exception) {
      if (errorCount++ % 60L == 0L) {
        Log.e(TAG, "PoseLandmarker.detect() failed (error #$errorCount): ${e.message}")
      }
      return null
    }

    val landmarks = result.landmarks()
    if (landmarks.isEmpty() || landmarks[0].size < 33) {
      return null
    }

    val poseLandmarks = landmarks[0]
    val output = MutableList(72) { 0.0 }

    for ((index, mpIndex) in landmarkMapping.withIndex()) {
      val offset = index * 3

      if (mpIndex == -1) {
        // Neck: midpoint of left and right shoulder
        val leftShoulder = poseLandmarks[11]
        val rightShoulder = poseLandmarks[12]

        output[offset] = ((leftShoulder.x() + rightShoulder.x()) / 2.0).toDouble()
        output[offset + 1] = ((leftShoulder.y() + rightShoulder.y()) / 2.0).toDouble()
        output[offset + 2] = minOf(
          leftShoulder.visibility().orElse(0f),
          rightShoulder.visibility().orElse(0f)
        ).toDouble()
        continue
      }

      if (mpIndex >= poseLandmarks.size) continue
      val lm = poseLandmarks[mpIndex]

      output[offset] = lm.x().toDouble()
      output[offset + 1] = lm.y().toDouble()
      output[offset + 2] = lm.visibility().orElse(0f).toDouble()
    }

    return output
  }

  /**
   * Convert android.media.Image (YUV_420_888) to a rotated Bitmap.
   */
  private fun imageToBitmap(image: Image, rotationDegrees: Int): Bitmap? {
    if (image.format != ImageFormat.YUV_420_888) {
      Log.w(TAG, "Unexpected image format: ${image.format}")
      return null
    }

    val yBuffer = image.planes[0].buffer
    val uBuffer = image.planes[1].buffer
    val vBuffer = image.planes[2].buffer

    val ySize = yBuffer.remaining()
    val uSize = uBuffer.remaining()
    val vSize = vBuffer.remaining()

    val nv21 = ByteArray(ySize + uSize + vSize)
    yBuffer.get(nv21, 0, ySize)
    vBuffer.get(nv21, ySize, vSize)
    uBuffer.get(nv21, ySize + vSize, uSize)

    val yuvImage = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
    val out = ByteArrayOutputStream()
    yuvImage.compressToJpeg(Rect(0, 0, image.width, image.height), 80, out)
    val jpegBytes = out.toByteArray()
    var bitmap = BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size) ?: return null

    // Rotate if needed
    if (rotationDegrees != 0) {
      val matrix = Matrix()
      matrix.postRotate(rotationDegrees.toFloat())
      bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    return bitmap
  }
}
