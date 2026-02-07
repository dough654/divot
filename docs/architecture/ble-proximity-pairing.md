# BLE Proximity Pairing

Bluetooth Low Energy (BLE) as a universal discovery layer, with automatic connection method selection based on platform compatibility. Replaces QR scanning as the primary pairing flow while keeping QR as a fallback for web viewers and edge cases.

## Problem

The current pairing flow requires the viewer to scan a QR code from the camera device. This works but has friction:

- Requires pointing one phone at another, which is awkward on a tripod
- Requires both devices to have internet access for the signaling server
- No offline support (golf courses often have poor connectivity)
- The QR code is a technical artifact — users shouldn't need to think about signaling servers

Our main competitor solves this with Bluetooth + peer-to-peer WiFi, but only supports iOS. We can match that experience on same-platform pairs and still support cross-platform connections that they can't.

## Design Principles

1. **The user never chooses a connection method.** The app detects what's available and picks the best path automatically.
2. **BLE is the universal discovery layer.** Both iOS and Android support BLE. Discovery always works the same way regardless of platform mix.
3. **Platform match determines the transport, not the UX.** The user taps a nearby device. What happens next is an implementation detail they don't see.
4. **QR is a fallback, not the primary flow.** It exists for web viewers, BLE permission issues, and edge cases.

## Connection Tiers

| Tier | Platforms | Discovery | Signaling | Transport | Requires Internet |
|------|-----------|-----------|-----------|-----------|-------------------|
| **1** | iOS ↔ iOS | BLE | Multipeer Connectivity | WebRTC over P2P WiFi | No |
| **2** | Android ↔ Android | BLE | Wi-Fi Direct | WebRTC over P2P WiFi | No |
| **3** | iOS ↔ Android | BLE | Signaling server (room code from BLE) | WebRTC over internet/LAN | Yes |
| **4** | Any ↔ Web | QR code / manual entry | Signaling server | WebRTC over internet/LAN | Yes |

The key insight: **tiers 1-3 all start the same way from the user's perspective** — tap a nearby device. The app handles the rest.

## User Flows

### Primary Flow: Nearby Device (Tiers 1-3)

**Camera side:**

1. User opens camera screen
2. App starts BLE advertising with metadata (device name, platform, room code)
3. App simultaneously connects to signaling server and generates room code (existing behavior)
4. Camera preview is live, small "Discoverable" indicator shown
5. QR button remains available in its current position as fallback

**Viewer side:**

1. User opens viewer screen
2. App starts BLE scanning for nearby SwingLink cameras
3. Nearby devices appear as tappable cards above the QR viewfinder:

```
┌──────────────────────────────┐
│  < Home                      │
│                              │
│  Nearby Cameras              │
│  ┌──────────────────────────┐│
│  │ 📱 Doug's iPhone     → ││
│  └──────────────────────────┘│
│  ┌──────────────────────────┐│
│  │ 📱 Sarah's Pixel    → ││
│  └──────────────────────────┘│
│                              │
│  ─ ─ ─ ─ ─ or ─ ─ ─ ─ ─ ─  │
│                              │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐│
│  │    QR viewfinder        ││
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘│
│                              │
│        [ Enter Code ]        │
└──────────────────────────────┘
```

4. User taps a nearby device
5. App checks platform compatibility:
   - **Same platform** → establish P2P WiFi connection, exchange WebRTC signaling over it. No internet needed. Fast.
   - **Different platform** → use the room code from BLE to auto-join via signaling server. Seamless, but requires internet.
6. Either way, WebRTC stream begins

**Cross-platform detail (step 5b):** When the viewer taps an Android device from iOS (or vice versa), the app silently grabs the room code from the BLE advertisement and joins the room via the signaling server — same as the current QR flow, but without the scanning step. If there's no internet, the app shows a message: "Both devices need internet for cross-platform connections. Connect to WiFi or use the same device type for offline pairing."

### Fallback Flow: QR Code (Tier 4 / Edge Cases)

Unchanged from current behavior. The QR viewfinder and "Enter Code" button remain on the viewer screen below the nearby devices list. Used for:

