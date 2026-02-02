# SwingLink AI - Implementation Plan

## Overview
P2P video streaming app for golfers using React Native + Expo. Two devices connect directly: one acts as the camera (filming the swing), the other as the viewer (coach or self-review).

## Tech Stack
- **Framework**: Expo SDK 53 (latest stable) with Expo Router
- **WebRTC**: `react-native-webrtc` + `@config-plugins/react-native-webrtc`
- **Signaling**: Node.js + Socket.IO on Fly.io (~50 lines of code)
- **Discovery**: `react-native-zeroconf` for mDNS/Bonjour local discovery
- **QR Pairing**: `expo-camera` for scanning, `react-native-qrcode-svg` for display
- **STUN**: Google's free public servers
- **TURN**: Open Relay Project (free tier fallback)

## Development Workflow (Arch Linux)

### Day-to-day development:
1. Write code on Linux
2. Run `npx expo start --dev-client`
3. Test on physical devices (hot reload works between builds)
4. Only rebuild when native config changes

### Building:
- **Android**: `npx eas build --platform android --profile development` (cloud build, download APK)
- **iOS**: `npx eas build --platform ios --profile development` (cloud build, install via TestFlight)
- **Later optimization**: Set up Mac Pro as GitHub Actions self-hosted runner for free local builds

---

## Project Structure

```
swing-app/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout
│   ├── index.tsx                 # Home (role selection)
│   ├── camera.tsx                # Camera mode (shows QR)
│   ├── viewer.tsx                # Viewer mode (scans QR)
│   └── settings.tsx              # Connection preferences
├── src/
│   ├── components/
│   │   ├── ui/                   # Button, StatusIndicator, etc.
│   │   ├── video/                # LocalVideoView, RemoteVideoView
│   │   ├── pairing/              # QRCodeDisplay, QRCodeScanner
│   │   └── connection/           # ConnectionStatus, HotspotSetupGuide
│   ├── hooks/
│   │   ├── use-webrtc-connection.ts    # Core P2P logic
│   │   ├── use-local-media-stream.ts   # Camera access
│   │   ├── use-signaling.ts            # Socket.IO connection
│   │   ├── use-local-discovery.ts      # mDNS/Zeroconf discovery
│   │   ├── use-connection-cascade.ts   # WiFi → Hotspot fallback logic
│   │   └── use-connection-quality.ts   # Latency monitoring
│   ├── services/
│   │   ├── webrtc/
│   │   │   ├── peer-connection-factory.ts
│   │   │   ├── ice-servers.ts
│   │   │   └── media-constraints.ts
│   │   ├── signaling/
│   │   │   └── signaling-client.ts    # Socket.IO client
│   │   └── discovery/
│   │       ├── local-discovery.ts     # mDNS service publish/browse
│   │       └── qr-payload.ts          # Encode/decode QR data
│   ├── types/
│   │   ├── webrtc.ts
│   │   ├── signaling.ts
│   │   └── app-state.ts
│   └── utils/
│       └── room-code-generator.ts
├── test/                         # Mirrors src/ structure
├── app.config.ts                 # Expo config with plugins
├── eas.json                      # Build profiles
│
└── server/                       # Signaling server (separate deploy)
    ├── src/
    │   └── index.ts              # ~50 lines Socket.IO server
    ├── package.json
    ├── tsconfig.json
    ├── Dockerfile
    └── fly.toml                  # Fly.io config
```

---

## Connection Flow

### Step 1: QR Code Pairing
```
CAMERA DEVICE                              VIEWER DEVICE
─────────────                              ─────────────
1. Generate session ID
   → Display QR code containing:
     { sessionId, connectionMode, hotspotSSID?, hotspotPass? }
                                           2. Scan QR code
                                              → Parse session info
                                              → Initiate connection cascade
```

