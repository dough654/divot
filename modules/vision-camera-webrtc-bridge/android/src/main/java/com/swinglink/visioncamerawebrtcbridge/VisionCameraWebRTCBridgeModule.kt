package com.swinglink.visioncamerawebrtcbridge

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import com.oney.WebRTCModule.WebRTCModule
import org.webrtc.EglBase
import org.webrtc.MediaStream
import org.webrtc.PeerConnectionFactory
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import java.util.UUID

/**
 * Expo Module that creates a WebRTC video track backed by VisionCamera frames.
 *
 * `createVisionCameraTrack()` —
 *   1. Gets the PeerConnectionFactory from react-native-webrtc's WebRTCModule
 *   2. Creates a VideoSource + VideoTrack via the factory
 *   3. Initializes a dummy VideoCapturer to get a CapturerObserver
 *   4. Configures VisionCameraFrameForwarder with the source
 *   5. Registers the stream in WebRTCModule's localStreams
 *   6. Returns track + stream IDs to JS
 */
class VisionCameraWebRTCBridgeModule : Module() {

  companion object {
    private const val TAG = "VCWebRTCBridge"
  }

  override fun definition() = ModuleDefinition {
    Name("VisionCameraWebRTCBridge")

    AsyncFunction("createVisionCameraTrack") { promise: Promise ->
      try {
        val reactContext = appContext.reactContext
          ?: throw IllegalStateException("ReactApplicationContext not available")

        // Get WebRTCModule from React Native modules
        val webRTCModule = reactContext.getNativeModule(WebRTCModule::class.java)
          ?: throw IllegalStateException("WebRTCModule not found")

        // Access the PeerConnectionFactory via reflection
        val factoryField = WebRTCModule::class.java.getDeclaredField("mFactory")
        factoryField.isAccessible = true
        val factory = factoryField.get(webRTCModule) as PeerConnectionFactory

        // Access localStreams map via reflection
        val localStreamsField = WebRTCModule::class.java.getDeclaredField("localStreams")
        localStreamsField.isAccessible = true
        @Suppress("UNCHECKED_CAST")
        val localStreams = localStreamsField.get(webRTCModule) as MutableMap<String, MediaStream>

        // Create video source
        val videoSource = factory.createVideoSource(false)

        // Create and initialize dummy capturer to get the CapturerObserver
        val dummyCapturer = VisionCameraVideoCapturer()
        val eglBase = EglBase.create()
        val surfaceTextureHelper = SurfaceTextureHelper.create(
          "VisionCameraWebRTC",
          eglBase.eglBaseContext
        )
        dummyCapturer.initialize(surfaceTextureHelper, reactContext, videoSource.capturerObserver)

        // Configure the frame forwarder with the video source
        VisionCameraFrameForwarder.configure(videoSource)

        // Create video track
        val trackId = "vision-camera-${UUID.randomUUID()}"
        val videoTrack = factory.createVideoTrack(trackId, videoSource)
        videoTrack.setEnabled(true)

        // Create and register stream
        val streamId = "vision-camera-stream-${UUID.randomUUID()}"
        val mediaStream = factory.createLocalMediaStream(streamId)
        mediaStream.addTrack(videoTrack)
        localStreams[streamId] = mediaStream

        Log.d(TAG, "Created vision camera track: $trackId, stream: $streamId")

        promise.resolve(
          mapOf(
            "streamId" to streamId,
            "track" to mapOf(
              "id" to trackId,
              "kind" to "video",
              "enabled" to true,
              "readyState" to "live",
              "settings" to emptyMap<String, Any>(),
            ),
          )
        )
      } catch (e: Exception) {
        Log.e(TAG, "Failed to create vision camera track", e)
        promise.reject("ERR_CREATE_TRACK", e.message ?: "Unknown error", e)
      }
    }

    Function("stopForwarding") {
      VisionCameraFrameForwarder.stop()
    }
  }
}
