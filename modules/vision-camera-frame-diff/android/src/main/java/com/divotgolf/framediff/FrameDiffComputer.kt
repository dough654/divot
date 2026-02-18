package com.divotgolf.framediff

import android.media.Image
import kotlin.math.abs

/**
 * Computes luminance-based frame differencing from raw pixel data.
 *
 * Algorithm:
 * 1. Extract Y (luminance) plane from YUV Image (plane 0)
 * 2. Downsample: every 4th pixel in both dimensions (~16x fewer pixels)
 * 3. Compute absolute difference from previous frame's luminance values
 * 4. Normalize: totalAbsDiff / (sampleCount * 255) → 0.0 to 1.0
 *
 * No OpenCV, no ML — just pixel math.
 */
class FrameDiffComputer {

  /** Previous frame's downsampled luminance values. */
  private var previousLuminance: ByteArray? = null

  /** Downsample stride — every Nth pixel in each dimension. */
  private val stride = 4

  /**
   * Compute the motion magnitude between this frame and the previous one.
   *
   * @param image The camera frame's Image (YUV format).
   * @return Motion magnitude 0.0-1.0, or null on the first frame.
   */
  fun computeDiff(image: Image): Double? {
    val yPlane = image.planes[0]
    val buffer = yPlane.buffer
    val rowStride = yPlane.rowStride
    val pixelStride = yPlane.pixelStride
    val width = image.width
    val height = image.height

    val sampledWidth = width / stride
    val sampledHeight = height / stride
    val sampleCount = sampledWidth * sampledHeight

    if (sampleCount <= 0) return null

    val currentLuminance = ByteArray(sampleCount)
    var idx = 0

    var row = 0
    while (row < height) {
      val rowOffset = row * rowStride
      var col = 0
      while (col < width) {
        buffer.position(rowOffset + col * pixelStride)
        currentLuminance[idx] = buffer.get()
        idx++
        col += stride
      }
      row += stride
    }

    // Reset buffer position for potential reuse
    buffer.rewind()

    val prevLuminance = previousLuminance
    if (prevLuminance == null || prevLuminance.size != sampleCount) {
      // First frame — store and return null
      previousLuminance = currentLuminance
      return null
    }

    // Compute absolute difference
    var totalDiff: Long = 0
    for (i in 0 until sampleCount) {
      val curr = currentLuminance[i].toInt() and 0xFF
      val prev = prevLuminance[i].toInt() and 0xFF
      totalDiff += abs(curr - prev).toLong()
    }

    previousLuminance = currentLuminance

    // Normalize to 0.0-1.0
    val maxPossibleDiff = sampleCount.toDouble() * 255.0
    return totalDiff.toDouble() / maxPossibleDiff
  }
}
