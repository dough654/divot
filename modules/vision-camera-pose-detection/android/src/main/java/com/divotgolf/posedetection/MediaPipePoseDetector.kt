package com.divotgolf.posedetection

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
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
 *   - Coordinates are rotated post-detection into display space
 *   - Y is already top-left origin (no flip needed)
 */
class MediaPipePoseDetector(private val context: Context) {

  private var poseLandmarker: PoseLandmarker? = null
  private var initFailed = false
  private var errorCount = 0L

  // Pre-allocated RGB conversion buffers, reused across frames
  private var rgbPixels: IntArray? = null
  private var rgbBitmap: Bitmap? = null
  private var rgbWidth = 0
  private var rgbHeight = 0

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

      poseLandmarker = createLandmarker(modelBuffer, useGpu = true)
        ?: createLandmarker(modelBuffer, useGpu = false)

      if (poseLandmarker != null) {
        Log.d(TAG, "MediaPipe PoseLandmarker created successfully")
      } else {
        Log.e(TAG, "Failed to create PoseLandmarker with both GPU and CPU delegates")
        initFailed = true
      }
    } catch (e: Throwable) {
      Log.e(TAG, "Failed to create PoseLandmarker: ${e.javaClass.simpleName}: ${e.message}")
      initFailed = true
    }
  }

  /** Attempt to create a PoseLandmarker with the given delegate. Returns null on failure. */
  private fun createLandmarker(modelBuffer: ByteBuffer, useGpu: Boolean): PoseLandmarker? {
    return try {
      modelBuffer.rewind()
      val baseOptionsBuilder = BaseOptions.builder()
        .setModelAssetBuffer(modelBuffer)
      if (useGpu) {
        baseOptionsBuilder.setDelegate(Delegate.GPU)
      }

      // VIDEO mode enables temporal tracking between frames (2-3x faster than IMAGE mode)
      val options = PoseLandmarker.PoseLandmarkerOptions.builder()
        .setBaseOptions(baseOptionsBuilder.build())
        .setRunningMode(RunningMode.VIDEO)
        .setNumPoses(1)
        .setMinPoseDetectionConfidence(0.5f)
        .setMinPosePresenceConfidence(0.5f)
        .setMinTrackingConfidence(0.5f)
        .build()

      val landmarker = PoseLandmarker.createFromOptions(context, options)
      Log.d(TAG, "PoseLandmarker created with ${if (useGpu) "GPU" else "CPU"} delegate")
      landmarker
    } catch (e: Throwable) {
      Log.w(TAG, "${if (useGpu) "GPU" else "CPU"} delegate failed: ${e.message}")
      null
    }
  }

  /**
   * Runs pose detection on pre-downsampled YUV frame data.
   *
   * Called from a background thread with YUV bytes already downsampled 3x
   * by the plugin (stride == width, no padding). Converts to RGB bitmap
   * via BitmapImageBuilder, then applies rotation to landmark coordinates
   * post-detection instead of rotating the bitmap.
   */
  fun detectPoseFromYuv(
    yBytes: ByteArray, uBytes: ByteArray, vBytes: ByteArray,
    width: Int, height: Int,
    rotationDegrees: Int,
    timestampMs: Long,
  ): List<Double>? {
    val landmarker = poseLandmarker ?: return null
    if (initFailed) return null

    val bitmap = try {
      yuvToRgbBitmap(yBytes, uBytes, vBytes, width, height)
    } catch (e: Exception) {
      if (errorCount++ % 60L == 0L) {
        Log.e(TAG, "YUV conversion failed (error #$errorCount): ${e.message}")
      }
      return null
    }

    val mpImage = BitmapImageBuilder(bitmap).build()

    val result = try {
      landmarker.detectForVideo(mpImage, timestampMs)
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

    // Rotate landmark coordinates from landscape buffer space → display space.
    // Cheaper than creating a rotated bitmap before inference.
    if (rotationDegrees != 0) {
      for (i in 0 until output.size step 3) {
        val x = output[i]
        val y = output[i + 1]
        when (rotationDegrees) {
          90  -> { output[i] = 1.0 - y; output[i + 1] = x }
          180 -> { output[i] = 1.0 - x; output[i + 1] = 1.0 - y }
          270 -> { output[i] = y;        output[i + 1] = 1.0 - x }
        }
      }
    }

    return output
  }

  /**
   * Convert pre-downsampled YUV byte arrays to an ARGB_8888 Bitmap.
   * Input data has stride == width (no padding) and separate U/V arrays
   * with stride == width/2. Reuses pre-allocated IntArray and Bitmap.
   */
  private fun yuvToRgbBitmap(
    yBytes: ByteArray, uBytes: ByteArray, vBytes: ByteArray,
    width: Int, height: Int,
  ): Bitmap {
    if (rgbWidth != width || rgbHeight != height) {
      rgbPixels = IntArray(width * height)
      rgbBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      rgbWidth = width
      rgbHeight = height
    }

    val pixels = rgbPixels!!
    val bitmap = rgbBitmap!!
    val uvWidth = width / 2

    for (row in 0 until height) {
      val yRowOffset = row * width
      val uvRowOffset = (row shr 1) * uvWidth
      for (col in 0 until width) {
        val yVal = (yBytes[yRowOffset + col].toInt() and 0xFF).toFloat()
        val uvIdx = uvRowOffset + (col shr 1)
        val uVal = (uBytes[uvIdx].toInt() and 0xFF).toFloat() - 128f
        val vVal = (vBytes[uvIdx].toInt() and 0xFF).toFloat() - 128f

        val r = (yVal + 1.370705f * vVal).toInt().coerceIn(0, 255)
        val g = (yVal - 0.337633f * uVal - 0.698001f * vVal).toInt().coerceIn(0, 255)
        val b = (yVal + 1.732446f * uVal).toInt().coerceIn(0, 255)

        pixels[yRowOffset + col] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
      }
    }

    bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
    return bitmap
  }
}
