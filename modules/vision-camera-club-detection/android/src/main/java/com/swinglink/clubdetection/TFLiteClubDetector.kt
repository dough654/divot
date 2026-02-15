package com.swinglink.clubdetection

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.Image
import android.util.Log
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

/**
 * Wrapper around a custom YOLOv8-nano-pose TFLite model for golf club detection.
 *
 * Detects 3 keypoints (grip end, shaft midpoint, club head) from an Android Image
 * and returns a flat list of 9 Doubles:
 * [grip_x, grip_y, grip_conf, shaftMid_x, shaftMid_y, shaftMid_conf, head_x, head_y, head_conf].
 *
 * Coordinate system:
 *   - TFLite outputs coordinates in the model's input space (0-320)
 *   - We normalize to 0-1 for consistency with the JS overlay
 *   - When rotation is 90° or 270°, we swap width/height for normalization
 *   - No X flip needed on Android (unlike iOS Vision)
 */
class TFLiteClubDetector(private val context: Context) {

  /** Model input dimensions. */
  private val inputSize = 320

  /** Confidence threshold for filtering detections. */
  private val confidenceThreshold = 0.25f

  /** IoU threshold for non-maximum suppression. */
  private val iouThreshold = 0.45f

  /** Number of keypoints the model outputs (grip + shaft midpoint + head). */
  private val numKeypoints = 3

  /**
   * Total values per detection: 4 (bbox) + 1 (obj_conf) + 9 (3 keypoints × 3).
   * Output shape from YOLOv8-pose with 3 keypoints: (1, 14, N)
   */
  private val valuesPerDetection = 14

  private var interpreter: Interpreter? = null
  private var modelLoadFailed = false
  private var errorCount = 0L

  companion object {
    private const val TAG = "ClubDetection"
    private const val MODEL_FILENAME = "golf-club-pose.tflite"
  }

  init {
    loadModel()
  }

  private fun loadModel() {
    try {
      val modelBuffer = loadModelFile()
      if (modelBuffer == null) {
        Log.e(TAG, "Failed to load $MODEL_FILENAME from assets — club detection disabled")
        modelLoadFailed = true
        return
      }

      val options = Interpreter.Options()
      // Try GPU delegate first, fall back to CPU.
      // Catch Throwable — NoClassDefFoundError (missing GPU libs) is an Error, not Exception.
      try {
        val gpuDelegate = GpuDelegate()
        options.addDelegate(gpuDelegate)
        Log.d(TAG, "GPU delegate enabled")
      } catch (e: Throwable) {
        Log.w(TAG, "GPU delegate not available, using CPU: ${e.message}")
      }
      options.setNumThreads(2)

      interpreter = Interpreter(modelBuffer, options)
      Log.d(TAG, "TFLite model loaded successfully")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to initialize TFLite interpreter: ${e.message}")
      modelLoadFailed = true
    }
  }

  private fun loadModelFile(): MappedByteBuffer? {
    return try {
      val assetFileDescriptor = context.assets.openFd(MODEL_FILENAME)
      val inputStream = FileInputStream(assetFileDescriptor.fileDescriptor)
      val fileChannel = inputStream.channel
      val startOffset = assetFileDescriptor.startOffset
      val declaredLength = assetFileDescriptor.declaredLength
      fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    } catch (e: Exception) {
      Log.e(TAG, "Model file not found: $MODEL_FILENAME")
      null
    }
  }

  /**
   * Runs club detection on the given image.
   *
   * @param image The camera frame as android.media.Image (YUV_420_888)
   * @param rotationDegrees The image rotation in degrees (0, 90, 180, 270)
   * @returns List of 6 Doubles, or null if no club detected
   */
  fun detectClub(image: Image, rotationDegrees: Int): List<Double>? {
    val interp = interpreter ?: return null
    if (modelLoadFailed) return null

    try {
      // Convert YUV image to ARGB bitmap
      val bitmap = yuvToRgbBitmap(image, rotationDegrees) ?: return null

      // Resize to model input size
      val resizedBitmap = Bitmap.createScaledBitmap(bitmap, inputSize, inputSize, true)
      if (resizedBitmap !== bitmap) bitmap.recycle()

      // Prepare input buffer: float32, NCHW or NHWC depending on model
      // YOLOv8 TFLite expects NHWC: (1, 320, 320, 3)
      val inputBuffer = ByteBuffer.allocateDirect(1 * inputSize * inputSize * 3 * 4)
      inputBuffer.order(ByteOrder.nativeOrder())

      val pixels = IntArray(inputSize * inputSize)
      resizedBitmap.getPixels(pixels, 0, inputSize, 0, 0, inputSize, inputSize)
      resizedBitmap.recycle()

      for (pixel in pixels) {
        // Normalize to 0-1
        inputBuffer.putFloat(((pixel shr 16) and 0xFF) / 255.0f) // R
        inputBuffer.putFloat(((pixel shr 8) and 0xFF) / 255.0f)  // G
        inputBuffer.putFloat((pixel and 0xFF) / 255.0f)           // B
      }

      // Run inference
      // Output shape: (1, 11, N) where N depends on input size
      // For 320×320: N ≈ 2100
      val outputShape = interp.getOutputTensor(0).shape()
      val numDetections = outputShape[2]
      val outputBuffer = ByteBuffer.allocateDirect(1 * valuesPerDetection * numDetections * 4)
      outputBuffer.order(ByteOrder.nativeOrder())

      inputBuffer.rewind()
      interp.run(inputBuffer, outputBuffer)
      outputBuffer.rewind()

      // Post-process: transpose, filter, NMS, extract keypoints
      return postProcess(outputBuffer, numDetections)

    } catch (e: Exception) {
      if (errorCount++ % 60L == 0L) {
        Log.e(TAG, "TFLite inference failed (error #$errorCount): ${e.javaClass.simpleName}: ${e.message}")
      }
      return null
    }
  }

