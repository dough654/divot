# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SwingLink is a P2P video streaming app for golfers using React Native + Expo. Two devices connect directly: one acts as the camera (filming the swing), the other as the viewer (coach or self-review).

## Commands

### Development
```bash
npm run dev              # Start Metro with dev client (npx expo start --dev-client)
npm run typecheck        # TypeScript type checking
```

### Building (EAS Cloud Builds)
```bash
npm run build:android         # Development build for Android
npm run build:ios             # Development build for iOS
npm run build:android:preview # Preview build for Android
npm run build:ios:preview     # Preview build for iOS
npm run eas:login             # Login to EAS
```

### Signaling Server (in server/ directory)
```bash
npm run dev          # Run locally with ts-node
npm run build        # Compile TypeScript
npm run start        # Run compiled JS
npm run fly:deploy   # Deploy to Fly.io
npm run fly:logs     # View Fly.io logs
```

## Architecture

### Connection Flow
1. **Camera device** connects to signaling server, creates a room, displays QR code with room code
2. **Viewer device** scans QR (or enters code manually), joins the same room via signaling server
3. **WebRTC handshake**: Camera sends SDP offer → Viewer sends SDP answer → ICE candidates exchanged
4. **P2P video stream** established directly between devices

### Key Architectural Decisions
- **Signaling server** (`server/`) is minimal (~130 lines) - only relays WebRTC signaling messages, no media
- **QR payload** uses base64-encoded JSON with `SWINGLINK:` prefix for validation
- **Room codes** are 6-character alphanumeric (excluding ambiguous chars like 0/O, 1/I)
- **Dynamic Expo config** (`app.config.ts`) allows environment variables but requires manual plugin configuration

### Critical Hooks
- `use-webrtc-connection.ts` - Core P2P logic, manages RTCPeerConnection lifecycle
- `use-signaling.ts` - Socket.IO connection to signaling server
- `use-local-media-stream.ts` - Camera access with front/back toggle
- `use-connection-quality.ts` - Latency/bitrate monitoring via getStats()

### Known Issues
- **expo-camera barcode scanning on Android** - Does not work reliably on Samsung devices (see GitHub issues #25545, #26952). Manual room code entry is the fallback.
- **expo-barcode-scanner** - Deprecated and has Kotlin compilation issues with newer Expo SDK, do not use.

## Tech Stack Notes

- **Expo SDK 54** with Expo Router for file-based navigation
- **react-native-webrtc** requires native builds (dev client), won't work in Expo Go
- **Signaling server** deployed on Fly.io with `min_machines_running = 1` to avoid cold start timeouts
- **Socket.IO** transports configured as `['polling', 'websocket']` for better compatibility
