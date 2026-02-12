package com.swinglink.posedetection

import android.util.Log
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin

/**
 * VisionCamera frame processor plugin that runs ML Kit body pose
 * detection on each camera frame.
 *
 * Registered as "detectPose" from [VisionCameraPoseDetectionModule].
 * Called from JS via: `VisionCameraProxy.initFrameProcessorPlugin('detectPose')`
 *
 * Returns a list of 42 Doubles (14 joints × [x, y, confidence]),
 * or null if no pose was detected.
 */
class PoseDetectorPlugin : FrameProcessorPlugin() {

  private val detector = MLKitPoseDetector()

  init {
    Log.d(TAG, "PoseDetectorPlugin instance created")
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val image = frame.image
    val rotationDegrees = orientationToDegrees(frame.orientation)

    val result = detector.detectPose(image, rotationDegrees)
    latestPoseData = result

    if (frameCount % LOG_INTERVAL == 0L) {
      if (result != null) {
        val maxConf = (2 until result.size step 3).maxOfOrNull { result[it] } ?: 0.0
        Log.d(TAG, "Frame #$frameCount: pose detected (${result.size} values, maxConf=%.2f)".format(maxConf))
      } else {
        Log.d(TAG, "Frame #$frameCount: no pose detected")
      }
    }
    frameCount++

    return result
  }

  companion object {
    private const val TAG = "PoseDetection"
    private const val LOG_INTERVAL = 60L
    private var frameCount = 0L

    /** Latest pose result. Written from frame processor thread, read from JS thread. */
    @Volatile
    var latestPoseData: List<Double>? = null

    /**
     * Convert VisionCamera Orientation enum to rotation degrees for ML Kit.
     * ML Kit needs to know the image rotation to detect poses correctly.
     */
    private fun orientationToDegrees(orientation: com.mrousavy.camera.core.types.Orientation): Int =
      when (orientation) {
        com.mrousavy.camera.core.types.Orientation.PORTRAIT -> 0
        com.mrousavy.camera.core.types.Orientation.LANDSCAPE_RIGHT -> 90
        com.mrousavy.camera.core.types.Orientation.PORTRAIT_UPSIDE_DOWN -> 180
        com.mrousavy.camera.core.types.Orientation.LANDSCAPE_LEFT -> 270
      }
  }
}
