# P2P Signaling & Server Fallback

WebRTC requires an out-of-band signaling channel to exchange SDP offers/answers and ICE candidates before a media connection can be established. SwingLink supports two signaling transports: **peer-to-peer** (via platform-native frameworks) and **server-relayed** (via Socket.IO). The app automatically selects the best transport and falls back to the server if P2P fails.

## Why Two Transports

The signaling server (`server/`) works everywhere but requires internet access. Golf courses routinely have dead zones. P2P signaling uses the device radios directly — no router, no cell signal, no internet required. The tradeoff is that P2P only works between same-platform devices (iOS-to-iOS or Android-to-Android) because the underlying frameworks are platform-specific.

| Transport | iOS Framework | Android Framework | Requires Internet | Cross-Platform |
|-----------|---------------|-------------------|-------------------|----------------|
| **P2P** | MultipeerConnectivity | Wi-Fi Direct | No | No |
| **Server** | Socket.IO | Socket.IO | Yes | Yes |

## The SignalingChannel Abstraction

The key architectural decision is a transport-agnostic interface that both P2P and server signaling implement:

```typescript
type SignalingChannel = {
  sendOffer: (sdp: string) => void;
  sendAnswer: (sdp: string) => void;
  sendIceCandidate: (candidate: IceCandidateInfo) => void;
  onOffer: (handler: (sdp: string) => void) => () => void;
  onAnswer: (handler: (sdp: string) => void) => () => void;
  onIceCandidate: (handler: (candidate: IceCandidateInfo) => void) => () => void;
  disconnect: () => void;
};
```

`useWebRTCConnection` consumes this interface and has zero awareness of whether signals are traveling over MultipeerConnectivity, Wi-Fi Direct, or a server halfway around the world. Screen components (`camera.tsx`, `viewer.tsx`) never interact with signaling directly — they receive a pre-selected `channel` from `useAutoConnect`.

## Native Module Interface

Both platform modules (`swinglink-multipeer` on iOS, `swinglink-wifi-direct` on Android) expose the same 5-function, 4-event interface. They're loaded via `requireOptionalNativeModule` and return `null` on the wrong platform or in Expo Go.

```typescript
// Identical shape for both modules
type NativeModule = {
  startAdvertising: (roomCode: string) => void;   // Camera: make discoverable
  startBrowsing: (roomCode: string) => void;       // Viewer: scan for cameras
  sendMessage: (type: string, payload: string) => void;
  respondToInvitation: (accept: boolean) => void;  // Camera: accept/reject viewer
  disconnect: () => void;
  addListener: (eventName: string, listener: (...args: any[]) => void) => { remove: () => void };
};

// Events emitted by both
'onPeerConnected'      // Peer connection established
'onPeerDisconnected'   // Peer dropped
'onSignalingMessage'   // { type: 'offer'|'answer'|'ice-candidate', payload: string }
'onInvitationReceived' // { peerName: string } — viewer wants to connect
```

At module scope in `use-p2p-signaling.ts`, the correct module is selected once:

```typescript
const nativeModule = Platform.OS === 'ios'
  ? SwingLinkMultipeerModule
  : SwingLinkWifiDirectModule;
```

This is a module-level constant — it never changes at runtime and doesn't appear in React dependency arrays.

## Transport Selection: useAutoConnect

`useAutoConnect` is the orchestrator. It runs the P2P attempt, watches for success or timeout, and falls back to the server channel if needed. The rule is **first transport wins** — once a transport locks in, it stays for the entire session.

### P2P Eligibility

```typescript
const canAttemptP2P = role === 'camera' || remotePlatform === localPlatform;
```

- **Camera**: Always attempts P2P. It starts advertising before the viewer connects, so it doesn't know the remote platform yet.
- **Viewer**: Attempts P2P only if the remote device (discovered via BLE) is the same platform. iOS viewer + iOS camera = P2P via MPC. Android viewer + Android camera = P2P via Wi-Fi Direct. Cross-platform = skip P2P entirely, go straight to server.

### State Machine

```
                        ┌──────────────────────────────────┐
                        │              idle                 │
                        └──────────┬───────────┬───────────┘
                   canAttemptP2P   │           │  !canAttemptP2P
                                   ▼           ▼
                          attempting-p2p    needs-server
                           │         │          │
               p2p.state   │         │ p2p.state│  serverReady
               'connected' │         │ times out│  = true
                           ▼         ▼          ▼
                      connected-p2p    needs-server ──► connected-server
                       [LOCKED]                          [LOCKED]
```

Once `lockedTransportRef` is set, no further transport switching occurs. The returned `channel` property is either `p2p.channel` or `serverChannel` based on the lock.

### Special Case: Camera Before Lock-In

The camera returns `serverChannel` even before a transport locks in. This is because `onPeerJoined` from the server triggers `createOffer()` via the server channel — if P2P wins the race, the lock switches to `p2p.channel` instead.

## P2P Signaling Flow: useP2PSignaling

### Camera Side

```
start() called
  │
  ▼
startAdvertising(roomCode)          state: 'searching'
  │
  ▼
Viewer discovers camera, sends invitation
  │
  ▼
onInvitationReceived event          pendingInvitation set, UI shows modal
  │
  ▼
User taps Accept
  │
  ▼
respondToInvitation(true)           Native layer completes handshake
  │
  ▼
onPeerConnected event               state: 'connected', timeout cancelled
  │
  ▼
sendMessage/onSignalingMessage      SDP + ICE flowing over native data channel
```

### Viewer Side

