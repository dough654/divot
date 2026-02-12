package com.swinglink.posedetection

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry

/**
 * Expo Module that registers the "detectPose" frame processor plugin.
 *
 * The plugin uses ML Kit Pose Detection (base model, bundled) to detect
 * 14 body joints and returns a flat DoubleArray of 42 values
 * (x, y, confidence per joint).
 */
class VisionCameraPoseDetectionModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("VisionCameraPoseDetection")

    OnCreate {
      FrameProcessorPluginRegistry.addFrameProcessorPlugin("detectPose") { _, _ ->
        PoseDetectorPlugin()
      }
    }

    Function("isAvailable") {
      return@Function true
    }

    Function("getLatestPose") {
      return@Function PoseDetectorPlugin.latestPoseData
    }
  }
}