### Step 2: Connection Cascade
```
┌─────────────────────────────────────────────────────────────────┐
│  Connection Mode: "auto" (default) or "hotspot" (user setting)  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
    [Mode: Auto]                            [Mode: Hotspot]
          │                                       │
          ▼                                       │
┌─────────────────────┐                           │
│ Try Local WiFi      │                           │
│ (mDNS Discovery)    │                           │
│ Timeout: 5 seconds  │                           │
└─────────┬───────────┘                           │
          │                                       │
    ┌─────┴─────┐                                 │
    │           │                                 │
 Success      Fail                                │
    │           │                                 │
    │           └──────────────┬──────────────────┘
    │                          ▼
    │              ┌───────────────────────┐
    │              │ Hotspot Setup Flow    │
    │              │ - Guide camera user   │
    │              │ - Display QR with     │
    │              │   WiFi credentials    │
    │              │ - iOS: auto-join WiFi │
    │              │ - Retry mDNS discovery│
    │              └───────────┬───────────┘
    │                          │
    └──────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ WebRTC Connection (via signaling server or local exchange)      │
│ 1. Exchange SDP offer/answer                                    │
│ 2. Exchange ICE candidates                                      │
│ 3. P2P video stream established                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why Hotspot Mode is Better (for power users)
- **Dedicated bandwidth**: No competing traffic from other devices
- **No client isolation**: Public WiFi often blocks device-to-device communication
- **Lower latency**: Direct path between devices
- **Settings option**: Users can enable "Always use hotspot" to skip local WiFi attempt

---

## Implementation Phases

### Phase 1: Foundation (Steps 1-3)
**Goal**: Working app shell with camera preview

1. **Scaffold project**
   - `npx create-expo-app@latest swing-app --template tabs`
   - Install: `react-native-webrtc`, `@config-plugins/react-native-webrtc`, `expo-dev-client`, `socket.io-client`
   - Also: `react-native-zeroconf`, `expo-camera`, `react-native-qrcode-svg`
   - Configure `app.config.ts` with WebRTC plugin
   - Build first dev client

2. **Screen navigation**
   - Home screen with Camera/Viewer buttons
   - Empty Camera and Viewer screens
   - Settings screen (connection mode preference)
   - Verify hot reload works

3. **Local camera access**
   - `useLocalMediaStream` hook
   - `LocalVideoView` component
   - Camera flip (front/back)

**Validation**: Camera preview displays on physical device

---

### Phase 2: QR Pairing + Signaling (Steps 4-7)
**Goal**: Two devices can pair and discover each other

4. **Build signaling server**
   - Create `server/` directory with Node.js + Socket.IO
   - Implement events: `create-room`, `join-room`, `offer`, `answer`, `ice-candidate`
   - Deploy to Fly.io (free tier)
   - Test with simple HTML client first

5. **QR code generation (camera side)**
   - Generate session ID
   - Create QR payload: `{ sessionId, mode, hotspotSSID?, hotspotPass? }`
   - Display QR code using `react-native-qrcode-svg`
   - Connect to signaling server with session ID

6. **QR code scanning (viewer side)**
   - `expo-camera` barcode scanner
   - Parse QR payload
   - Connect to signaling server with same session ID
   - Both devices receive `peer-joined`

7. **Settings: Connection mode**
   - "Auto" (default): Try local WiFi first, fall back to hotspot
   - "Always hotspot": Skip local WiFi attempt
   - Persist preference with AsyncStorage

**Validation**: Scan QR, both devices connected to signaling server

---

### Phase 3: Connection Cascade (Steps 8-10)
**Goal**: Establish network connectivity with fallback

8. **Local WiFi discovery (mDNS)**
   - Camera: publish mDNS service via `react-native-zeroconf`
   - Viewer: browse for service, find camera's local IP
   - Attempt direct connection (5 second timeout)

9. **Hotspot fallback flow**
   - If mDNS fails OR user selected "Always hotspot":
   - Show "Hotspot Setup Guide" on camera device
   - Update QR code to include hotspot credentials
   - Viewer: iOS auto-joins WiFi from QR, Android shows manual instructions
   - Retry mDNS discovery on hotspot network

10. **Connection cascade hook**
    - `useConnectionCascade` orchestrates the flow
    - Returns: `{ status, currentStep, retry, switchToHotspot }`
    - Handles all state transitions and error recovery

**Validation**: Devices connect via local WiFi OR hotspot

---

### Phase 4: WebRTC Connection (Steps 11-13)
**Goal**: Devices connect peer-to-peer

11. **Peer connection setup**
    - Create `peer-connection-factory.ts`
    - Configure ICE servers (Google STUN + Open Relay TURN)
    - Add local tracks to connection

12. **SDP exchange**
    - Camera: create offer → emit via signaling server
    - Viewer: receive offer → create answer → emit via signaling server
    - Both: set local/remote descriptions

13. **ICE candidate exchange**
    - Emit candidates via signaling server
    - Listen for remote candidates
    - Add candidates to peer connection

**Validation**: `iceConnectionState` reaches "connected"

---

### Phase 5: Video Streaming (Steps 14-16)
**Goal**: Live video appears on viewer device

14. **Stream attachment**
    - Camera: add tracks to peer connection
    - Viewer: handle `ontrack` event
    - `RemoteVideoView` component

15. **Connection quality monitoring**
    - `useConnectionQuality` hook using `getStats()`
    - Display latency, bitrate, packet loss
    - Target: <150ms latency on LAN / hotspot

16. **Disconnection handling**
    - Detect disconnect via `oniceconnectionstatechange`
    - Clean up resources
    - Show disconnect UI with "Reconnect" option

**Validation**: Live video streams with <150ms latency

---

## Critical Files

| File | Purpose |
|------|---------|
| `app.config.ts` | Expo config with WebRTC + camera plugins |
| `src/hooks/use-webrtc-connection.ts` | Core P2P logic - the heart of the app |
| `src/hooks/use-connection-cascade.ts` | WiFi → Hotspot fallback orchestration |
| `src/services/discovery/local-discovery.ts` | mDNS publish/browse for local network |
| `src/services/discovery/qr-payload.ts` | Encode/decode QR connection data |
| `src/services/signaling/signaling-client.ts` | Socket.IO client for room management |
| `server/src/index.ts` | Signaling server (~50 lines) |

---

## Verification Plan

### Per-phase testing:
- **Phase 1**: Camera preview works on both iOS and Android physical devices
- **Phase 2**: QR scan works, both devices connected to signaling server
- **Phase 3**: Local WiFi discovery works; hotspot fallback UI appears on failure
- **Phase 4**: Console logs show ICE state progression: checking → connected
- **Phase 5**: Video visible on viewer with latency overlay showing <150ms

### End-to-end test (Auto mode):
1. Both devices on same WiFi (with device-to-device allowed)
2. Camera shows QR code
3. Viewer scans QR
4. mDNS discovers camera within 5 seconds
5. Video streams with <150ms latency

### End-to-end test (Hotspot mode):
1. Camera enables phone hotspot
2. Camera shows QR (includes hotspot credentials)
3. Viewer scans QR, auto-joins hotspot WiFi
4. mDNS discovers camera
5. Video streams with excellent latency (<100ms typical)

### Network edge cases to test:
- Same WiFi, no client isolation (easiest)
- Same WiFi with client isolation (should fall back to hotspot)
- Hotspot mode (best performance)
- Different networks/mobile data (tests STUN - needs signaling server reachable)

---

## Commands Reference

```bash
# Initial setup (mobile app)
npx create-expo-app@latest swing-app --template tabs
cd swing-app
npx expo install react-native-webrtc @config-plugins/react-native-webrtc
npx expo install expo-dev-client socket.io-client
npx expo install react-native-zeroconf expo-camera react-native-qrcode-svg
npx expo install @react-native-async-storage/async-storage  # for settings

