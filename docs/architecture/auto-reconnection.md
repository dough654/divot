# Auto-Reconnection Architecture

The auto-reconnection system detects WebRTC and signaling connection drops and automatically recovers without requiring users to re-scan QR codes. It handles two distinct failure scenarios with different recovery strategies.

## Overview

Connection drops on a golf course are common: network switches, Fly.io restarts, brief signal loss. Without auto-reconnection, every drop is a dead end requiring full re-pairing. The system observes ICE and signaling state and drives recovery automatically, with the camera always initiating (creating offers) and the viewer staying ready to accept.

## Failure Scenarios

| Scenario | Trigger | Signaling | Recovery Strategy |
|----------|---------|-----------|-------------------|
| **A** | ICE disconnected/failed | Still alive | ICE restart, then full renegotiation |
| **B** | Socket.IO disconnects | Lost | Reconnect socket, rejoin room, redo WebRTC handshake |

## State Machine

```
IDLE
  |-- ICE 'disconnected' --> 2s grace period (often self-heals)
  |   |-- self-heals --> IDLE
  |   '-- still failed --> SCENARIO_A
  |-- ICE 'failed' --> SCENARIO_A (immediately, skip grace period)
  '-- signaling 'disconnected' --> SCENARIO_B

SCENARIO_A (signaling alive):
  1. ICE restart (createOffer with iceRestart: true)
  2. If still failed --> full renegotiation (tear down PC, create fresh one)
  3. Exponential backoff between attempts
  4. Max exceeded --> GIVE_UP

SCENARIO_B (signaling lost):
  1. Socket.IO built-in reconnect attempts (5 attempts)
  2. On reconnected --> rejoinRoom with original room code
  3. On peer-joined --> camera creates new offer
  4. If all fail --> manual reconnect with backoff
  5. Max exceeded --> GIVE_UP
```

## Key Design Decisions

### Camera initiates, viewer accepts

The camera always creates offers and the viewer always answers. This avoids race conditions during reconnection. The viewer's `useAutoReconnect` passes no-op functions for `restartIce`/`renegotiate`/`sendOffer` — it only handles signaling rejoin.

### Grace period for ICE disconnected

ICE `disconnected` often self-heals within 1-2 seconds (e.g., brief network blip). A 2-second grace period avoids unnecessary reconnection attempts. ICE `failed` skips the grace period entirely.

### Recording suppression

During recording, only ICE restart is attempted (it preserves the existing RTCPeerConnection and data channels). Full renegotiation is suppressed because it tears down the peer connection. If ICE restart fails during recording, retries continue with backoff but skip renegotiation until recording stops.

### Transfer deferral

If a clip transfer is in progress when a disconnect occurs, all reconnection is deferred until the transfer completes or errors. This prevents data corruption mid-transfer.

### Room preservation on signaling disconnect

The signaling client no longer clears `currentRoom` when the socket disconnects — it only clears on explicit `disconnect()` or `leaveRoom()`. This allows the room code to survive transient disconnects for rejoin.

## Components

### Exponential Backoff Utility

`src/utils/exponential-backoff.ts`

Pure function: `calculateBackoffDelay(attempt, config) --> number | null`. Returns `null` when max attempts exceeded.

- Formula: `min(base * 2^attempt, max) * (1 + jitter)`
- Defaults: 1s base, 30s max, 5 attempts, 0.3 jitter factor

### Server-Side Rejoin

`server/src/index.ts` — `rejoin-room` event

