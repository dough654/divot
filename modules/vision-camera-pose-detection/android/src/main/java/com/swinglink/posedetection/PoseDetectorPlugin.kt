package com.swinglink.posedetection

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

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val image = frame.image
    val rotationDegrees = orientationToDegrees(frame.orientation)

    return detector.detectPose(image, rotationDegrees)
  }

  companion object {
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
