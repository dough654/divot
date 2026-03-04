package com.divotgolf.videoposeanalysis

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class VideoPoseAnalysisModule : Module() {
    companion object {
        private const val TAG = "VideoPoseAnalysis"
    }

    @Volatile
    private var currentPipeline: VideoPosePipeline? = null

    override fun definition() = ModuleDefinition {
        Name("VideoPoseAnalysis")

        Events("onPoseAnalysisProgress")

        AsyncFunction("analyzeVideo") { filePath: String, clipId: String ->
            Log.d(TAG, "analyzeVideo called: clipId=$clipId, path=$filePath")

            val context = appContext.reactContext
                ?: throw IllegalStateException("React context not available")

            val pipeline = VideoPosePipeline(context, filePath)
            currentPipeline = pipeline

            pipeline.onProgress = { progress, currentFrame, totalFrames ->
                sendEvent("onPoseAnalysisProgress", mapOf(
                    "progress" to progress,
                    "currentFrame" to currentFrame,
                    "totalFrames" to totalFrames,
                ))
            }

            val result = pipeline.run(clipId)
            currentPipeline = null
            result
        }

        Function("cancelAnalysis") {
            Log.d(TAG, "cancelAnalysis called")
            currentPipeline?.isCancelled = true
        }

        OnDestroy {
            Log.d(TAG, "OnDestroy: cancelling any running analysis")
            currentPipeline?.isCancelled = true
            currentPipeline = null
        }
    }
}
