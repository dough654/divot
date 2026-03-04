package com.divotgolf.videoposeanalysis

import android.content.Context
import android.graphics.Bitmap
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.core.Delegate
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import java.nio.ByteBuffer

/**
 * Runs MediaPipe pose detection on Bitmap frames from video.
 *
 * Adapted from vision-camera-pose-detection MediaPipePoseDetector.
 * Uses VIDEO running mode for temporal tracking benefits across frames.
 * Takes Bitmap directly (no YUV conversion needed — video decoder outputs RGB).
 */
class VideoPoseDetector(private val context: Context) {

    private var poseLandmarker: PoseLandmarker? = null
    private var initFailed = false

    val isReady: Boolean get() = poseLandmarker != null && !initFailed

    companion object {
        private const val TAG = "VideoPoseAnalysis"
        private const val MODEL_ASSET = "pose_landmarker_lite.task"
    }

    /**
     * Maps our 24-joint model to MediaPipe landmark indices.
     * -1 means "neck" = computed as midpoint of left_shoulder (11) and right_shoulder (12).
     */
    private val landmarkMapping = listOf(
        0,   // nose
        -1,  // neck (midpoint of shoulders)
        11,  // left_shoulder
        12,  // right_shoulder
        13,  // left_elbow
        14,  // right_elbow
        15,  // left_wrist
        16,  // right_wrist
        23,  // left_hip
        24,  // right_hip
        25,  // left_knee
        26,  // right_knee
        27,  // left_ankle
        28,  // right_ankle
        17,  // left_pinky
        18,  // right_pinky
        19,  // left_index
        20,  // right_index
        21,  // left_thumb
        22,  // right_thumb
        29,  // left_heel
        30,  // right_heel
        31,  // left_foot_index
        32,  // right_foot_index
    )

    init {
        loadModel()
    }

    private fun loadModel() {
        try {
            Log.d(TAG, "Initializing MediaPipe PoseLandmarker for video analysis")

            val modelBuffer = context.assets.open(MODEL_ASSET).use { inputStream ->
                val bytes = inputStream.readBytes()
                ByteBuffer.allocateDirect(bytes.size).also {
                    it.put(bytes)
                    it.rewind()
                }
            }
            Log.d(TAG, "Model loaded into buffer: ${modelBuffer.capacity()} bytes")

            poseLandmarker = createLandmarker(modelBuffer, useGpu = true)
                ?: createLandmarker(modelBuffer, useGpu = false)

            if (poseLandmarker != null) {
                Log.d(TAG, "MediaPipe PoseLandmarker created for video analysis")
            } else {
                Log.e(TAG, "Failed to create PoseLandmarker with both GPU and CPU delegates")
                initFailed = true
            }
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to create PoseLandmarker: ${e.javaClass.simpleName}: ${e.message}")
            initFailed = true
        }
    }

    private fun createLandmarker(modelBuffer: ByteBuffer, useGpu: Boolean): PoseLandmarker? {
        return try {
            modelBuffer.rewind()
            val baseOptionsBuilder = BaseOptions.builder()
                .setModelAssetBuffer(modelBuffer)
            if (useGpu) {
                baseOptionsBuilder.setDelegate(Delegate.GPU)
            }

            val options = PoseLandmarker.PoseLandmarkerOptions.builder()
                .setBaseOptions(baseOptionsBuilder.build())
                .setRunningMode(RunningMode.VIDEO)
                .setNumPoses(1)
                .setMinPoseDetectionConfidence(0.5f)
                .setMinPosePresenceConfidence(0.5f)
                .setMinTrackingConfidence(0.5f)
                .build()

            val landmarker = PoseLandmarker.createFromOptions(context, options)
            Log.d(TAG, "PoseLandmarker created with ${if (useGpu) "GPU" else "CPU"} delegate")
            landmarker
        } catch (e: Throwable) {
            Log.w(TAG, "${if (useGpu) "GPU" else "CPU"} delegate failed: ${e.message}")
            null
        }
    }

    /**
     * Detects pose landmarks from a Bitmap frame.
     *
     * @param bitmap The video frame as ARGB_8888 bitmap
     * @param timestampMs Frame timestamp for VIDEO mode temporal tracking
     * @param rotationDegrees Video rotation from MediaFormat (0, 90, 180, 270)
     * @return 72-element array [x, y, confidence] × 24 joints, or null
     */
    fun detectPose(bitmap: Bitmap, timestampMs: Long, rotationDegrees: Int): List<Double>? {
        val landmarker = poseLandmarker ?: return null
        if (initFailed) return null

        val mpImage = BitmapImageBuilder(bitmap).build()

        val result = try {
            landmarker.detectForVideo(mpImage, timestampMs)
        } catch (e: Exception) {
            Log.w(TAG, "PoseLandmarker.detectForVideo() failed: ${e.message}")
            return null
        }

        val landmarks = result.landmarks()
        if (landmarks.isEmpty() || landmarks[0].size < 33) {
            return null
        }

        val poseLandmarks = landmarks[0]
        val output = MutableList(72) { 0.0 }

        for ((index, mpIndex) in landmarkMapping.withIndex()) {
            val offset = index * 3

            if (mpIndex == -1) {
                val leftShoulder = poseLandmarks[11]
                val rightShoulder = poseLandmarks[12]

                output[offset] = ((leftShoulder.x() + rightShoulder.x()) / 2.0).toDouble()
                output[offset + 1] = ((leftShoulder.y() + rightShoulder.y()) / 2.0).toDouble()
                val leftVis = leftShoulder.visibility()
                val rightVis = rightShoulder.visibility()
                output[offset + 2] = minOf(
                    if (leftVis.isPresent) leftVis.get() else 0f,
                    if (rightVis.isPresent) rightVis.get() else 0f
                ).toDouble()
                continue
            }

            if (mpIndex >= poseLandmarks.size) continue
            val lm = poseLandmarks[mpIndex]

            output[offset] = lm.x().toDouble()
            output[offset + 1] = lm.y().toDouble()
            val vis = lm.visibility()
            output[offset + 2] = if (vis.isPresent) vis.get().toDouble() else 0.0
        }

        // Rotate landmark coordinates if video has rotation metadata
        if (rotationDegrees != 0) {
            for (i in 0 until output.size step 3) {
                val x = output[i]
                val y = output[i + 1]
                when (rotationDegrees) {
                    90  -> { output[i] = 1.0 - y; output[i + 1] = x }
                    180 -> { output[i] = 1.0 - x; output[i + 1] = 1.0 - y }
                    270 -> { output[i] = y;        output[i + 1] = 1.0 - x }
                }
            }
        }

        return output
    }

    fun close() {
        poseLandmarker?.close()
        poseLandmarker = null
    }
}
