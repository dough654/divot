package com.swinglink.visioncamerawebrtcbridge

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
    return null
  }

  companion object {
    /** Convert VisionCamera Orientation enum to rotation degrees for WebRTC. */
    private fun orientationToDegrees(orientation: Orientation): Int =
      when (orientation) {
        Orientation.PORTRAIT -> 0
        Orientation.LANDSCAPE_RIGHT -> 90
        Orientation.PORTRAIT_UPSIDE_DOWN -> 180
        Orientation.LANDSCAPE_LEFT -> 270
      }
  }
}