```
start() called
  │
  ▼
startBrowsing(roomCode)            state: 'searching'
  │
  ▼
Native layer finds camera, auto-sends invitation
  │
  ▼
Camera accepts invitation
  │
  ▼
onPeerConnected event               state: 'connected', timeout cancelled
  │
  ▼
sendMessage/onSignalingMessage      SDP + ICE flowing over native data channel
```

### Timeout

If `onPeerConnected` hasn't fired within 15 seconds (configurable via `timeoutMs`), the hook forces a transition to `'disconnected'`. `useAutoConnect` sees this and falls back to `'needs-server'`.

### P2P State Values

| State | Meaning |
|-------|---------|
| `'unavailable'` | Native module is `null` (wrong platform or Expo Go) |
| `'idle'` | Not started |
| `'searching'` | Advertising or browsing |
| `'connecting'` | Invitation received, not yet connected |
| `'connected'` | Peer connection established, signaling active |
| `'disconnected'` | Timed out, failed, or explicitly stopped |

## Server Signaling Flow: useSignaling

The server path uses Socket.IO to relay signaling messages through a lightweight server on Fly.io. The server holds no media — it's purely a message relay with room management.

### Room Lifecycle

1. Camera calls `createRoom()` → server generates a 6-character code (e.g. `A3BK7F`, excluding ambiguous chars `0/O/1/I`)
2. Viewer obtains the code (from BLE metadata, QR scan, or manual entry)
3. Viewer calls `joinRoom(code)` → server notifies camera via `peer-joined`
4. Both sides exchange `offer`, `answer`, `ice-candidate` messages through the room
5. Max 2 participants per room, enforced server-side

### Server URL

Configured via environment variable, defaults to `https://swinglink-signaling.fly.dev`. Socket.IO transports: `['polling', 'websocket']` — polling first for NAT/firewall compatibility.

## How Screens Wire It Together

Both screens follow the same pattern:

```typescript
// 1. Always set up server signaling
const signaling = useSignaling({ autoConnect: false });

// 2. Let useAutoConnect decide the transport
const autoConnect = useAutoConnect({
  role: 'camera' | 'viewer',
  roomCode,
  serverChannel: signaling.channel,
  serverReady: /* true once room is created/joined */,
  remotePlatform: /* from BLE discovery, viewer only */,
  enabled: /* true when ready to connect */,
});

// 3. Pass the winning channel to WebRTC
const webrtc = useWebRTCConnection({
  signalingChannel: autoConnect.channel,
});
```

Screens also handle:
- **P2P invitation modal** (camera side): `autoConnect.pendingInvitation` triggers a confirmation UI; tapping accept/reject calls `autoConnect.acceptInvitation()` / `rejectInvitation()`
- **Masking signaling state for auto-reconnect**: When P2P is active, the signaling server connection state is irrelevant, so screens pass `'connected'` to `useAutoReconnect` instead of the real server state. This prevents Scenario B (signaling-lost recovery) from firing when there's no signaling to lose.

## Platform Matrix

| Camera | Viewer | P2P Attempted? | Signaling Transport | Notes |
|--------|--------|----------------|---------------------|-------|
| iOS | iOS | Yes | MultipeerConnectivity | Full offline support |
| Android | Android | Yes | Wi-Fi Direct | Full offline support, requires Location permission |
| iOS | Android | Camera: yes, Viewer: no | Server | Camera advertises but viewer skips P2P, falls back immediately |
| Android | iOS | Camera: yes, Viewer: no | Server | Same as above, reversed |

In cross-platform cases, the camera wastes up to 15 seconds advertising to nobody before timing out. This is acceptable because the viewer has already fallen back to the server and the WebRTC connection will establish via that path. The camera's P2P timeout runs concurrently with the server flow.

## Interaction with Auto-Reconnection

See [auto-reconnection.md](./auto-reconnection.md) for the full reconnection architecture.

Key interaction: once a transport is locked, auto-reconnection only operates on that transport. If P2P was selected, reconnection uses P2P mechanisms. If server was selected, reconnection uses Socket.IO rejoin. There is no mid-session transport switch — if the locked transport fails beyond recovery, the user must re-pair.

## Edge Cases

| Case | Behavior |
|------|----------|
| Both devices are Android but Wi-Fi is off | `SwingLinkWifiDirectModule` returns `null` or fails discovery → P2P times out → server fallback |
| Android Location permission denied | Wi-Fi Direct peer discovery won't work → P2P times out → server fallback |
| Camera on P2P, viewer joins late | Camera is already advertising; viewer starts browsing, finds camera, connects |
| P2P connected but native channel drops | `onPeerDisconnected` fires → `useAutoReconnect` handles via Scenario A (ICE restart/renegotiation) |
| Expo Go | Both native modules return `null` → `'unavailable'` state → immediate server fallback |
| P2P invitation rejected by camera user | Viewer's native layer gets rejection → `onPeerDisconnected` → P2P times out → server fallback |

## File Map

| File | Role |
|------|------|
| `src/types/signaling.ts` | `SignalingChannel` type definition |
| `src/hooks/use-p2p-signaling.ts` | Wraps native modules into a `SignalingChannel` |
| `src/hooks/use-signaling.ts` | Wraps Socket.IO client into a `SignalingChannel` |
| `src/hooks/use-auto-connect.ts` | Transport selection orchestrator |
| `src/hooks/use-webrtc-connection.ts` | Consumes `SignalingChannel`, manages `RTCPeerConnection` |
| `modules/swinglink-multipeer/` | iOS native module (MultipeerConnectivity) |
| `modules/swinglink-wifi-direct/` | Android native module (Wi-Fi Direct) |
| `server/src/index.ts` | Signaling relay server (~130 lines) |
| `app/camera.tsx` | Camera screen integration |
| `app/viewer.tsx` | Viewer screen integration |
