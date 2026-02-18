package com.divotgolf.visioncamerawebrtcbridge

import com.mrousavy.camera.core.types.Orientation
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin

/**
 * VisionCamera frame processor plugin that forwards each camera frame
 * to [VisionCameraFrameForwarder] for injection into the WebRTC video track.
 *
 * Registered as "forwardToWebRTC" from [VisionCameraWebRTCBridgeModule].
 * Called from JS via: `VisionCameraProxy.initFrameProcessorPlugin('forwardToWebRTC')`
 */
class WebRTCFrameProcessorPlugin : FrameProcessorPlugin() {

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val image = frame.image
    val timestampNs = frame.timestamp
    val rotationDegrees = orientationToDegrees(frame.orientation)

    VisionCameraFrameForwarder.pushFrame(image, timestampNs, rotationDegrees)
    return rotationDegrees
  }

  companion object {
    /**
     * Convert VisionCamera Orientation enum to rotation degrees for WebRTC.
     *
     * VisionCamera determines frame orientation from the device's accelerometer, NOT from
     * the Activity's UI orientation. This means once `app.config.ts` sets `orientation: 'default'`,
     * frame.orientation will correctly report landscape values when the device is rotated,
     * even if the UI doesn't rotate on certain screens.
     *
     * Mapping:
     *   PORTRAIT           → 0°   (device upright, no rotation)
     *   LANDSCAPE_RIGHT    → 90°  (device rotated 90° clockwise from portrait)
     *   PORTRAIT_UPSIDE_DOWN → 180°
     *   LANDSCAPE_LEFT     → 270° (device rotated 90° counter-clockwise from portrait)
     *
     * WebRTC interprets these as clockwise rotation needed to display the frame upright.
     */
    private fun orientationToDegrees(orientation: Orientation): Int =
      when (orientation) {
        Orientation.PORTRAIT -> 0
        Orientation.LANDSCAPE_RIGHT -> 90
        Orientation.PORTRAIT_UPSIDE_DOWN -> 180
        Orientation.LANDSCAPE_LEFT -> 270
      }
  }
}
