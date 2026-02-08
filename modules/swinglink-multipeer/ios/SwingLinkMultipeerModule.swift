import ExpoModulesCore
import os.log

private let logger = Logger(subsystem: "com.swinglink.multipeer", category: "SwingLinkMultipeerModule")

/// Expo Module exposing MultipeerConnectivity for local WebRTC signaling relay.
///
/// Camera calls `startAdvertising(roomCode)`, viewer calls `startBrowsing(roomCode)`.
/// Once connected, both sides exchange signaling messages via `sendMessage(type, payload)`.
public class SwingLinkMultipeerModule: Module {
  private let manager = MultipeerManager()

  public func definition() -> ModuleDefinition {
    Name("SwingLinkMultipeer")

    Events("onPeerConnected", "onPeerDisconnected", "onSignalingMessage")

    OnCreate {
      logger.info("OnCreate: wiring MultipeerManager callbacks")

      self.manager.onConnected = { [weak self] in
        logger.info("Forwarding onPeerConnected to JS")
        self?.sendEvent("onPeerConnected", [:])
      }

      self.manager.onDisconnected = { [weak self] in
        logger.info("Forwarding onPeerDisconnected to JS")
        self?.sendEvent("onPeerDisconnected", [:])
      }

      self.manager.onDataReceived = { [weak self] message in
        logger.info("Forwarding onSignalingMessage to JS: type=\(message["type"] as? String ?? "?")")
        self?.sendEvent("onSignalingMessage", message)
      }
    }

    Function("startAdvertising") { (roomCode: String) in
      logger.info("startAdvertising called from JS with roomCode=\(roomCode)")
      self.manager.startAdvertising(roomCode: roomCode)
    }

    Function("startBrowsing") { (roomCode: String) in
      logger.info("startBrowsing called from JS with roomCode=\(roomCode)")
      self.manager.startBrowsing(roomCode: roomCode)
    }

    Function("sendMessage") { (type: String, payload: String) in
      logger.info("sendMessage called from JS: type=\(type)")
      self.manager.send(type: type, payload: payload)
    }

    Function("disconnect") {
      logger.info("disconnect called from JS")
      self.manager.disconnect()
    }

    OnDestroy {
      logger.info("OnDestroy: cleaning up")
      self.manager.disconnect()
    }
  }
}
