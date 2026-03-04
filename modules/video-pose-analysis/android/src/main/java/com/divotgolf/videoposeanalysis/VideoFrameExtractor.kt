package com.divotgolf.videoposeanalysis

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.media.Image
import android.media.ImageReader
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.util.Log
import android.view.Surface

/**
 * Extracts individual frames from a video file using MediaCodec.
 *
 * Uses MediaCodec + ImageReader surface for efficient frame extraction.
 * Decodes every frame at the video's native framerate.
 */
class VideoFrameExtractor(private val filePath: String) : AutoCloseable {

    companion object {
        private const val TAG = "VideoPoseAnalysis"
        private const val TARGET_HEIGHT = 480
        private const val TIMEOUT_US = 10_000L
    }

    private val extractor = MediaExtractor()
    private var decoder: MediaCodec? = null
    private var imageReader: ImageReader? = null

    val frameRate: Float
    val totalFrames: Int
    val rotationDegrees: Int
    val width: Int
    val height: Int

    private val trackIndex: Int
    private val format: MediaFormat

    init {
        val path = if (filePath.startsWith("file://")) {
            filePath.removePrefix("file://")
        } else {
            filePath
        }

        extractor.setDataSource(path)

        // Find video track
        var foundTrack = -1
        var foundFormat: MediaFormat? = null
        for (i in 0 until extractor.trackCount) {
            val trackFormat = extractor.getTrackFormat(i)
            val mime = trackFormat.getString(MediaFormat.KEY_MIME) ?: continue
            if (mime.startsWith("video/")) {
                foundTrack = i
                foundFormat = trackFormat
                break
            }
        }

        if (foundTrack < 0 || foundFormat == null) {
            throw IllegalArgumentException("No video track found in file")
        }

        trackIndex = foundTrack
        format = foundFormat
        extractor.selectTrack(trackIndex)

        val naturalWidth = format.getInteger(MediaFormat.KEY_WIDTH)
        val naturalHeight = format.getInteger(MediaFormat.KEY_HEIGHT)
        rotationDegrees = if (format.containsKey(MediaFormat.KEY_ROTATION)) {
            format.getInteger(MediaFormat.KEY_ROTATION)
        } else {
            0
        }

        // Downsample to ~480p
        val scale = TARGET_HEIGHT.toFloat() / naturalHeight.toFloat()
        width = (naturalWidth * scale).toInt()
        height = TARGET_HEIGHT

        val durationUs = format.getLong(MediaFormat.KEY_DURATION)
        frameRate = if (format.containsKey(MediaFormat.KEY_FRAME_RATE)) {
            format.getInteger(MediaFormat.KEY_FRAME_RATE).toFloat()
        } else {
            30f
        }
        totalFrames = ((durationUs / 1_000_000.0) * frameRate).toInt()

        Log.d(TAG, "VideoFrameExtractor: $totalFrames frames at $frameRate fps, " +
            "natural=${naturalWidth}x${naturalHeight}, target=${width}x$height, rotation=$rotationDegrees")
    }

