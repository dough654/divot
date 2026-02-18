package com.divotgolf.clubdetection

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

/**
 * Expo Module that registers the "detectClub" frame processor plugin.
 *
 * The plugin uses a custom YOLOv8-nano-pose TFLite model to detect
 * golf club keypoints (grip and clubhead) and returns a flat list of
 * 6 Doubles (x, y, confidence per keypoint).
 */
class VisionCameraClubDetectionModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("VisionCameraClubDetection")

    OnCreate {
      Log.d(TAG, "Registering detectClub frame processor plugin")
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectClub") { _, _ ->
        ClubDetectorPlugin(appContext.reactContext!!)
      }
    }

    Function("isAvailable") {
      return@Function true
    }

    Function("getLatestClub") {
      val data = ClubDetectorPlugin.latestClubData
      if (pollCount++ % 100L == 0L) {
        Log.d(TAG, "getLatestClub poll #$pollCount: ${if (data != null) "${data.size} values" else "null"}")
      }
      return@Function data
    }
  }

  companion object {
    private const val TAG = "ClubDetection"
    private var pollCount = 0L
  }
}