# Build dev clients
npx eas login
npx eas build:configure
npx eas build --platform android --profile development
npx eas build --platform ios --profile development

# Development
npx expo start --dev-client

# Install APK on Android
adb install path/to/swinglink.apk

# Signaling server setup
cd server
npm init -y
npm install socket.io express typescript ts-node @types/node
npx tsc --init

# Deploy to Fly.io
fly launch
fly deploy
```

---

## Signaling Server Overview

The server is intentionally minimal (~50 lines). It only:
1. Generates room codes and tracks which sockets are in which room
2. Relays `offer`, `answer`, and `ice-candidate` messages between paired devices
3. Notifies when peers join/leave

```typescript
// server/src/index.ts (simplified)
import { Server } from 'socket.io';

const io = new Server(3000, { cors: { origin: '*' } });
const rooms = new Map<string, string[]>(); // roomCode -> [socketIds]

io.on('connection', (socket) => {
  socket.on('create-room', (callback) => {
    const code = generateRoomCode();
    rooms.set(code, [socket.id]);
    socket.join(code);
    callback(code);
  });

  socket.on('join-room', (code, callback) => {
    if (!rooms.has(code)) return callback({ error: 'Room not found' });
    socket.join(code);
    socket.to(code).emit('peer-joined');
    callback({ success: true });
  });

  socket.on('offer', (data) => socket.to(data.room).emit('offer', data.sdp));
  socket.on('answer', (data) => socket.to(data.room).emit('answer', data.sdp));
  socket.on('ice-candidate', (data) => socket.to(data.room).emit('ice-candidate', data.candidate));
});
```

**Fly.io Free Tier**: 3 shared VMs, 256MB RAM each - more than enough for signaling.
