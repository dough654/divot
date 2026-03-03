package com.divotgolf.visioncamerawebrtcbridge

import android.media.Image
import org.webrtc.NV21Buffer
import org.webrtc.VideoFrame
import org.webrtc.VideoSource
import java.util.concurrent.atomic.AtomicReference

/**
 * Singleton that holds a WebRTC VideoSource and pushes Android Image frames into it.
 * VisionCamera's frame processor plugin calls [pushFrame] on every camera frame.
 * The VideoSource feeds into a VideoTrack registered with react-native-webrtc.
 */
object VisionCameraFrameForwarder {
  private var videoSource: VideoSource? = null
  @Volatile
  private var isConfigured = false

  // Reusable NV21 byte array to avoid ~93MB/sec of GC pressure at 30fps.
  // Returned via NV21Buffer release callback when WebRTC is done with it.
  private val reusableNv21 = AtomicReference<ByteArray?>(null)

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
    val nv21Size = width * height + width * height / 2

    // Reclaim the reusable buffer if available and correctly sized, else allocate
    val nv21 = reusableNv21.getAndSet(null)?.takeIf { it.size == nv21Size }
      ?: ByteArray(nv21Size)

    yuv420ToNv21(image, nv21)

    val nv21Buffer = NV21Buffer(nv21, width, height) { reusableNv21.set(nv21) }
    val videoFrame = VideoFrame(nv21Buffer, rotationDegrees, timestampNs)

    source.capturerObserver.onFrameCaptured(videoFrame)
    videoFrame.release()
  }

  /** Stop forwarding and release references. */
  fun stop() {
    isConfigured = false
    videoSource = null
    reusableNv21.set(null)
  }

  /**
   * Convert an android.media.Image in YUV_420_888 format into a pre-allocated NV21 byte array.
   * NV21 layout: Y plane followed by interleaved VU plane.
   */
  private fun yuv420ToNv21(image: Image, nv21: ByteArray) {
    val width = image.width
    val height = image.height
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]

    val yBuffer = yPlane.buffer
    val uBuffer = uPlane.buffer
    val vBuffer = vPlane.buffer

    val ySize = width * height

    // --- Y plane (bulk row copy) ---
    yBuffer.rewind()
    val yRowStride = yPlane.rowStride
    if (yRowStride == width) {
      yBuffer.get(nv21, 0, ySize)
    } else {
      for (row in 0 until height) {
        yBuffer.position(row * yRowStride)
        yBuffer.get(nv21, row * width, width)
      }
    }

    // --- UV planes ---
    val uvPixelStride = uPlane.pixelStride
    val uvRowStride = uPlane.rowStride
    val uvHeight = height / 2
    val uvSize = width * uvHeight

    if (uvPixelStride == 2) {
      // Camera provides interleaved UV data (NV12 or NV21).
      // With pixelStride=2 the V buffer contains VUVU... bytes — already NV21.
      vBuffer.rewind()
      if (uvRowStride == width) {
        val toCopy = minOf(vBuffer.remaining(), uvSize)
        vBuffer.get(nv21, ySize, toCopy)
      } else {
        var pos = ySize
        for (row in 0 until uvHeight) {
          vBuffer.position(row * uvRowStride)
          val rowBytes = minOf(width, vBuffer.remaining())
          vBuffer.get(nv21, pos, rowBytes)
          pos += width
        }
      }
    } else {
      // Planar UV (pixelStride=1). Manually interleave as VU.
      vBuffer.rewind()
      uBuffer.rewind()
      val uvWidth = width / 2
      var uvPos = ySize
      for (row in 0 until uvHeight) {
        for (col in 0 until uvWidth) {
          val offset = row * uvRowStride + col
          nv21[uvPos++] = vBuffer.get(offset) // V
          nv21[uvPos++] = uBuffer.get(offset) // U
        }
      }
    }
  }
}