- Web app viewers (no BLE)
- BLE permissions denied
- Devices too far apart for BLE
- Any unexpected BLE failure

### Multiple Nearby Devices

When multiple cameras are advertising:

- All appear in the nearby list, sorted by signal strength (closest first)
- Each shows the device name from the BLE advertisement
- After the viewer taps one, the camera gets a connection request notification and can confirm (prevents accidental pairing with a stranger's device at a busy range)

### Confirmation Handshake

To prevent connecting to the wrong device in crowded environments:

1. Viewer taps a nearby camera
2. Camera device shows a brief confirmation: "[Viewer name] wants to connect" with Accept/Decline
3. On accept, the connection proceeds
4. On decline, the viewer is notified and can try again

For QR code connections, no confirmation is needed — scanning the code is the confirmation.

## Architecture

### Layer Diagram

```
┌─────────────────────────────────────────────┐
│                 UI Layer                     │
│  (Camera screen, Viewer screen — unchanged) │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           Discovery Layer (NEW)              │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ BLE Module  │  │ QR / Manual (existing)│  │
│  └──────┬──────┘  └──────────┬───────────┘  │
│         └──────────┬─────────┘              │
│                    ▼                         │
│         Discovered Peer                      │
│  { name, platform, roomCode, signalStrength }│
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│          Signaling Layer (ABSTRACTED)         │
│                                              │
│  ┌──────────────────┐  ┌─────────────────┐  │
│  │ P2P Signaling    │  │ Server Signaling │  │
│  │ (Multipeer /     │  │ (Socket.IO -     │  │
│  │  Wi-Fi Direct)   │  │  existing)       │  │
│  └────────┬─────────┘  └────────┬────────┘  │
│           └──────────┬──────────┘            │
│                      ▼                       │
│          SignalingChannel interface           │
│  { sendOffer, sendAnswer, sendIceCandidate,  │
│    onOffer, onAnswer, onIceCandidate }       │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Transport Layer (UNCHANGED)          │
│                                              │
│              WebRTC / RTCPeerConnection      │
│                                              │
└─────────────────────────────────────────────┘
```

### Signaling Abstraction

The key architectural change: extract a `SignalingChannel` interface that both the existing Socket.IO signaling and the new P2P signaling implement. The WebRTC hooks (`use-webrtc-connection`) don't care how signaling messages arrive.

```ts
type SignalingChannel = {
  sendOffer: (sdp: string) => void;
  sendAnswer: (sdp: string) => void;
  sendIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onOffer: (handler: (sdp: string) => void) => () => void;
  onAnswer: (handler: (sdp: string) => void) => () => void;
  onIceCandidate: (handler: (candidate: RTCIceCandidateInit) => void) => () => void;
  disconnect: () => void;
};
```

The existing `useSignaling` hook already roughly follows this shape. The refactor is extracting the interface and creating a P2P implementation alongside it.

### BLE Advertisement Payload

BLE advertisements are limited in size (~31 bytes legacy, larger with extended advertising). We need to be efficient:

**Advertisement data (fits in 31 bytes):**

| Field | Size | Description |
|-------|------|-------------|
| Service UUID | 2 bytes | 16-bit SwingLink service identifier |
| Platform | 1 byte | `0x01` = iOS, `0x02` = Android |
| Room code | 6 bytes | ASCII room code characters |
| Flags | 1 byte | Version, status bits |

**Scan response / GATT characteristic (for larger data):**

| Field | Description |
|-------|-------------|
| Device name | User's device name (e.g., "Doug's iPhone") |
| App version | For compatibility checking |

### Native Modules Required

**iOS — `SwingLinkBLE` + `SwingLinkMultipeer`:**

- `SwingLinkBLE`: CoreBluetooth — BLE advertising and scanning (shared cross-platform behavior)
- `SwingLinkMultipeer`: MultipeerConnectivity — P2P WiFi session for same-platform signaling relay

**Android — `SwingLinkBLE` + `SwingLinkWifiDirect`:**

- `SwingLinkBLE`: Android BLE API — advertising and scanning (mirrors iOS BLE module behavior)
- `SwingLinkWifiDirect`: Wi-Fi P2P API — direct WiFi for same-platform signaling relay

The BLE module can share a common JS interface across platforms. The P2P WiFi modules are platform-specific but implement the same `SignalingChannel` interface on the JS side.

### Hook Structure

```
src/hooks/
  use-ble-discovery.ts        # BLE scan/advertise, returns nearby devices
  use-signaling.ts             # Existing, implements SignalingChannel
  use-p2p-signaling.ts         # New, P2P WiFi signaling, implements SignalingChannel
  use-auto-connect.ts          # Orchestrates: picks best channel based on platform match
  use-webrtc-connection.ts     # Unchanged — receives a SignalingChannel, doesn't care which
```

## Security Considerations

**BLE room code exposure:** The room code is broadcast in the BLE advertisement. An attacker nearby could read it and join via the signaling server. Mitigations:

- Room codes are single-use and short-lived (expire after connection or timeout)
- The confirmation handshake (camera approves viewer) prevents unauthorized connections
- P2P connections (tier 1-2) don't use the room code at all — they establish a direct authenticated session

**P2P WiFi encryption:** Both Multipeer Connectivity and Wi-Fi Direct support encrypted sessions. WebRTC adds its own DTLS encryption on top. Data is double-encrypted in practice.

**Bluetooth permissions:** iOS requires the `NSBluetoothAlwaysUsageDescription` key in Info.plist. Android requires `BLUETOOTH_ADVERTISE` and `BLUETOOTH_SCAN` (API 31+). Both show a one-time permission prompt. If denied, the app falls back to QR-only mode gracefully.

## Implementation Phases

### Phase 1: Signaling Abstraction

Refactor the existing signaling into a `SignalingChannel` interface without changing behavior. This is a prerequisite for everything else and is low-risk.

- Extract `SignalingChannel` type
- Refactor `useSignaling` to conform to it
- Refactor `useWebRTCConnection` to accept any `SignalingChannel`
- Verify all existing tests pass

### Phase 2: BLE Discovery

Add BLE advertising (camera) and scanning (viewer) with a cross-platform native module. No P2P WiFi yet — tapping a discovered device just auto-joins via the signaling server using the room code from BLE.

- Build `SwingLinkBLE` native module (iOS + Android)
- Build `useBLEDiscovery` hook
- Update viewer screen: nearby devices list above QR scanner
- Update camera screen: BLE advertising on mount
- Add confirmation handshake UI
- This alone removes the QR scanning step for most users (still needs internet)

### Phase 3: P2P Signaling — iOS

Add Multipeer Connectivity for iOS ↔ iOS connections. This enables fully offline pairing.

- Build `SwingLinkMultipeer` native module
- Build `useP2PSignaling` hook (iOS implementation)
- Build `useAutoConnect` orchestrator that picks server vs P2P based on platform
- Test offline scenario on two iOS devices

### Phase 4: P2P Signaling — Android

Same as Phase 3, but with Wi-Fi Direct for Android ↔ Android.

- Build `SwingLinkWifiDirect` native module
- Extend `useP2PSignaling` hook with Android implementation
- Test offline scenario on two Android devices

### Phase 5: Polish

- Handle edge cases (BLE permission denied mid-session, P2P WiFi failure fallback to server)
- Add "Discoverable" indicator on camera screen
- Signal strength display / sorting
- Stop scanning on viewer once connected (advertising continues on camera in case of reconnect)
- Analytics: track which connection tier is used

## Resolved Decisions

1. **Confirmation UX:** Always show accept/decline on the camera device. Worth the small friction to prevent accidental pairing, especially at busy ranges.
2. **Auto-connect vs tap-to-connect:** Always require a tap. Consistent experience, no surprises.
3. **BLE advertising duration:** Advertise indefinitely while the camera screen is open. BLE advertising power draw is negligible (microwatts) — devices like AirTags run for years on a coin cell.
4. **Naming:** No explicit branding needed. If referenced in UI copy, use "nearby pairing."