    /**
     * Callback for each decoded frame.
     * @param frameIndex Zero-based frame index
     * @param timestampMs Frame timestamp in milliseconds
     * @param bitmap The decoded frame as ARGB_8888 bitmap
     * @return false to stop extraction, true to continue
     */
    fun extractFrames(onFrame: (frameIndex: Int, timestampMs: Long, bitmap: Bitmap) -> Boolean) {
        val mime = format.getString(MediaFormat.KEY_MIME)
            ?: throw IllegalStateException("No MIME type in video format")

        // Configure ImageReader as output surface
        val reader = ImageReader.newInstance(width, height, ImageFormat.YUV_420_888, 2)
        imageReader = reader

        val codec = MediaCodec.createDecoderByType(mime)
        decoder = codec

        // Apply downscale dimensions
        val outputFormat = MediaFormat.createVideoFormat(mime, width, height)
        // Copy duration and other keys
        if (format.containsKey(MediaFormat.KEY_DURATION)) {
            outputFormat.setLong(MediaFormat.KEY_DURATION, format.getLong(MediaFormat.KEY_DURATION))
        }

        codec.configure(format, reader.surface, null, 0)
        codec.start()

        val bufferInfo = MediaCodec.BufferInfo()
        var inputDone = false
        var outputDone = false
        var frameIndex = 0

        // Pre-allocate bitmap conversion buffers
        var rgbPixels: IntArray? = null
        var rgbBitmap: Bitmap? = null

        while (!outputDone) {
            // Feed input
            if (!inputDone) {
                val inputBufferIndex = codec.dequeueInputBuffer(TIMEOUT_US)
                if (inputBufferIndex >= 0) {
                    val inputBuffer = codec.getInputBuffer(inputBufferIndex)
                    if (inputBuffer != null) {
                        val sampleSize = extractor.readSampleData(inputBuffer, 0)
                        if (sampleSize < 0) {
                            codec.queueInputBuffer(inputBufferIndex, 0, 0, 0,
                                MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            val presentationTimeUs = extractor.sampleTime
                            codec.queueInputBuffer(inputBufferIndex, 0, sampleSize,
                                presentationTimeUs, 0)
                            extractor.advance()
                        }
                    }
                }
            }

            // Read output
            val outputBufferIndex = codec.dequeueOutputBuffer(bufferInfo, TIMEOUT_US)
            if (outputBufferIndex >= 0) {
                if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                    outputDone = true
                    codec.releaseOutputBuffer(outputBufferIndex, true)
                    continue
                }

                // Render to ImageReader surface
                codec.releaseOutputBuffer(outputBufferIndex, true)

                // Read the image from ImageReader
                val image = reader.acquireLatestImage()
                if (image != null) {
                    val timestampMs = bufferInfo.presentationTimeUs / 1000

                    // Convert Image (YUV_420_888) to Bitmap
                    val bitmap = imageToBitmap(image, rgbPixels, rgbBitmap)
                    rgbPixels = bitmap.second
                    rgbBitmap = bitmap.third

                    val shouldContinue = onFrame(frameIndex, timestampMs, bitmap.first)
                    image.close()
                    frameIndex++

                    if (!shouldContinue) {
                        outputDone = true
                    }
                }
            }
        }

        codec.stop()
        codec.release()
        decoder = null
        reader.close()
        imageReader = null
    }

    /**
     * Converts a YUV_420_888 Image to an ARGB_8888 Bitmap.
     * Reuses pre-allocated buffers to avoid GC pressure.
     */
    private fun imageToBitmap(
        image: Image,
        existingPixels: IntArray?,
        existingBitmap: Bitmap?,
    ): Triple<Bitmap, IntArray, Bitmap> {
        val w = image.width
        val h = image.height

        val pixels = if (existingPixels != null && existingPixels.size == w * h) {
            existingPixels
        } else {
            IntArray(w * h)
        }

        val bitmap = if (existingBitmap != null && existingBitmap.width == w && existingBitmap.height == h) {
            existingBitmap
        } else {
            Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        }

        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]

        val yBuffer = yPlane.buffer
        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer

        val yRowStride = yPlane.rowStride
        val uvRowStride = uPlane.rowStride
        val uvPixelStride = uPlane.pixelStride

        for (row in 0 until h) {
            val yRowOffset = row * yRowStride
            val uvRow = row / 2
            val uvRowOffset = uvRow * uvRowStride
            for (col in 0 until w) {
                val yVal = (yBuffer.get(yRowOffset + col).toInt() and 0xFF).toFloat()
                val uvCol = col / 2
                val uvOffset = uvRowOffset + uvCol * uvPixelStride
                val uVal = (uBuffer.get(uvOffset).toInt() and 0xFF).toFloat() - 128f
                val vVal = (vBuffer.get(uvOffset).toInt() and 0xFF).toFloat() - 128f

                val r = (yVal + 1.370705f * vVal).toInt().coerceIn(0, 255)
                val g = (yVal - 0.337633f * uVal - 0.698001f * vVal).toInt().coerceIn(0, 255)
                val b = (yVal + 1.732446f * uVal).toInt().coerceIn(0, 255)

                pixels[row * w + col] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
        }

        bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
        return Triple(bitmap, pixels, bitmap)
    }

    override fun close() {
        try { decoder?.stop() } catch (_: Exception) {}
        try { decoder?.release() } catch (_: Exception) {}
        decoder = null
        try { imageReader?.close() } catch (_: Exception) {}
        imageReader = null
        try { extractor.release() } catch (_: Exception) {}
    }
}
