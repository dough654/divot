package com.swinglink.posedetection

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
 * The frame processor callback quickly copies the YUV byte data (~2ms)
 * and dispatches detection to a single-thread executor.
 *
 * Registered as "detectPose" from [VisionCameraPoseDetectionModule].
 * Called from JS via: `VisionCameraProxy.initFrameProcessorPlugin('detectPose')`
 */
class PoseDetectorPlugin(private val appContext: Context) : FrameProcessorPlugin() {

  private var detector: MediaPipePoseDetector? = null
  private val detectionExecutor = Executors.newSingleThreadExecutor()
  private val detectionInProgress = AtomicBoolean(false)

  init {
    Log.d(TAG, "PoseDetectorPlugin instance created")
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

    val mirror = arguments?.get("mirror") as? Boolean ?: false
    val image = frame.image
    val rotationDegrees = orientationToDegrees(frame.orientation)

    // Quick copy of YUV plane data (~2ms for 1080p)
    // Must happen synchronously before frame is recycled by VisionCamera
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]

    val yBuffer = yPlane.buffer.duplicate()
    val uBuffer = uPlane.buffer.duplicate()
    val vBuffer = vPlane.buffer.duplicate()

    yBuffer.rewind()
    uBuffer.rewind()
    vBuffer.rewind()

    val yBytes = ByteArray(yBuffer.remaining())
    yBuffer.get(yBytes)

    val uBytes = ByteArray(uBuffer.remaining())
    uBuffer.get(uBytes)

    val vBytes = ByteArray(vBuffer.remaining())
    vBuffer.get(vBytes)

    val width = image.width
    val height = image.height
    val yRowStride = yPlane.rowStride
    val uvRowStride = uPlane.rowStride
    val uvPixelStride = uPlane.pixelStride

    // Dispatch detection to background thread — frame processor returns immediately
    detectionInProgress.set(true)
    detectionExecutor.submit {
      try {
        val result = detector?.detectPoseFromYuv(
          yBytes, uBytes, vBytes,
          width, height,
          yRowStride, uvRowStride, uvPixelStride,
          rotationDegrees,
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
            Log.d(TAG, "Frame #$frameCount: pose detected (rot=${rotationDegrees}° img=${width}x${height} " +
              "nose=%.2f,%.2f hip=%.2f,%.2f maxConf=%.2f)".format(noseX, noseY, hipX, hipY, maxConf))
          } else {
            Log.d(TAG, "Frame #$frameCount: no pose detected (rot=${rotationDegrees}° img=${width}x${height})")
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
