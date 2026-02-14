package com.swinglink.framediff

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

/**
 * Expo Module that registers the "frameDiff" frame processor plugin.
 *
 * The plugin computes luminance-based frame differencing on camera frames
 * and stores the result for JS polling via getLatestMotion().
 */
class VisionCameraFrameDiffModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("VisionCameraFrameDiff")

    OnCreate {
      Log.d(TAG, "Registering frameDiff frame processor plugin")
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("frameDiff") { _, _ ->
        FrameDiffPlugin()
      }
    }

    Function("getLatestMotion") {
      return@Function FrameDiffPlugin.latestMotion
    }
  }

  companion object {
    private const val TAG = "FrameDiff"
  }
}
