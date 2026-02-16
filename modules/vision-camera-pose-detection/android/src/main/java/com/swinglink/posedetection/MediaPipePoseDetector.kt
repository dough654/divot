package com.swinglink.posedetection

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.media.Image
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import java.nio.ByteBuffer

/**
 * Wrapper around MediaPipe Pose Landmarker for body pose detection.
 *
 * Detects 33 MediaPipe landmarks, maps 33→24 joints matching our
 * app's pose model, and returns a flat list of 72 Doubles:
 * [x, y, confidence] for each joint.
 *
 * Coordinate system:
 *   - MediaPipe returns landmark positions normalized 0-1 relative to image
 *   - Image is rotated before inference so coordinates are in display space
 *   - Y is already top-left origin (no flip needed)
 */
class MediaPipePoseDetector(private val context: Context) {

  private var poseLandmarker: PoseLandmarker? = null
  private var initFailed = false
  private var errorCount = 0L

  /** Whether the model loaded successfully and is ready for inference. */
  val isReady: Boolean get() = poseLandmarker != null && !initFailed

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

      val modelBuffer = context.assets.open(MODEL_ASSET).use { inputStream ->
        val bytes = inputStream.readBytes()
        ByteBuffer.allocateDirect(bytes.size).also {
          it.put(bytes)
          it.rewind()
        }
      }
      Log.d(TAG, "Model loaded into buffer: ${modelBuffer.capacity()} bytes")

      val baseOptions = BaseOptions.builder()
        .setModelAssetBuffer(modelBuffer)
        .build()

      val options = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setRunningMode(RunningMode.IMAGE)
        .setNumPoses(1)
        .setMinPoseDetectionConfidence(0.5f)
        .setMinPosePresenceConfidence(0.5f)
        .setMinTrackingConfidence(0.5f)
        .build()

      poseLandmarker = PoseLandmarker.createFromOptions(context, options)
      Log.d(TAG, "MediaPipe PoseLandmarker created successfully")
    } catch (e: Throwable) {
      Log.e(TAG, "Failed to create PoseLandmarker: ${e.javaClass.simpleName}: ${e.message}")
      initFailed = true
    }
  }

  /**
   * Runs pose detection on pre-copied YUV frame data.
   *
   * Called from a background thread with YUV bytes copied from the camera
   * frame. Converts YUV→RGB, rotates the bitmap, and runs inference.
   * Coordinates are returned in the rotated (display) space.
   */
  fun detectPoseFromYuv(
    yBytes: ByteArray, uBytes: ByteArray, vBytes: ByteArray,
    width: Int, height: Int,
    yRowStride: Int, uvRowStride: Int, uvPixelStride: Int,
    rotationDegrees: Int,
  ): List<Double>? {
    val landmarker = poseLandmarker ?: return null
    if (initFailed) return null

    // YUV → ARGB_8888 Bitmap (downsampled 3x to ~640x360 — reduces allocations ~9x)
    var bitmap = try {
      yuvToRgbBitmap(yBytes, uBytes, vBytes, width, height, yRowStride, uvRowStride, uvPixelStride, downsample = 3)
    } catch (e: Exception) {
      if (errorCount++ % 60L == 0L) {
        Log.e(TAG, "YUV conversion failed (error #$errorCount): ${e.message}")
      }
      return null
    } ?: return null

    // Rotate bitmap so coordinates are in display (portrait) space
    if (rotationDegrees != 0) {
      val matrix = Matrix()
      matrix.postRotate(rotationDegrees.toFloat())
      bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    val mpImage = BitmapImageBuilder(bitmap).build()

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
        val leftShoulder = poseLandmarks[11]
        val rightShoulder = poseLandmarks[12]

        output[offset] = ((leftShoulder.x() + rightShoulder.x()) / 2.0).toDouble()
        output[offset + 1] = ((leftShoulder.y() + rightShoulder.y()) / 2.0).toDouble()
        val leftVis = leftShoulder.visibility()
        val rightVis = rightShoulder.visibility()
        output[offset + 2] = minOf(
          if (leftVis.isPresent) leftVis.get() else 0f,
          if (rightVis.isPresent) rightVis.get() else 0f
        ).toDouble()
        continue
      }

      if (mpIndex >= poseLandmarks.size) continue
      val lm = poseLandmarks[mpIndex]

      output[offset] = lm.x().toDouble()
      output[offset + 1] = lm.y().toDouble()
      val vis = lm.visibility()
      output[offset + 2] = if (vis.isPresent) vis.get().toDouble() else 0.0
    }

    return output
  }

  /**
   * Convert YUV_420_888 byte arrays directly to an ARGB_8888 Bitmap.
   * Handles variable row/pixel strides across devices.
   */
  private fun yuvToRgbBitmap(
    yBytes: ByteArray, uBytes: ByteArray, vBytes: ByteArray,
    width: Int, height: Int,
    yRowStride: Int, uvRowStride: Int, uvPixelStride: Int,
    downsample: Int = 1,
  ): Bitmap? {
    val outW = width / downsample
    val outH = height / downsample
    val pixels = IntArray(outW * outH)

    for (outRow in 0 until outH) {
      for (outCol in 0 until outW) {
        val srcRow = outRow * downsample
        val srcCol = outCol * downsample
        val yIndex = srcRow * yRowStride + srcCol
        val uvRow = srcRow shr 1
        val uvCol = srcCol shr 1
        val uvIndex = uvRow * uvRowStride + uvCol * uvPixelStride

        val y = (yBytes[yIndex].toInt() and 0xFF).toFloat()
        val u = (uBytes[uvIndex].toInt() and 0xFF).toFloat() - 128f
        val v = (vBytes[uvIndex].toInt() and 0xFF).toFloat() - 128f

        val r = (y + 1.370705f * v).toInt().coerceIn(0, 255)
        val g = (y - 0.337633f * u - 0.698001f * v).toInt().coerceIn(0, 255)
        val b = (y + 1.732446f * u).toInt().coerceIn(0, 255)

        pixels[outRow * outW + outCol] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
      }
    }

    return Bitmap.createBitmap(pixels, outW, outH, Bitmap.Config.ARGB_8888)
  }
}