  /**
   * Post-processes raw YOLOv8-pose model output.
   *
   * Raw output is (1, 11, N) as a flat float buffer.
   * Layout: element[row][col] = buffer[row * N + col]
   */
  private fun postProcess(outputBuffer: ByteBuffer, numDetections: Int): List<Double>? {
    val output = FloatArray(valuesPerDetection * numDetections)
    outputBuffer.asFloatBuffer().get(output)

    data class Detection(
      val box: FloatArray,
      val confidence: Float,
      val keypoints: FloatArray
    )

    val candidates = mutableListOf<Detection>()

    for (col in 0 until numDetections) {
      val confidence = output[4 * numDetections + col]
      if (confidence < confidenceThreshold) continue

      val cx = output[0 * numDetections + col]
      val cy = output[1 * numDetections + col]
      val w  = output[2 * numDetections + col]
      val h  = output[3 * numDetections + col]

      val x1 = cx - w / 2
      val y1 = cy - h / 2
      val x2 = cx + w / 2
      val y2 = cy + h / 2

      val keypoints = FloatArray(numKeypoints * 3)
      for (kp in 0 until numKeypoints) {
        val baseIdx = 5 + kp * 3
        keypoints[kp * 3]     = output[baseIdx * numDetections + col]       // x
        keypoints[kp * 3 + 1] = output[(baseIdx + 1) * numDetections + col] // y
        keypoints[kp * 3 + 2] = output[(baseIdx + 2) * numDetections + col] // conf
      }

      candidates.add(Detection(floatArrayOf(x1, y1, x2, y2), confidence, keypoints))
    }

    if (candidates.isEmpty()) return null

    // Sort by confidence descending
    candidates.sortByDescending { it.confidence }

    // Greedy NMS
    val kept = mutableListOf<Detection>()
    val suppressed = mutableSetOf<Int>()

    for (i in candidates.indices) {
      if (i in suppressed) continue
      kept.add(candidates[i])

      for (j in (i + 1) until candidates.size) {
        if (j in suppressed) continue
        if (computeIoU(candidates[i].box, candidates[j].box) > iouThreshold) {
          suppressed.add(j)
        }
      }
    }

    val best = kept.firstOrNull() ?: return null

    // Convert keypoints from pixel coords (0-inputSize) to normalized (0-1)
    // No X flip needed on Android (unlike iOS Vision)
    val result = MutableList(9) { 0.0 }
    for (kp in 0 until numKeypoints) {
      val offset = kp * 3
      result[offset]     = (best.keypoints[offset] / inputSize).toDouble()
      result[offset + 1] = (best.keypoints[offset + 1] / inputSize).toDouble()
      result[offset + 2] = best.keypoints[offset + 2].toDouble()
    }

    return result
  }

  /** Compute Intersection over Union for two boxes in [x1, y1, x2, y2] format. */
  private fun computeIoU(a: FloatArray, b: FloatArray): Float {
    val interX1 = maxOf(a[0], b[0])
    val interY1 = maxOf(a[1], b[1])
    val interX2 = minOf(a[2], b[2])
    val interY2 = minOf(a[3], b[3])

    val interArea = maxOf(0f, interX2 - interX1) * maxOf(0f, interY2 - interY1)
    val areaA = (a[2] - a[0]) * (a[3] - a[1])
    val areaB = (b[2] - b[0]) * (b[3] - b[1])

    val union = areaA + areaB - interArea
    return if (union > 0) interArea / union else 0f
  }

  /**
   * Convert YUV_420_888 Image to an ARGB Bitmap, applying rotation.
   *
   * This is a simplified conversion — for production, consider using RenderScript
   * or a native YUV conversion library for better performance.
   */
  private fun yuvToRgbBitmap(image: Image, rotationDegrees: Int): Bitmap? {
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]

    val yBuffer = yPlane.buffer
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer

    val yRowStride = yPlane.rowStride
    val uvRowStride = uPlane.rowStride
    val uvPixelStride = uPlane.pixelStride

    val width = image.width
    val height = image.height

    val argbPixels = IntArray(width * height)

    for (row in 0 until height) {
      for (col in 0 until width) {
        val yIndex = row * yRowStride + col
        val uvRow = row / 2
        val uvCol = col / 2
        val uvIndex = uvRow * uvRowStride + uvCol * uvPixelStride

        val y = (yBuffer.get(yIndex).toInt() and 0xFF) - 16
        val u = (uBuffer.get(uvIndex).toInt() and 0xFF) - 128
        val v = (vBuffer.get(uvIndex).toInt() and 0xFF) - 128

        val r = (1.164f * y + 1.596f * v).toInt().coerceIn(0, 255)
        val g = (1.164f * y - 0.813f * v - 0.391f * u).toInt().coerceIn(0, 255)
        val b = (1.164f * y + 2.018f * u).toInt().coerceIn(0, 255)

        argbPixels[row * width + col] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
      }
    }

    var bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    bitmap.setPixels(argbPixels, 0, width, 0, 0, width, height)

    // Apply rotation if needed
    if (rotationDegrees != 0) {
      val matrix = Matrix()
      matrix.postRotate(rotationDegrees.toFloat())
      val rotated = Bitmap.createBitmap(bitmap, 0, 0, width, height, matrix, true)
      bitmap.recycle()
      bitmap = rotated
    }

    return bitmap
  }
}
