package com.swinglink.posedetection

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

/**
 * Expo Module that registers the "detectPose" frame processor plugin.
 *
 * The plugin uses MediaPipe Pose Landmarker (BlazePose) to detect
 * 14 body joints and returns a flat DoubleArray of 42 values
 * (x, y, confidence per joint).
 */
class VisionCameraPoseDetectionModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("VisionCameraPoseDetection")

    OnCreate {
      Log.d(TAG, "Registering detectPose frame processor plugin")
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectPose") { _, _ ->
        PoseDetectorPlugin()
      }
    }

    Function("isAvailable") {
      return@Function true
    }

    Function("getLatestPose") {
      val data = PoseDetectorPlugin.latestPoseData
      if (pollCount++ % 100L == 0L) {
        Log.d(TAG, "getLatestPose poll #$pollCount: ${if (data != null) "${data.size} values" else "null"}")
      }
      return@Function data
    }
  }

  companion object {
    private const val TAG = "PoseDetection"
    private var pollCount = 0L
  }
}
