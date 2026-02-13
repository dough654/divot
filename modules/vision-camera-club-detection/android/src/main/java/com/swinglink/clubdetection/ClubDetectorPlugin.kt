package com.swinglink.clubdetection

import android.content.Context
import android.util.Log
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin

/**
 * VisionCamera frame processor plugin that runs a custom YOLOv8-nano-pose
 * TFLite model on each camera frame to detect golf club keypoints.
 *
 * Registered as "detectClub" from [VisionCameraClubDetectionModule].
 * Called from JS via: `VisionCameraProxy.initFrameProcessorPlugin('detectClub')`
 *
 * Returns a list of 6 Doubles (2 keypoints × [x, y, confidence]):
 *   [grip_x, grip_y, grip_conf, head_x, head_y, head_conf]
 * or null if no club was detected.
 */
class ClubDetectorPlugin(context: Context) : FrameProcessorPlugin() {

  private val detector = TFLiteClubDetector(context)

  init {
    Log.d(TAG, "ClubDetectorPlugin instance created")
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val image = frame.image
    val rotationDegrees = orientationToDegrees(frame.orientation)

    val result = detector.detectClub(image, rotationDegrees)
    latestClubData = result

    if (frameCount % LOG_INTERVAL == 0L) {
      if (result != null) {
        Log.d(TAG, "Frame #$frameCount: club detected (${result.size} values)")
      } else {
        Log.d(TAG, "Frame #$frameCount: no club detected")
      }
    }
    frameCount++

    return result
  }

  companion object {
    private const val TAG = "ClubDetection"
    private const val LOG_INTERVAL = 60L
    private var frameCount = 0L

    /** Latest club result. Written from frame processor thread, read from JS thread. */
    @Volatile
    var latestClubData: List<Double>? = null

    /**
     * Convert VisionCamera Orientation enum to rotation degrees for image preprocessing.
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
