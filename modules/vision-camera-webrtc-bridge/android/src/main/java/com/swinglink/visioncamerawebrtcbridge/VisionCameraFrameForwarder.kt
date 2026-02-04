package com.swinglink.visioncamerawebrtcbridge

import android.media.Image
import org.webrtc.NV21Buffer
import org.webrtc.VideoFrame
import org.webrtc.VideoSource

/**
 * Singleton that holds a WebRTC VideoSource and pushes Android Image frames into it.
 * VisionCamera's frame processor plugin calls [pushFrame] on every camera frame.
 * The VideoSource feeds into a VideoTrack registered with react-native-webrtc.
 */
object VisionCameraFrameForwarder {
  private var videoSource: VideoSource? = null
  @Volatile
  private var isConfigured = false

  /** Configure with a VideoSource obtained from the WebRTC factory. */
  fun configure(source: VideoSource) {
    videoSource = source
    isConfigured = true
  }

  /**
   * Push a YUV_420_888 Image frame from VisionCamera into the WebRTC video source.
   * Converts YUV_420_888 → NV21 and wraps in an NV21Buffer for WebRTC consumption.
   */
  fun pushFrame(image: Image, timestampNs: Long, rotationDegrees: Int) {
    if (!isConfigured) return
    val source = videoSource ?: return

    val width = image.width
    val height = image.height

    // Convert YUV_420_888 to NV21
    val nv21Data = yuv420ToNv21(image)

    val nv21Buffer = NV21Buffer(nv21Data, width, height, null)
    val videoFrame = VideoFrame(nv21Buffer, rotationDegrees, timestampNs)

    source.capturerObserver.onFrameCaptured(videoFrame)
    videoFrame.release()
  }

  /** Stop forwarding and release references. */
  fun stop() {
    isConfigured = false
    videoSource = null
  }

  /**
   * Convert an android.media.Image in YUV_420_888 format to NV21 byte array.
   * NV21 layout: Y plane followed by interleaved VU plane.
   */
  private fun yuv420ToNv21(image: Image): ByteArray {
    val width = image.width
    val height = image.height
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]

    val yBuffer = yPlane.buffer
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer

    val ySize = width * height
    val uvSize = width * height / 2
    val nv21 = ByteArray(ySize + uvSize)

    // Copy Y plane
    val yRowStride = yPlane.rowStride
    val yPixelStride = yPlane.pixelStride
    if (yRowStride == width && yPixelStride == 1) {
      yBuffer.get(nv21, 0, ySize)
    } else {
      var pos = 0
      for (row in 0 until height) {
        yBuffer.position(row * yRowStride)
        for (col in 0 until width) {
          nv21[pos++] = yBuffer.get(row * yRowStride + col * yPixelStride)
        }
      }
    }

    // Copy UV planes interleaved as VU (NV21 format)
    val uvRowStride = uPlane.rowStride
    val uvPixelStride = uPlane.pixelStride
    val uvHeight = height / 2
    val uvWidth = width / 2

    // Fast path: if pixel stride is 2 and V plane starts right before U plane,
    // the data is already interleaved as NV21
    if (uvPixelStride == 2 && vBuffer.remaining() > 0) {
      val vPos = vBuffer.position()
      val uPos = uBuffer.position()
      // Check if V and U buffers are part of the same interleaved array
      if (vBuffer.hasArray() && uBuffer.hasArray() &&
          vBuffer.array() === uBuffer.array() &&
          uPos - vPos == 1) {
        // Already NV21 interleaved
        vBuffer.position(vPos)
        val remaining = minOf(vBuffer.remaining(), uvSize)
        vBuffer.get(nv21, ySize, remaining)
        return nv21
      }
    }

    // Slow path: manually interleave V and U
    var uvPos = ySize
    for (row in 0 until uvHeight) {
      for (col in 0 until uvWidth) {
        val uvOffset = row * uvRowStride + col * uvPixelStride
        nv21[uvPos++] = vBuffer.get(uvOffset) // V
        nv21[uvPos++] = uBuffer.get(uvOffset) // U
      }
    }

    return nv21
  }
}
