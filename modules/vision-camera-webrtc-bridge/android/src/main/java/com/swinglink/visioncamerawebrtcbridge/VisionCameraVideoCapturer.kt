package com.swinglink.visioncamerawebrtcbridge

import android.content.Context
import org.webrtc.CapturerObserver
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer

/**
 * Dummy VideoCapturer implementation used to create a VideoTrack through
 * react-native-webrtc's standard API. We never call startCapture —
 * frames are pushed manually via [VisionCameraFrameForwarder].
 *
 * The capturerObserver is stored and handed to the forwarder so it can
 * push VideoFrames directly.
 */
class VisionCameraVideoCapturer : VideoCapturer {
  var capturerObserver: CapturerObserver? = null
    private set

  override fun initialize(
    surfaceTextureHelper: SurfaceTextureHelper?,
    context: Context?,
    observer: CapturerObserver?
  ) {
    capturerObserver = observer
  }

  override fun startCapture(width: Int, height: Int, fps: Int) {
    // No-op: frames are pushed by VisionCameraFrameForwarder
  }

  override fun stopCapture() {
    // No-op
  }

  override fun changeCaptureFormat(width: Int, height: Int, fps: Int) {
    // No-op
  }

  override fun dispose() {
    capturerObserver = null
  }

  override fun isScreencast(): Boolean = false
}