- **Camera role**: Re-creates the room with the same code if it was cleaned up, then joins. Notifies any existing peer via `peer-joined`.
- **Viewer role**: Joins existing room (fails with "Room not found" if camera hasn't rejoined yet — viewer retries with backoff).

### Signaling Layer

`src/services/signaling/signaling-client.ts`

New methods:
- `rejoinRoom(roomCode, role)` — emits `rejoin-room` to server
- `reconnect()` — disconnect + connect cycle

New callback:
- `onReconnected` — fires on Socket.IO manager `reconnect` event

`src/hooks/use-signaling.ts` exposes these as `rejoinRoom`, `reconnectSignaling`, and `onReconnected`.

### WebRTC Layer

`src/services/webrtc/peer-connection-factory.ts`

- `createOffer` now accepts optional `{ iceRestart: boolean }` options

`src/hooks/use-webrtc-connection.ts`

New methods:
- `restartIce()` — creates offer with `iceRestart: true` on existing PC (lightweight)
- `renegotiate()` — tears down PC, creates fresh one with data channel, returns new offer

Modified:
- `handleOffer()` — tears down existing PC before creating new one (viewer accepts renegotiation offers)

### Orchestration Hook

`src/hooks/use-auto-reconnect.ts`

The core `useAutoReconnect` hook. Takes ICE state, signaling state, and action callbacks as options. Returns `reconnectionState` and `cancelReconnection`.

Internally uses a `determineReconnectionAction` pure function (exported for testing) that maps current context to one of: `none`, `reset`, `start-grace-period`, `start-scenario-a`, `start-scenario-b`, `defer`.

### UI

`src/components/connection/connection-status.tsx`

Two new connection steps:
- `reconnecting` — "Reconnecting...", refresh icon, amber color
- `reconnect-failed` — "Reconnection failed", close-circle icon, red color

### Screen Integration

`app/camera.tsx` — Tracks `wasConnected`, destructures `restartIce`/`renegotiate`/`webrtcStatus` from WebRTC hook, wires `useAutoReconnect` with camera role. Existing `onPeerJoined`/`onAnswer`/`onIceCandidate` handlers work for re-offers without modification.

`app/viewer.tsx` — Stores room code in ref after joining, tracks `wasConnected`, wires `useAutoReconnect` with viewer role (no-ops for offer actions). Existing `onOffer` handler accepts renegotiation offers from camera without modification.

## Types

```
ConnectionStep: ... | 'reconnecting' | 'reconnect-failed'

ReconnectionStrategy: 'ice-restart' | 'renegotiation' | 'signaling-rejoin'

ReconnectionState: {
  isReconnecting: boolean
  attempt: number
  maxAttempts: number
  lastDisconnectReason: string | null
  strategy: ReconnectionStrategy | null
}
```

## Edge Cases

| Case | Behavior |
|------|----------|
| ICE self-heals in <2s | Grace period timer cancelled, no reconnection attempt |
| Both peers disconnect from signaling | Each reconnects independently; camera re-creates room, viewer retries with backoff until room exists |
| Recording in progress | Only ICE restart; renegotiation deferred until recording stops |
| Clip transfer in progress | All reconnection deferred until transfer completes/errors |
| Signaling server full restart | All rooms gone; camera re-creates on rejoin, viewer finds it |
| Max retries exceeded | `reconnect-failed` step shown in UI |

## File Map

| File | Role |
|------|------|
| `src/utils/exponential-backoff.ts` | Backoff delay calculation |
| `src/utils/test/exponential-backoff.test.ts` | Backoff tests |
| `src/hooks/use-auto-reconnect.ts` | Orchestration hook + pure state machine |
| `src/hooks/test/use-auto-reconnect.test.ts` | State machine tests |
| `src/types/app-state.ts` | `ReconnectionState`, `ReconnectionStrategy` types |
| `src/types/signaling.ts` | `rejoin-room` event type, `RejoinRoomResponse` |
| `server/src/index.ts` | `rejoin-room` socket event |
| `src/services/signaling/signaling-client.ts` | `rejoinRoom`, `reconnect`, `onReconnected` |
| `src/hooks/use-signaling.ts` | Hook wrappers for new signaling methods |
| `src/services/webrtc/peer-connection-factory.ts` | `iceRestart` option on `createOffer` |
| `src/hooks/use-webrtc-connection.ts` | `restartIce`, `renegotiate`, renegotiation-aware `handleOffer` |
| `src/components/connection/connection-status.tsx` | Reconnecting/failed UI states |
| `app/camera.tsx` | Camera screen auto-reconnect wiring |
| `app/viewer.tsx` | Viewer screen auto-reconnect wiring |
