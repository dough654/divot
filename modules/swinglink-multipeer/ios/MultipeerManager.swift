import MultipeerConnectivity
import os.log

private let logger = Logger(subsystem: "com.swinglink.multipeer", category: "MultipeerManager")

/// Manages MultipeerConnectivity sessions for ephemeral WebRTC signaling relay.
///
/// - Camera role: advertises with the room code in discovery info, accepts invitations.
/// - Viewer role: browses for peers matching the room code, sends an invitation on discovery.
///
/// The MPC session is short-lived — it only relays SDP offers/answers and ICE candidates,
/// then tears down once WebRTC establishes a direct connection.
final class MultipeerManager: NSObject {
  private static let serviceType = "swinglink-sig"

  private let serialQueue = DispatchQueue(label: "com.swinglink.multipeer.serial")

  private var peerID: MCPeerID?
  private var session: MCSession?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var browser: MCNearbyServiceBrowser?

  /// The room code this manager was started with.
  private var roomCode: String?

  // MARK: - Callbacks

  var onConnected: (() -> Void)?
  var onDisconnected: (() -> Void)?
  var onDataReceived: (([String: Any]) -> Void)?

  // MARK: - Advertising (Camera side)

  /// Start advertising as the camera for the given room code.
  /// The room code is included in discovery info so viewers can filter.
  func startAdvertising(roomCode: String) {
    serialQueue.async { [weak self] in
      guard let self else { return }
      self.tearDown()

      self.roomCode = roomCode
      let peer = MCPeerID(displayName: UIDevice.current.name)
      self.peerID = peer

      let session = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
      session.delegate = self
      self.session = session

      let advertiser = MCNearbyServiceAdvertiser(
        peer: peer,
        discoveryInfo: ["rc": roomCode],
        serviceType: Self.serviceType
      )
      advertiser.delegate = self
      self.advertiser = advertiser
      advertiser.startAdvertisingPeer()

      logger.info("Started advertising for room \(roomCode)")
    }
  }

  // MARK: - Browsing (Viewer side)

  /// Start browsing for a camera advertising the given room code.
  /// Automatically sends an invitation when a matching peer is found.
  func startBrowsing(roomCode: String) {
    serialQueue.async { [weak self] in
      guard let self else { return }
      self.tearDown()

      self.roomCode = roomCode
      let peer = MCPeerID(displayName: UIDevice.current.name)
      self.peerID = peer

      let session = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
      session.delegate = self
      self.session = session

      let browser = MCNearbyServiceBrowser(peer: peer, serviceType: Self.serviceType)
      browser.delegate = self
      self.browser = browser
      browser.startBrowsingForPeers()

      logger.info("Started browsing for room \(roomCode)")
    }
  }

  // MARK: - Sending

  /// Send a signaling message (offer, answer, or ICE candidate) to the connected peer.
  func send(type: String, payload: String) {
    serialQueue.async { [weak self] in
      guard let self, let session = self.session else {
        logger.warning("send() called but no active session")
        return
      }

      let connectedPeers = session.connectedPeers
      guard !connectedPeers.isEmpty else {
        logger.warning("send() called but no connected peers")
        return
      }

      let message: [String: String] = ["type": type, "payload": payload]
      guard let data = try? JSONSerialization.data(withJSONObject: message) else {
        logger.error("Failed to serialize message")
        return
      }

      do {
        try session.send(data, toPeers: connectedPeers, with: .reliable)
        logger.info("Sent \(type) message (\(data.count) bytes)")
      } catch {
        logger.error("Failed to send message: \(error.localizedDescription)")
      }
    }
  }

  // MARK: - Teardown

  /// Disconnect and clean up all MPC resources.
  func disconnect() {
    serialQueue.async { [weak self] in
      self?.tearDown()
      logger.info("Disconnected")
    }
  }

  /// Must be called on serialQueue.
  private func tearDown() {
    advertiser?.stopAdvertisingPeer()
    advertiser?.delegate = nil
    advertiser = nil

    browser?.stopBrowsingForPeers()
    browser?.delegate = nil
    browser = nil

    session?.disconnect()
    session?.delegate = nil
    session = nil

    peerID = nil
    roomCode = nil
  }
}

// MARK: - MCSessionDelegate

extension MultipeerManager: MCSessionDelegate {
  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    switch state {
    case .connected:
      logger.info("Peer connected: \(peerID.displayName)")
      // Stop advertising/browsing once connected — we only need one peer
      serialQueue.async { [weak self] in
        self?.advertiser?.stopAdvertisingPeer()
        self?.browser?.stopBrowsingForPeers()
      }
      onConnected?()

    case .notConnected:
      logger.info("Peer disconnected: \(peerID.displayName)")
      onDisconnected?()

    case .connecting:
      logger.info("Peer connecting: \(peerID.displayName)")

    @unknown default:
      logger.warning("Unknown session state for \(peerID.displayName): \(String(describing: state))")
    }
  }

  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      logger.warning("Received non-JSON data from \(peerID.displayName)")
      return
    }

    logger.info("Received message from \(peerID.displayName): type=\(json["type"] as? String ?? "?")")
    onDataReceived?(json)
  }

  // Unused but required by protocol
  func session(_ session: MCSession, didReceive stream: InputStream, withName streamName: String, fromPeer peerID: MCPeerID) {}
  func session(_ session: MCSession, didStartReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
  func session(_ session: MCSession, didFinishReceivingResourceWithName resourceName: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}

// MARK: - MCNearbyServiceAdvertiserDelegate

extension MultipeerManager: MCNearbyServiceAdvertiserDelegate {
  func advertiser(
    _ advertiser: MCNearbyServiceAdvertiser,
    didReceiveInvitationFromPeer peerID: MCPeerID,
    withContext context: Data?,
    invitationHandler: @escaping (Bool, MCSession?) -> Void
  ) {
    serialQueue.async { [weak self] in
      guard let self, let session = self.session else {
        invitationHandler(false, nil)
        return
      }

      // Only accept if we don't already have a connected peer
      if session.connectedPeers.isEmpty {
        logger.info("Accepting invitation from \(peerID.displayName)")
        invitationHandler(true, session)
      } else {
        logger.info("Rejecting invitation from \(peerID.displayName) — already connected")
        invitationHandler(false, nil)
      }
    }
  }

  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    logger.error("Failed to start advertising: \(error.localizedDescription)")
  }
}

// MARK: - MCNearbyServiceBrowserDelegate

extension MultipeerManager: MCNearbyServiceBrowserDelegate {
  func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
    serialQueue.async { [weak self] in
      guard let self, let session = self.session else { return }

      // Only invite peers advertising the same room code
      guard let peerRoomCode = info?["rc"], peerRoomCode == self.roomCode else {
        logger.info("Ignoring peer \(peerID.displayName) — room code mismatch")
        return
      }

      // Don't invite if we already have a connected peer
      guard session.connectedPeers.isEmpty else {
        logger.info("Ignoring peer \(peerID.displayName) — already connected")
        return
      }

      logger.info("Inviting peer \(peerID.displayName) for room \(self.roomCode ?? "?")")
      browser.invitePeer(peerID, to: session, withContext: nil, timeout: 15)
    }
  }

  func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    logger.info("Lost peer: \(peerID.displayName)")
  }

  func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    logger.error("Failed to start browsing: \(error.localizedDescription)")
  }
}
