# Connection Flow Diagrams

Visual companion to [p2p-signaling-and-server-fallback.md](./p2p-signaling-and-server-fallback.md). All diagrams use [Mermaid](https://mermaid.js.org/) syntax and render natively on GitHub, VS Code, and most markdown viewers.

## Table of Contents

- [System Architecture](#system-architecture)
- [Transport Selection State Machine](#transport-selection-state-machine)
- [Scenario A: Same-Platform P2P (iOS ↔ iOS)](#scenario-a-same-platform-p2p-ios--ios)
- [Scenario B: Same-Platform P2P (Android ↔ Android)](#scenario-b-same-platform-p2p-android--android)
- [Scenario C: Cross-Platform Server Fallback](#scenario-c-cross-platform-server-fallback)
- [Scenario D: P2P Timeout → Server Fallback](#scenario-d-p2p-timeout--server-fallback)
- [WebRTC Handshake (Transport-Agnostic)](#webrtc-handshake-transport-agnostic)
- [Android Wi-Fi Direct Internals](#android-wi-fi-direct-internals)
- [Cleanup & Disconnect](#cleanup--disconnect)

---

## System Architecture

How the layers stack. Screens talk to `useAutoConnect`, which picks between P2P and server signaling. `useWebRTCConnection` consumes the winning channel without knowing how signals travel.

```mermaid
graph TB
    subgraph Screens
        CAM[app/camera.tsx]
        VIEW[app/viewer.tsx]
    end

    subgraph "Hook Layer"
        AC[useAutoConnect<br/><i>transport orchestrator</i>]
        P2P[useP2PSignaling<br/><i>native module wrapper</i>]
        SIG[useSignaling<br/><i>Socket.IO client</i>]
        WEBRTC[useWebRTCConnection<br/><i>RTCPeerConnection</i>]
    end

    subgraph "Native Modules"
        MPC[divot-multipeer<br/><i>iOS MultipeerConnectivity</i>]
        WD[divot-wifi-direct<br/><i>Android Wi-Fi Direct</i>]
    end

    SERVER[Signaling Server<br/><i>Fly.io · Socket.IO</i>]

    CAM & VIEW --> AC
    AC --> P2P
    AC --> SIG
    AC -- "winning SignalingChannel" --> WEBRTC
    P2P -- "iOS" --> MPC
    P2P -- "Android" --> WD
    SIG --> SERVER

    style AC fill:#4a9eff,color:#fff
    style WEBRTC fill:#34c759,color:#fff
    style P2P fill:#ff9f0a,color:#fff
    style SIG fill:#ff9f0a,color:#fff
```

### The SignalingChannel Interface

Both `useP2PSignaling` and `useSignaling` return the same shape. `useWebRTCConnection` doesn't know or care which one it's using.

```
SignalingChannel
├── sendOffer(sdp)
├── sendAnswer(sdp)
├── sendIceCandidate(candidate)
├── onOffer(handler) → unsubscribe
├── onAnswer(handler) → unsubscribe
├── onIceCandidate(handler) → unsubscribe
└── disconnect()
```

---

## Transport Selection State Machine

`useAutoConnect` runs this state machine. Once a transport locks in, it stays for the entire session.

```mermaid
stateDiagram-v2
    [*] --> idle

    idle --> attempting_p2p: enabled && roomCode<br/>canAttemptP2P
    idle --> needs_server: enabled && roomCode<br/>!canAttemptP2P

    attempting_p2p --> connected_p2p: p2p.state = 'connected'
    attempting_p2p --> needs_server: p2p.state = 'disconnected'<br/>(timeout or failure)

    needs_server --> connected_server: serverReady = true

    connected_p2p --> [*]: LOCKED · p2p.channel
    connected_server --> [*]: LOCKED · serverChannel
```

**P2P eligibility rule:**
- Camera always attempts P2P (doesn't know remote platform yet)
- Viewer attempts P2P only if `remotePlatform === localPlatform`

---

## Scenario A: Same-Platform P2P (iOS ↔ iOS)

MultipeerConnectivity handles discovery, invitation, and data transport. No server involved after QR scan.

```mermaid
sequenceDiagram
    participant CamScreen as Camera Screen
    participant CamAC as useAutoConnect
    participant CamP2P as useP2PSignaling
    participant MPC_C as MultipeerManager<br/>(Camera iOS)
    participant MPC_V as MultipeerManager<br/>(Viewer iOS)
    participant ViewP2P as useP2PSignaling
    participant ViewAC as useAutoConnect
    participant ViewScreen as Viewer Screen

    Note over CamScreen: User opens camera screen
    CamScreen->>CamAC: enabled=true, role='camera'
    CamAC->>CamP2P: start()
    CamP2P->>MPC_C: startAdvertising(roomCode)
    Note over MPC_C: MCNearbyServiceAdvertiser<br/>broadcasts on local network

    Note over ViewScreen: User selects same-platform device
    ViewScreen->>ViewAC: enabled=true, role='viewer'<br/>remotePlatform='ios'
    ViewAC->>ViewP2P: start()
    ViewP2P->>MPC_V: startBrowsing(roomCode)
    Note over MPC_V: MCNearbyServiceBrowser<br/>discovers advertiser

    MPC_V->>MPC_C: MPC invitation
    MPC_C-->>CamP2P: onInvitationReceived(peerName)
    CamP2P-->>CamAC: pendingInvitation set
    CamAC-->>CamScreen: show ConnectionRequestModal

    Note over CamScreen: User taps Accept
    CamScreen->>CamAC: acceptInvitation()
    CamAC->>CamP2P: respondToInvitation(true)
    CamP2P->>MPC_C: invitationHandler(true, session)

    MPC_C-->>MPC_V: MPC session established
    MPC_C-->>CamP2P: onPeerConnected
    MPC_V-->>ViewP2P: onPeerConnected

    CamP2P-->>CamAC: state='connected'
    CamAC-->>CamAC: LOCK transport='p2p'
    ViewP2P-->>ViewAC: state='connected'
    ViewAC-->>ViewAC: LOCK transport='p2p'

    Note over CamScreen,ViewScreen: WebRTC handshake begins<br/>(see WebRTC diagram below)
```

---

## Scenario B: Same-Platform P2P (Android ↔ Android)

Wi-Fi Direct uses DNS-SD discovery, a Wi-Fi Direct group, and TCP sockets for signaling. More moving parts than iOS.

```mermaid
sequenceDiagram
    participant CamScreen as Camera Screen
    participant CamP2P as useP2PSignaling
    participant WDM_C as WifiDirectManager<br/>(Camera)
    participant TCP_S as TcpSignalingServer
    participant TCP_C as TcpSignalingClient
    participant WDM_V as WifiDirectManager<br/>(Viewer)
    participant ViewP2P as useP2PSignaling
    participant ViewScreen as Viewer Screen

    Note over CamScreen: Camera starts advertising
    CamScreen->>CamP2P: start()
    CamP2P->>WDM_C: startAdvertising(roomCode)
    WDM_C->>WDM_C: createGroup() → become Group Owner
    WDM_C->>TCP_S: start() on background thread
    Note over TCP_S: ServerSocket binds to<br/>OS-assigned port (e.g. 37842)
    TCP_S-->>WDM_C: localPort = 37842
    WDM_C->>WDM_C: ServiceRegistrar.registerService()<br/>DNS-SD: {rc, port, pl}

    Note over ViewScreen: Viewer starts browsing
    ViewScreen->>ViewP2P: start()
    ViewP2P->>WDM_V: startBrowsing(roomCode)
    WDM_V->>WDM_V: ServiceDiscoverer.startDiscovery()

    Note over WDM_V: DNS-SD callbacks fire<br/>(TXT record + device,<br/>correlated by address)
    WDM_V->>WDM_V: handleServiceFound(device, port=37842)
    WDM_V->>WDM_V: wifiP2pManager.connect(device)

    Note over WDM_V: CONNECTION_CHANGED broadcast
    WDM_V->>WDM_V: handleConnectionChanged(info)
    WDM_V->>TCP_C: connect(goAddress, 37842)

    TCP_C->>TCP_S: {"type":"hello","payload":"Pixel 7"}
    TCP_S-->>WDM_C: onClientConnected("Pixel 7")
    WDM_C-->>CamP2P: onInvitationReceived("Pixel 7")

    Note over CamScreen: User taps Accept
    CamScreen->>CamP2P: respondToInvitation(true)
    CamP2P->>WDM_C: respondToInvitation(true)
    WDM_C->>TCP_S: send hello-ack:accepted

    TCP_S->>TCP_C: {"type":"hello-ack","payload":"accepted"}
    Note over TCP_S: soTimeout cleared → idle OK
    TCP_C-->>WDM_V: onConnected
    WDM_C-->>CamP2P: onPeerConnected
    WDM_V-->>ViewP2P: onPeerConnected

    Note over CamScreen,ViewScreen: Transport locked to P2P<br/>WebRTC handshake begins
```

### Android DNS-SD Race Condition

Android fires two independent callbacks for each discovered service — a TXT record listener and a service response listener — in no guaranteed order. `ServiceDiscoverer` correlates them by device address:

```mermaid
graph LR
    subgraph "Android fires independently"
        TXT["DnsSdTxtRecordListener<br/>{rc, port, pl} + deviceAddress"]
        SVC["DnsSdServiceResponseListener<br/>WifiP2pDevice + deviceAddress"]
    end

    subgraph "ServiceDiscoverer correlates"
        PENDING["pendingTxtRecords<br/>pendingServiceDevices<br/>(keyed by deviceAddress)"]
        MATCH["Both arrived?<br/>Validate roomCode<br/>→ onServiceFound()"]
    end

    TXT --> PENDING
    SVC --> PENDING
    PENDING --> MATCH
```

### Android CONNECTION_CHANGED vs Service Discovery Race

The viewer can receive the Wi-Fi P2P `CONNECTION_CHANGED` broadcast before service discovery provides the TCP port. This is handled with a cache:

```mermaid
graph TD
    A["CONNECTION_CHANGED fires<br/>(group formed)"] --> B{targetPort known?}
    B -- "Yes" --> C["startViewerTcpClient(info)"]
    B -- "No" --> D["Cache as pendingConnectionInfo"]

    E["handleServiceFound()<br/>sets targetPort"] --> F{pendingConnectionInfo<br/>cached?}
    F -- "Yes" --> G["startViewerTcpClient(cached)"]
    F -- "No" --> H["wifiP2pManager.connect()"]
    H --> A
```

---

## Scenario C: Cross-Platform Server Fallback

When the viewer detects a different-platform camera (via BLE metadata), P2P is skipped entirely and signaling goes through the server.

```mermaid
sequenceDiagram
    participant CamScreen as Camera Screen<br/>(iOS)
    participant CamSIG as useSignaling
    participant SERVER as Signaling Server<br/>(Fly.io)
    participant ViewSIG as useSignaling
    participant ViewAC as useAutoConnect
    participant ViewScreen as Viewer Screen<br/>(Android)

    Note over CamScreen: Camera creates room on server
    CamScreen->>CamSIG: connect() + createRoom()
    CamSIG->>SERVER: create-room
    SERVER-->>CamSIG: roomCode="A3BK7F"

    Note over ViewScreen: Viewer discovers camera via BLE<br/>remotePlatform='ios' ≠ localPlatform='android'
    ViewScreen->>ViewAC: enabled=true, remotePlatform='ios'
    Note over ViewAC: canAttemptP2P = false<br/>→ skip P2P, state='needs-server'
    ViewAC-->>ViewScreen: needsServerSignaling=true

    ViewScreen->>ViewSIG: connect()
    ViewScreen->>ViewSIG: requestRoom("A3BK7F", deviceName, "android")
    ViewSIG->>SERVER: room:request

    SERVER->>CamSIG: room:request(viewerName, platform)
    CamSIG-->>CamScreen: ConnectionRequestModal

    Note over CamScreen: User taps Accept
    CamScreen->>CamSIG: respondToRequest(roomCode, requesterId, true)
    CamSIG->>SERVER: room:request-response(accepted)
    SERVER->>ViewSIG: room:request-response(accepted)

    ViewSIG-->>ViewScreen: accepted!
    ViewScreen->>ViewSIG: joinRoom("A3BK7F")
    ViewSIG->>SERVER: join-room
    SERVER-->>ViewSIG: joined
    ViewScreen->>ViewAC: serverReady=true
    Note over ViewAC: LOCK transport='server'

    SERVER->>CamSIG: peer-joined
    CamSIG-->>CamScreen: onPeerJoined → createOffer()

    Note over CamScreen,ViewScreen: WebRTC handshake begins via server relay<br/>(see WebRTC diagram below)
```

---

## Scenario D: P2P Timeout → Server Fallback

Same-platform devices, but P2P fails (Wi-Fi off, permission denied, out of range). After 25 seconds the viewer times out and falls back.

```mermaid
sequenceDiagram
    participant ViewAC as useAutoConnect<br/>(Viewer)
    participant ViewP2P as useP2PSignaling
    participant NATIVE as Native Module
    participant ViewSIG as useSignaling
    participant SERVER as Signaling Server

    ViewAC->>ViewP2P: start()
    ViewP2P->>NATIVE: startBrowsing(roomCode)
    Note over ViewAC: state='attempting-p2p'

    Note over NATIVE: 25 seconds pass...<br/>no peer found

    ViewP2P->>ViewP2P: Timeout fires
    ViewP2P->>NATIVE: disconnect()
    ViewP2P-->>ViewAC: state='disconnected'
    Note over ViewAC: state='needs-server'

    ViewAC-->>ViewSIG: needsServerSignaling=true
    Note over ViewSIG,SERVER: Server handshake begins<br/>(same as Scenario C from here)
```

---

## WebRTC Handshake (Transport-Agnostic)

This happens identically regardless of whether signals travel over P2P or the server. `useWebRTCConnection` only sees `SignalingChannel`.

```mermaid
sequenceDiagram
    participant CAM as Camera<br/>useWebRTCConnection
    participant CH as SignalingChannel<br/>(P2P or Server)
    participant VIEW as Viewer<br/>useWebRTCConnection

    Note over CAM: createOffer() called by screen
    CAM->>CAM: new RTCPeerConnection()
    CAM->>CAM: addTrack(videoTrack)
    CAM->>CAM: createDataChannel('clip-sync')
    CAM->>CAM: createOffer() → SDP
    CAM->>CAM: setLocalDescription(offer)
    CAM->>CH: sendOffer(sdp)

    CH->>VIEW: onOffer(sdp)
    VIEW->>VIEW: new RTCPeerConnection()
    VIEW->>VIEW: setRemoteDescription(offer)
    VIEW->>VIEW: createAnswer() → SDP
    VIEW->>VIEW: setLocalDescription(answer)
    VIEW->>CH: sendAnswer(sdp)

    CH->>CAM: onAnswer(sdp)
    CAM->>CAM: setRemoteDescription(answer)

    par ICE Trickle (both directions)
        CAM->>CH: sendIceCandidate(candidate)
        CH->>VIEW: onIceCandidate(candidate)
        VIEW->>VIEW: addIceCandidate(candidate)
    and
        VIEW->>CH: sendIceCandidate(candidate)
        CH->>CAM: onIceCandidate(candidate)
        CAM->>CAM: addIceCandidate(candidate)
    end

    Note over CAM,VIEW: iceConnectionState → 'connected'<br/>Video stream flows directly P2P<br/>(no relay, no server)
```

---

## Android Wi-Fi Direct Internals

Detailed component view of what happens inside `WifiDirectManager`.

### Camera Internal Flow

```mermaid
graph TD
    A["startAdvertising(roomCode)"] --> B["awaitTearDown()"]
    B --> C["registerReceiver()<br/>Wi-Fi P2P broadcasts"]
    C --> D["createGroup()<br/>→ become Group Owner"]
    D --> E["TcpSignalingServer.start()<br/>on background thread"]
    E --> F["ServerSocket(0)<br/>binds to ephemeral port"]
    F --> G["ServiceRegistrar.registerService()<br/>DNS-SD: _divot-sig._tcp"]
    G --> H["accept() blocks<br/>waiting for viewer"]
    H --> I["Viewer connects<br/>read hello frame"]
    I --> J["Clear soTimeout<br/>(handshake done)"]
    J --> K["onClientConnected(peerName)"]
    K --> L["handleViewerHello()"]
    L --> M["Emit onInvitationReceived<br/>to JavaScript"]
    M --> N{"JS responds"}
    N -- "accepted" --> O["Send hello-ack:accepted<br/>Emit onPeerConnected"]
    N -- "rejected" --> P["Send hello-ack:rejected<br/>Emit onPeerDisconnected"]
    O --> Q["Read loop:<br/>relay signaling messages"]
```

### Viewer Internal Flow

```mermaid
graph TD
    A["startBrowsing(roomCode)"] --> B["awaitTearDown()"]
    B --> C["registerReceiver()"]
    C --> D["ServiceDiscoverer.startDiscovery()"]
    D --> E["DNS-SD finds camera<br/>with matching roomCode"]
    E --> F["handleServiceFound(device, port)"]
    F --> G["wifiP2pManager.connect(device)"]
    G --> H["CONNECTION_CHANGED broadcast"]
    H --> I["handleConnectionChanged(info)"]
    I --> J["startViewerTcpClient(goAddress, port)"]
    J --> K["TcpSignalingClient.connect()"]
    K --> L["Send hello"]
    L --> M["Wait for hello-ack"]
    M --> N{"hello-ack payload?"}
    N -- "accepted" --> O["Clear soTimeout<br/>Emit onConnected"]
    N -- "rejected" --> P["Emit onRejected"]
    O --> Q["Read loop:<br/>relay signaling messages"]
```

### TCP Frame Protocol

Both `TcpSignalingServer` and `TcpSignalingClient` use length-prefixed JSON frames:

```
┌─────────────────────┬──────────────────────────────────────────┐
│ 4 bytes (big-endian) │ UTF-8 JSON payload                      │
│ frame length         │                                          │
├─────────────────────┼──────────────────────────────────────────┤
│ 00 00 00 2F          │ {"type":"hello","payload":"Pixel 7"}     │
├─────────────────────┼──────────────────────────────────────────┤
│ 00 00 00 35          │ {"type":"hello-ack","payload":"accepted"} │
├─────────────────────┼──────────────────────────────────────────┤
│ 00 00 01 A4          │ {"type":"offer","payload":"v=0\r\n..."}   │
└─────────────────────┴──────────────────────────────────────────┘
```

---

## Cleanup & Disconnect

### useAutoConnect Cleanup

When `enabled` toggles false or `roomCode` changes while the component is mounted, the effect cleanup calls `p2p.stop()`. This is idempotent with `useP2PSignaling`'s own unmount cleanup.

```mermaid
graph TD
    A["enabled/roomCode changes"] --> B["useEffect cleanup fires"]
    B --> C["p2p.stop()"]
    C --> D["clearTimeout()"]
    C --> E["removeAllListeners()"]
    C --> F["nativeModule.disconnect()"]
    C --> G["state → 'disconnected'"]

    H["Component unmounts"] --> I["useP2PSignaling<br/>unmount cleanup"]
    I --> D
    I --> E
    I --> F
    Note right of I: Same calls — idempotent
```

### Android Wi-Fi P2P Disconnect Broadcast

When the Wi-Fi Direct link drops (devices out of range, OS reclaims the group), the `CONNECTION_CHANGED` broadcast handler closes TCP sockets. This unblocks read loops, whose `finally` blocks emit `onPeerDisconnected` to JS.

```mermaid
sequenceDiagram
    participant OS as Android OS
    participant BR as BroadcastReceiver
    participant EX as Executor Thread
    participant TCP as TCP Server/Client
    participant JS as JavaScript

    OS->>BR: CONNECTION_CHANGED<br/>(networkInfo.isConnected = false)
    BR->>EX: close TCP sockets
    EX->>TCP: tcpServer.stop() / tcpClient.disconnect()
    Note over TCP: Socket closed → read loop<br/>throws IOException
    TCP->>TCP: finally block runs
    TCP-->>JS: onPeerDisconnected
    Note over JS: useP2PSignaling<br/>state → 'disconnected'
```

### Full Android tearDown()

Called by `disconnect()` or `awaitTearDown()` before a new session. Cleans up everything.

```mermaid
graph TD
    A["tearDown()"] --> B["Reject pending invitation<br/>(CompletableFuture → false)"]
    B --> C["Stop TCP server + client<br/>Interrupt TCP thread"]
    C --> D["Unregister DNS-SD service"]
    D --> E["Stop service discovery"]
    E --> F["Unregister BroadcastReceiver"]
    F --> G["clearLocalServices()<br/>clearServiceRequests()"]
    G --> H["removeGroup()"]
    H --> I["Clear state:<br/>roomCode, targetPort,<br/>pendingConnectionInfo"]
    I --> J["Return CompletableFuture<br/>(resolves when removeGroup completes)"]
```
