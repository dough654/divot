package com.divotgolf.framediff

import android.util.Log
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin

/**
 * VisionCamera frame processor plugin that computes luminance-based
 * frame differencing on each camera frame.
 *
 * Registered as "frameDiff" from [VisionCameraFrameDiffModule].
 * Called from JS via: `VisionCameraProxy.initFrameProcessorPlugin('frameDiff')`
 *
 * Returns a Double (0-1 motion magnitude), or null on first frame.
 */
class FrameDiffPlugin : FrameProcessorPlugin() {

  private val computer = FrameDiffComputer()

  init {
    Log.d(TAG, "FrameDiffPlugin instance created")
  }

  override fun callback(frame: Frame, arguments: Map<String, Any>?): Any? {
    val image = frame.image
    val result = computer.computeDiff(image)

    latestMotion = result

    if (frameCount % LOG_INTERVAL == 0L && result != null) {
      Log.d(TAG, "Frame #$frameCount: motion=%.4f".format(result))
    }
    frameCount++

    return result
  }

  companion object {
    private const val TAG = "FrameDiff"
    private const val LOG_INTERVAL = 60L
    private var frameCount = 0L

    /** Latest motion magnitude. Written from frame processor thread, read from JS thread. */
    @Volatile
    var latestMotion: Double? = null
  }
}
