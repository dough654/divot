package com.divotgolf.posedetection

import android.content.Context
import android.util.Log
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * VisionCamera frame processor plugin that runs MediaPipe Pose Landmarker
 * on each camera frame.
 *
 * Detection runs on a background thread to avoid blocking the camera
 * pipeline (which would drop the preview framerate to the detection rate).
 * The frame processor callback downsamples 3x during the YUV copy (<1ms)
 * and dispatches detection to a single-thread executor.
 *
 * Registered as "detectPose" from [VisionCameraPoseDetectionModule].
 * Called from JS via: `VisionCameraProxy.initFrameProcessorPlugin('detectPose')`
 */
class PoseDetectorPlugin(private val appContext: Context) : FrameProcessorPlugin() {

  private var detector: MediaPipePoseDetector? = null
  private val detectionExecutor = Executors.newSingleThreadExecutor()
  private val detectionInProgress = AtomicBoolean(false)

  // Pre-allocated byte arrays for downsampled YUV data, reused across frames.
  // Safe because detectionInProgress gate prevents concurrent read/write.
  private var dsYBytes: ByteArray? = null
  private var dsUBytes: ByteArray? = null
  private var dsVBytes: ByteArray? = null
  private var cachedWidth = 0
  private var cachedHeight = 0

  init {
    Log.d(TAG, "PoseDetectorPlugin instance created")
  }

  /** Ensure downsampled byte arrays match the current frame dimensions. */
  private fun ensureDownsampleBuffers(width: Int, height: Int) {
    if (width != cachedWidth || height != cachedHeight) {
      val outW = width / DOWNSAMPLE
      val outH = height / DOWNSAMPLE
      val uvOutW = outW / 2
      val uvOutH = outH / 2
      dsYBytes = ByteArray(outW * outH)
      dsUBytes = ByteArray(uvOutW * uvOutH)
      dsVBytes = ByteArray(uvOutW * uvOutH)
      cachedWidth = width
      cachedHeight = height
    }
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    // Lazily initialize detector on first frame
    if (detector == null) {
      detector = MediaPipePoseDetector(appContext)
      modelStatus = if (detector?.isReady == true) "loaded" else "init_failed"
    }

    // Skip if previous detection is still running
    if (detectionInProgress.get()) {
      return null
    }

    val image = frame.image
    val rotationDegrees = orientationToDegrees(frame.orientation)
    val width = image.width
    val height = image.height
    val outW = width / DOWNSAMPLE
    val outH = height / DOWNSAMPLE
    val uvOutW = outW / 2
    val uvOutH = outH / 2

    ensureDownsampleBuffers(width, height)
    val dsY = dsYBytes!!
    val dsU = dsUBytes!!
    val dsV = dsVBytes!!

    // Downsample during copy: read every 3rd pixel in every 3rd row.
    // Reduces synchronous blocking from ~2-3ms (full 3MB copy) to <1ms (~350KB).
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]

    val yBuffer = yPlane.buffer.duplicate()
    val uBuffer = uPlane.buffer.duplicate()
    val vBuffer = vPlane.buffer.duplicate()

    val yRowStride = yPlane.rowStride
    val uvRowStride = uPlane.rowStride
    val uvPixelStride = uPlane.pixelStride

    // Y plane: every 3rd pixel in every 3rd row
    for (outRow in 0 until outH) {
      val srcRowOffset = outRow * DOWNSAMPLE * yRowStride
      for (outCol in 0 until outW) {
        dsY[outRow * outW + outCol] = yBuffer.get(srcRowOffset + outCol * DOWNSAMPLE)
      }
    }

    // UV planes: every 3rd UV pair in every 3rd UV row
    for (outRow in 0 until uvOutH) {
      val srcRowOffset = outRow * DOWNSAMPLE * uvRowStride
      for (outCol in 0 until uvOutW) {
        val srcIndex = srcRowOffset + outCol * DOWNSAMPLE * uvPixelStride
        dsU[outRow * uvOutW + outCol] = uBuffer.get(srcIndex)
        dsV[outRow * uvOutW + outCol] = vBuffer.get(srcIndex)
      }
    }

    val timestampMs = frame.timestamp / 1_000_000L  // ns → ms for MediaPipe VIDEO mode

    // Dispatch detection to background thread — frame processor returns immediately
    detectionInProgress.set(true)
    detectionExecutor.submit {
      try {
        val result = detector?.detectPoseFromYuv(
          dsY, dsU, dsV,
          outW, outH,
          rotationDegrees,
          timestampMs,
        )

        // Always flip x-coordinates to match the camera preview:
        // - Front camera: preview is mirrored (standard selfie behavior)
        // - Rear camera: buffer rotation inverts the x-axis relative to the preview
        if (result != null) {
          val flipped = result.toMutableList()
          for (i in flipped.indices step 3) {
            flipped[i] = 1.0 - flipped[i]
          }
          latestPoseData = flipped
        } else {
          latestPoseData = result
        }

        if (frameCount % LOG_INTERVAL == 0L) {
          if (result != null) {
            val maxConf = (2 until result.size step 3).maxOfOrNull { result[it] } ?: 0.0
            val noseX = result[0]; val noseY = result[1]
            val hipX = result[24]; val hipY = result[25]
            Log.d(TAG, "Frame #$frameCount: pose detected (rot=${rotationDegrees}° ds=${outW}x${outH} " +
              "nose=%.2f,%.2f hip=%.2f,%.2f maxConf=%.2f)".format(noseX, noseY, hipX, hipY, maxConf))
          } else {
            Log.d(TAG, "Frame #$frameCount: no pose detected (rot=${rotationDegrees}° ds=${outW}x${outH})")
          }
        }
        frameCount++
      } finally {
        detectionInProgress.set(false)
      }
    }

    return null
  }

  companion object {
    private const val TAG = "PoseDetection"
    private const val LOG_INTERVAL = 60L
    private const val DOWNSAMPLE = 3
    private var frameCount = 0L

    /** Latest pose result. Written from detection thread, read from JS thread. */
    @Volatile
    var latestPoseData: List<Double>? = null

    /** Model initialization status, readable from JS for diagnostics. */
    @Volatile
    var modelStatus: String = "not_initialized"


    /** Convert VisionCamera Orientation enum to rotation degrees. */
    private fun orientationToDegrees(orientation: com.mrousavy.camera.core.types.Orientation): Int =
      when (orientation) {
        com.mrousavy.camera.core.types.Orientation.PORTRAIT -> 0
        com.mrousavy.camera.core.types.Orientation.LANDSCAPE_RIGHT -> 90
        com.mrousavy.camera.core.types.Orientation.PORTRAIT_UPSIDE_DOWN -> 180
        com.mrousavy.camera.core.types.Orientation.LANDSCAPE_LEFT -> 270
      }
  }
}
