package com.divotgolf.videoposeanalysis

import android.content.Context
import android.util.Log

/**
 * Orchestrates frame extraction → pose detection across all frames of a video.
 * Mirrors the iOS VideoPosePipeline structure.
 */
class VideoPosePipeline(
    private val context: Context,
    private val filePath: String,
) {
    companion object {
        private const val TAG = "VideoPoseAnalysis"
        private const val PROGRESS_INTERVAL = 10
    }

    /** Called every N frames with progress (0-1), currentFrame, totalFrames. */
    var onProgress: ((Double, Int, Int) -> Unit)? = null

    /** Set to true to cancel processing between frames. */
    @Volatile
    var isCancelled = false

    /**
     * Runs pose detection on every frame and returns results as a map
     * matching the TypeScript VideoPoseAnalysisResult type.
     */
    fun run(clipId: String): Map<String, Any> {
        val startTime = System.currentTimeMillis()
        val detector = VideoPoseDetector(context)

        if (!detector.isReady) {
            throw IllegalStateException("Pose detection model failed to load")
        }

        val extractor = VideoFrameExtractor(filePath)
        val totalFrames = extractor.totalFrames
        val fps = extractor.frameRate
        val rotationDegrees = extractor.rotationDegrees

        Log.d(TAG, "Starting pose pipeline: $totalFrames frames at $fps fps")

        val frameResults = mutableListOf<Map<String, Any>>()
        var analysisWidth = 0
        var analysisHeight = 0

        extractor.use { ext ->
            ext.extractFrames { frameIndex, timestampMs, bitmap ->
                if (isCancelled) {
                    Log.d(TAG, "Analysis cancelled at frame $frameIndex")
                    return@extractFrames false
                }

                if (frameIndex % PROGRESS_INTERVAL == 0) {
                    val progress = frameIndex.toDouble() / totalFrames.toDouble()
                    onProgress?.invoke(progress, frameIndex, totalFrames)
                }

                if (analysisWidth == 0) {
                    analysisWidth = bitmap.width
                    analysisHeight = bitmap.height
                    Log.d(TAG, "Actual frame size: ${analysisWidth}x$analysisHeight")
                }

                val landmarks = detector.detectPose(bitmap, timestampMs, rotationDegrees)
                if (landmarks != null) {
                    frameResults.add(mapOf(
                        "frameIndex" to frameIndex,
                        "timestampMs" to timestampMs.toDouble(),
                        "landmarks" to landmarks,
                    ))
                }

                true // continue
            }
        }

        detector.close()

        if (isCancelled) {
            throw InterruptedException("Analysis was cancelled")
        }

        // Final progress
        onProgress?.invoke(1.0, totalFrames, totalFrames)

        val analysisTimeMs = (System.currentTimeMillis() - startTime).toDouble()

        Log.d(TAG, "Pose pipeline complete: ${frameResults.size}/$totalFrames frames detected in ${analysisTimeMs.toInt()}ms")

        return mapOf(
            "clipId" to clipId,
            "totalFrames" to totalFrames,
            "analyzedFrames" to frameResults.size,
            "frames" to frameResults,
            "analysisTimeMs" to analysisTimeMs,
            "fps" to fps.toDouble(),
            "resolution" to mapOf(
                "width" to analysisWidth,
                "height" to analysisHeight,
            ),
        )
    }
}
