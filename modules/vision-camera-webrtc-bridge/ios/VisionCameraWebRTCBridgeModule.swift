import ExpoModulesCore
import WebRTC

/**
 * Expo Module that creates a WebRTC video track backed by VisionCamera frames.
 *
 * `createVisionCameraTrack()` —
 *   1. Gets the RTCPeerConnectionFactory from react-native-webrtc's WebRTCModule
 *   2. Creates an RTCVideoSource + RTCVideoTrack via the factory
 *   3. Configures VisionCameraFrameForwarder with the source
 *   4. Registers the track/stream in WebRTCModule's localTracks/localStreams
 *   5. Returns track + stream IDs to JS
 */
public class VisionCameraWebRTCBridgeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionCameraWebRTCBridge")

    AsyncFunction("createVisionCameraTrack") { (promise: Promise) in
      guard let bridge = self.appContext?.reactBridge else {
        promise.reject("ERR_NO_BRIDGE", "React Native bridge not available")
        return
      }

      guard let webRTCModule = bridge.module(forName: "WebRTCModule") as? NSObject else {
        promise.reject("ERR_NO_WEBRTC", "WebRTCModule not found")
        return
      }

      // Access peerConnectionFactory via KVC
      guard let factory = webRTCModule.value(forKey: "peerConnectionFactory") as? RTCPeerConnectionFactory else {
        promise.reject("ERR_NO_FACTORY", "Could not access peerConnectionFactory")
        return
      }

      // Access localTracks and localStreams dictionaries via KVC
      guard let localTracks = webRTCModule.value(forKey: "localTracks") as? NSMutableDictionary,
            let localStreams = webRTCModule.value(forKey: "localStreams") as? NSMutableDictionary else {
        promise.reject("ERR_NO_TRACKS_MAP", "Could not access localTracks/localStreams")
        return
      }

      // Create video source and track
      let videoSource = factory.videoSource()
      let trackId = "vision-camera-\(UUID().uuidString)"
      let videoTrack = factory.videoTrack(with: videoSource, trackId: trackId)
      videoTrack.isEnabled = true

      // Configure the frame forwarder
      VisionCameraFrameForwarder.shared.configure(source: videoSource)

      // Register track in WebRTCModule's localTracks
      localTracks[trackId] = videoTrack

      // Create and register a stream
      let streamId = "vision-camera-stream-\(UUID().uuidString)"
      let mediaStream = factory.mediaStream(withStreamId: streamId)
      mediaStream.addVideoTrack(videoTrack)
      localStreams[streamId] = mediaStream

      promise.resolve([
        "streamId": streamId,
        "track": [
          "id": trackId,
          "kind": "video",
          "enabled": true,
          "readyState": "live",
          "settings": [:] as [String: Any],
        ] as [String: Any],
      ] as [String: Any])
    }

    Function("stopForwarding") {
      VisionCameraFrameForwarder.shared.stop()
    }
  }
}
