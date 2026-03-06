# Divot MVP Scope

> Approved: 2026-02-06
> Last updated: 2026-03-01
> Status: In Progress

## Product Vision

Divot is a P2P video streaming app for golfers. Two devices connect directly — one films the swing, the other displays the live feed for a coach or self-review. Record, replay, annotate, and auto-detect swings without cloud dependency for the core experience.

**Core differentiator**: Real-time P2P streaming between two devices at the range. No upload-then-review workflow. The free experience is fully featured — Pro unlocks advanced analysis and cloud features.

---

## Monetization Model

### Free Tier
Generous free tier — the core filming and review experience is fully unlocked. Free users are the growth engine. Golf is social, and "film my swing with this app" is the acquisition loop. The two-device requirement is already a friction point — gating basic features on top kills word-of-mouth.

| Capability | Access |
|------------|--------|
| P2P streaming | Unlimited |
| Manual recording | Unlimited |
| Saved clips | Unlimited |
| Playback (slow-mo, frame step) | Full access |
| Annotation tools | Full (freehand, line, angle, ellipse) |
| Session management | Yes |
| Clip sync (P2P transfer) | Yes |
| Swing auto-detection | Yes (pose + motion) |
| DTL / face-on camera angle toggle | Yes |
| Video export | With "recorded with divot" watermark |

**Rationale**: Everything needed for a complete practice session is free. Export includes a small watermark — users who share clips become organic marketing. Upgrade pressure comes from wanting advanced analysis tools and clean exports.

### Divot Pro (~$8-10/month)
Advanced analysis and polish.

| Capability | Access |
|------------|--------|
| Everything in Free | Included |
| Cloud backup | Back up clips to the cloud |
| Share via link | Share clips without both devices present |
| Swing tempo measurement | Backswing/downswing ratio |
| Pose overlay on playback | Skeleton overlay with joint angles |
| Side-by-side comparison | Compare two swings frame-by-frame |
| Ghost overlay comparison | Overlay a reference swing on playback |
| Watermark-free video export | Export clips without the divot watermark |

---

## MVP Feature Map

### Already Built

**Core Streaming**
- [x] P2P WebRTC video streaming via VisionCamera + native frame processor
- [x] Socket.IO signaling server (deployed on Fly.io, rate-limited — GOL-107)
- [x] QR code pairing with manual code entry fallback
- [x] Auto-reconnection (ICE restart + signaling rejoin scenarios)
- [x] Adaptive bitrate (high/medium/low quality presets based on network)
- [x] Connection quality monitoring (latency, bitrate, packet loss)

**Recording & Playback**
- [x] Manual video recording with VisionCamera (audio optional)
- [x] Clip storage (save, list, rename, delete, clear all)
- [x] Video playback with play/pause, seek bar, fullscreen
- [x] Slow motion (0.25x, 0.5x, 1x speed controls)
- [x] Frame-by-frame stepping
- [x] Clip sync via WebRTC data channel (chunked transfer)
- [x] Swing auto-detection — pose-based (CNN classifier + shoulder rotation) and motion-based pipelines (GOL-40)
- [x] Rolling recorder with pre/post-roll buffering
- [x] Remote arm/disarm via data channel (GOL-41)
- [x] Session management — auto-create on connect, clip tagging, list/detail screens, notes, location (GOL-42)

**Annotation & Export**
- [x] Freehand drawing, straight line, angle measurement, ellipse/circle
- [x] Color palette, stroke width, undo/redo
- [x] Export annotated frame to device gallery
- [x] Video export with FFmpeg overlay compositing
- [x] Export watermark for free users ("recorded with divot")

**Swing Analysis**
- [x] Shaft detection via Apple Vision / ML Kit pose estimation
- [x] Shaft overlay on playback with trace path
- [x] Swing phase detection (address, backswing, downswing, follow-through)
- [x] Shoulder rotation tracking for DTL angle

**Authentication & Backend**
- [x] Clerk authentication — email/password, Sign in with Apple, Google OAuth (GOL-34)
- [x] Auth state persistence, account deletion
- [x] Turso (libSQL) database with user/clip/session schema (GOL-95)
- [x] Hono API server on Fly.io (GOL-96)
- [x] Cloudflare R2 cloud storage with presigned uploads (GOL-97)
- [x] Clerk EAS secrets for cloud builds (GOL-99)

**Subscription Infrastructure**
- [x] RevenueCat SDK integration (react-native-purchases) (GOL-108)
- [x] Paywall screen with Pro/Free feature comparison
- [x] `useProAccess()` hook and `ProGate` component
- [x] Purchase and restore flows
- [x] Cross-device subscription sync via Clerk user ID

**Analytics**
- [x] PostHog integration — event tracking, user identification, feature flags
- [x] Swing detection analytics, connection quality analytics

**UI & Polish**
- [x] Design system (Stark palette, Darker Grotesque + Manrope fonts)
- [x] Full dark/light theme with system preference detection
- [x] Haptic feedback, accessibility labels, screen reader announcements
- [x] Toast notification system, skeleton loaders, empty states
- [x] Landscape layouts for camera, viewer, home, clips, playback
- [x] Settings screen (theme, haptics, clear data, send feedback)
- [x] Centralized error messages with recovery actions

**Testing**
- [x] 594 tests (unit, integration, E2E connection flow)

---

### Needs Building

These features are required for MVP launch. Tracked in Linear with the `MVP` label.

#### Pro Feature Gating

**GOL-111 — Gate pose overlay on playback behind Pro** (Medium)
Pose/shaft overlay is currently available to all users. Needs Pro gating — show the toggle but disabled for free users with an upgrade prompt.

**GOL-110 — Swing tempo measurement** (High)
Calculate and display backswing/downswing tempo ratio from existing phase detection timestamps. Pro-only feature. Color-coded ratio display on playback screen.

**GOL-109 — Side-by-side swing comparison** (High)
Split-screen clip comparison with synchronized scrubbing. Flagship Pro feature. Clip picker, sync-point selection, independent play/pause.

**GOL-114 — Cloud backup & share via link** (High)
Mobile integration for cloud backup (R2 infra is built). Upload clips, sync session metadata to API, generate shareable web links. Pro-only. Offline-first with upload queue.

#### Free Tier Features

**GOL-115 — DTL / face-on camera angle toggle** (High)
Add camera angle selector to camera screen. Tag clips with `cameraAngle` metadata. Display angle badge on clip list and session detail. Currently only front/back camera toggle exists — this is conceptual angle tagging, not physical camera selection.

#### Launch Prep

**GOL-102 — Privacy policy & terms of service** (Urgent)
Required by both app stores. Must address camera/mic usage, local storage, cloud storage, P2P connections, Clerk auth data, analytics.

**GOL-100 — App icon & splash screen** (High)
Production icon (1024x1024 iOS, 512x512 + adaptive Android) and splash screen with Divot branding.

**GOL-101 — App Store & Play Store listing** (High)
Store descriptions, keywords, screenshots for all required device sizes, feature graphic.

**GOL-103 — Production build configuration** (High)
EAS production profile, signing certificates, provisioning, bundle IDs, environment variables, OTA update config.

**GOL-104 — TestFlight & internal testing** (High)
Beta distribution on both platforms. TestFlight + Play Store internal track. Test on range of real devices.

**GOL-105 — Pre-launch polish pass** (Medium)
End-to-end UX walkthrough on real devices. Error states, edge cases, navigation flows, accessibility audit.

**GOL-106 — Analytics & crash reporting** (High)
PostHog analytics is done. Still needs crash reporting (Sentry or similar) — native crashes and JS error capture.

**GOL-29 — First-time onboarding** (High)
2-3 screen walkthrough explaining the two-device concept. Visual diagrams, skip option, show-once flag.

---

## Decisions Made

| Decision | Resolution |
|----------|-----------|
| BaaS provider | Clerk for auth, Turso (libSQL) for database, Hono on Fly.io for API |
| Cloud storage | Cloudflare R2 (S3-compatible) |
| IAP library | RevenueCat (react-native-purchases) |
| Swing detection | Dual pipeline — pose-based (CNN + shoulder rotation) and motion-based |
| Analytics | PostHog (events, feature flags, user identification) |
| Session storage | Local persistence with cloud sync via API |

## Open Decisions

| Decision | Options | Notes |
|----------|---------|-------|
| Subscription price | $8/mo / $10/mo / $8/mo + $60/yr | Leaning $9.99/month, $59.99/year |
| Crash reporting | Sentry / Bugsnag | Sentry is the likely choice |

---

## Implementation Order

Remaining work organized by dependency and priority.

### Phase 1: Pro Features
> Build the features users are paying for

1. Gate pose overlay behind Pro (GOL-111)
2. Swing tempo measurement (GOL-110)
3. DTL / face-on camera angle toggle (GOL-115)
4. Side-by-side swing comparison (GOL-109)
5. Cloud backup & share via link (GOL-114)

### Phase 2: Launch Prep
> Everything needed for store submission

1. Privacy policy & terms of service (GOL-102)
2. App icon & splash screen (GOL-100)
3. Crash reporting integration (GOL-106)
4. Production build configuration (GOL-103)
5. First-time onboarding (GOL-29)
6. Store listing content (GOL-101)
7. Pre-launch polish pass (GOL-105)
8. TestFlight & internal testing (GOL-104)

---

## Success Criteria

MVP is shippable when:

- [x] New user can sign up, log in, and recover password
- [x] Free user can stream, record unlimited clips, annotate, and manage sessions
- [x] Free user can export video clips with "recorded with divot" watermark
- [x] Subscription paywall infrastructure is in place
- [x] Sessions are created automatically and clips are grouped correctly
- [x] Pose-based and motion-based auto-detection capture swings with pre/post-roll
- [ ] Free user sees upgrade prompt when accessing Pro features (pose overlay, tempo, etc.)
- [ ] Pro user has watermark-free export, cloud backup, tempo, side-by-side, ghost overlay
- [ ] Subscription products configured in App Store Connect and Play Console
- [ ] First-time user understands the two-device concept from onboarding
- [ ] App passes App Store and Play Store review
- [ ] Crash reporting is active and collecting data
- [ ] Privacy policy and terms of service are published
