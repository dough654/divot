# Divot MVP Scope

> Approved: 2026-02-06
> Status: Draft

## Product Vision

Divot is a P2P video streaming app for golfers. Two devices connect directly — one films the swing, the other displays the live feed for a coach or self-review. Record, replay, annotate, and auto-detect swings without cloud infrastructure or third-party video services.

**Core differentiator**: Real-time P2P streaming between two devices at the range. No upload-then-review workflow. No cloud dependency for the core experience.

---

## Monetization Model

### Free Tier
Permanent free access with limits. Free users are the growth engine — golf is social, and "film my swing with this app" is the acquisition loop.

| Capability | Limit |
|------------|-------|
| P2P streaming | Unlimited |
| Manual recording | Unlimited |
| Saved clips | 3 max |
| Playback (slow-mo, frame step) | Full access |
| Annotation tools | Not available |
| Session management | Not available |
| Auto-detection | Not available |
| Remote arm/disarm | Not available |
| Clip sync (P2P transfer) | Not available |

**Rationale**: Streaming and basic recording are free to minimize friction. The two-device requirement is already a barrier — adding a paywall on top kills word-of-mouth. Free users experience the core value (live swing view) and hit the clip limit naturally, creating upgrade pressure.

### Paid Tier (~$8-10/month)
The full swing analysis experience.

| Capability | Access |
|------------|--------|
| Everything in Free | Included |
| Saved clips | Unlimited |
| Annotation tools | Full (freehand, line, angle, ellipse) |
| Save annotated frames | Yes |
| Session management | Yes |
| Swing auto-detection | Yes (motion-based) |
| Remote arm/disarm | Yes |
| Clip sync | Yes |

### Pro Tier (~$15-20/month) — Post-MVP
Advanced ML-powered analysis. Not in scope for initial launch.

| Capability | Access |
|------------|--------|
| Everything in Paid | Included |
| Skeleton angle detection | Auto-overlay joint angles |
| Swing plane lines | Automated plane visualization |
| Swing issue detection | AI-powered diagnostics and suggestions |
| Side-by-side comparison | Compare two swings frame-by-frame |

---

## MVP Feature Map

### Already Built

These features are complete, tested, and in the codebase today.

**Core Streaming**
- [x] P2P WebRTC video streaming via VisionCamera + native frame processor
- [x] Socket.IO signaling server (deployed on Fly.io)
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

**Annotation Tools**
- [x] Freehand drawing
- [x] Straight line tool
- [x] Angle measurement with degree label
- [x] Ellipse/circle tool
- [x] Color palette (white, red, yellow, blue)
- [x] Adjustable stroke width
- [x] Undo/redo
- [x] Export annotated frame to device gallery

**UI & Polish**
- [x] Design system (Stark palette, Darker Grotesque + Manrope fonts)
- [x] Full dark/light theme with system preference detection
- [x] Haptic feedback throughout UI
- [x] Accessibility labels on all interactive elements
- [x] Screen reader announcements for connection status
- [x] Toast notification system
- [x] Skeleton loaders, empty states
- [x] Press animations, connection status animations, Android ripple
- [x] Landscape layouts for camera, viewer, home, clips, playback
- [x] Settings screen (theme, haptics, clear data, send feedback)
- [x] Centralized error messages with recovery actions

**Testing**
- [x] Unit tests for utilities (angle math, ellipse math, backoff, QR payload, room codes)
- [x] Mock WebRTC infrastructure for integration tests
- [x] E2E connection flow tests (28 tests)
- [x] 130+ total tests

### Needs Building

These features are required for MVP launch.

#### 1. User Authentication (GOL-34)
**Priority**: Critical — blocks subscriptions, session management
**Effort**: Large

- Backend/BaaS selection (Firebase Auth, Supabase, or custom)
- Email/password sign-up and login
- OAuth providers (Sign in with Apple required for App Store, Google optional)
- Password reset flow
- Auth state persistence (stay logged in)
- Authenticated signaling server (associate rooms with users)
- Account deletion (App Store requirement)

**Open decision**: Firebase vs Supabase vs custom backend. Firebase has better RN ecosystem support and built-in App Store IAP validation. Supabase is more developer-friendly with direct Postgres access.

#### 2. Subscription & In-App Purchases (NEW)
**Priority**: Critical — the business model
**Effort**: Large

- App Store IAP configuration (auto-renewable subscriptions)
- Play Store billing integration
- Receipt validation (server-side)
- Entitlement checking (what tier is this user on?)
- Free tier enforcement (clip count limit, feature gating)
- Paywall UI (upgrade prompts when hitting limits)
- Restore purchases flow
- Trial period handling (if we add one later)
- Subscription status sync between devices

**Recommended library**: `react-native-purchases` (RevenueCat SDK) — handles both platforms, receipt validation, and analytics. Avoids building billing infrastructure from scratch.

#### 3. Session Management (GOL-42)
**Priority**: High — depends on auth
**Effort**: Medium

- Auto-create session when devices connect
- Associate clips with the active session
- Session metadata: start/end time, clip count, duration
- Session list screen (new route)
- View clips within a session
- Session naming (auto-generated, renamable)
- Persist sessions locally (SQLite or AsyncStorage)

#### 4. Remote Recording Activation (GOL-41)
**Priority**: High — key UX for the solo golfer use case
**Effort**: Small

- Viewer sends arm/disarm commands via WebRTC data channel
- Camera enters armed mode with visual indicator
- Works with both manual recording and auto-detection
- Status sync between devices (both show armed/disarmed state)

**Note**: This is mostly data channel messaging over existing infrastructure. Low risk.

#### 5. Swing Auto-Detection (GOL-40)
**Priority**: High — differentiating feature for paid tier
**Effort**: Medium-Large

- **Approach for MVP**: Motion-based detection (frame differencing or device accelerometer)
  - Detect significant motion onset → start recording
  - Detect motion settling → stop recording
  - Pre-roll buffer (~2 seconds before trigger) to capture setup
  - Post-roll buffer (~3 seconds after settling) to capture follow-through
- Sensitivity threshold (adjustable in settings)
- Visual indicator when detection is active
- Works in conjunction with remote arm/disarm

**Explicitly NOT in MVP**: ML pose detection, skeleton tracking, or any model inference. That's Pro tier.

#### 6. First-Time Onboarding (GOL-29)
**Priority**: Medium — important for retention, not a technical blocker
**Effort**: Small

- 2-3 screen walkthrough explaining the two-device concept
- Visual diagrams: camera device placement, viewer device usage
- "Skip" option for returning users
- Show once per account (persisted flag)

#### 7. App Store Readiness (NEW)
**Priority**: Critical — can't ship without it
**Effort**: Medium

- App icon and splash screen (final designs)
- App Store screenshots (6.7", 6.5", 5.5" for iPhone; tablet optional)
- Play Store feature graphic + screenshots
- App Store description and keywords
- Privacy policy (hosted URL, linked in app and store listing)
- Terms of service
- Production EAS build profile (signing, versioning)
- Crash reporting integration (Sentry or Bugsnag)

---

## Deferred to Post-MVP

These are valuable but not required for a shippable v1.

| Feature | Issue | Rationale |
|---------|-------|-----------|
| Cloud storage | GOL-35 | Local storage is fine for v1. Cloud sync is a v1.x retention feature. |
| Share via link | GOL-36 | Requires cloud storage. Good growth feature for v1.x. |
| Session history (cross-device) | GOL-37 | Local session history ships with MVP. Cross-device sync needs cloud. |
| Usage analytics | GOL-38 | Important for business decisions but not user-facing. Add after launch. |
| Help/FAQ screens | GOL-33 | Onboarding covers the basics. Full help center is a polish item. |
| Landscape stream rotation | GOL-44 | Workaround: users hold camera in portrait. Fix post-launch. |
| Landscape UI refinements | GOL-31 | Layouts exist and work. Fine-tuning is post-launch polish. |

---

## Implementation Order

Dependencies drive the sequence. Each phase builds on the previous.

### Phase 1: Foundation — Auth & Accounts
> Unblocks everything else

1. Select BaaS (Firebase vs Supabase)
2. Implement auth (sign up, login, OAuth, password reset)
3. Account deletion flow
4. Authenticated signaling server
5. Auth-gated navigation (logged out → auth screens, logged in → home)

### Phase 2: Monetization — Subscriptions & Paywalls
> Unblocks feature gating

1. RevenueCat SDK integration
2. Configure subscription products (App Store Connect + Play Console)
3. Entitlement checking
4. Free tier enforcement (3 clip limit, feature gates)
5. Paywall UI (contextual upgrade prompts)
6. Restore purchases

### Phase 3: Session Management
> Depends on auth (sessions belong to a user)

1. Session data model and local persistence
2. Auto-create session on connection
3. Associate clips with sessions
4. Session list screen + session detail view
5. Session naming and metadata

### Phase 4: Recording Enhancements
> Independent of auth, but tier-gated

1. Remote arm/disarm via data channel (GOL-41)
2. Motion-based swing detection (GOL-40)
3. Pre/post-roll buffering
4. Sensitivity settings
5. Integration: arm → detect → record → sync flow

### Phase 5: Onboarding & Store Submission
> Do last — features need to be stable first

1. First-time onboarding flow
2. App icon, splash screen, store assets
3. Privacy policy and terms of service
4. Crash reporting (Sentry)
5. Production build configuration
6. Beta testing (TestFlight + internal Play Store track)
7. Store submission

---

## Open Decisions

These need resolution before or during implementation:

| Decision | Options | Recommendation |
|----------|---------|----------------|
| BaaS provider | Firebase / Supabase / Custom | Firebase — better RN support, built-in Apple/Google auth, established IAP validation patterns |
| IAP library | react-native-purchases (RevenueCat) / react-native-iap / Custom | RevenueCat — handles cross-platform billing, receipt validation, analytics out of the box |
| Subscription price | $8/mo / $10/mo / $8/mo + $60/yr | Start at $9.99/month, $59.99/year (annual discount drives LTV) |
| Swing detection approach | Frame differencing / Accelerometer / Audio | Accelerometer — simplest, works regardless of camera angle, lowest battery impact |
| Local database for sessions | AsyncStorage / SQLite (expo-sqlite) / MMKV | SQLite — structured queries for session/clip relationships, scales better than AsyncStorage |
| Crash reporting | Sentry / Bugsnag / Firebase Crashlytics | Sentry if standalone, Crashlytics if already on Firebase |

---

## Success Criteria

MVP is shippable when:

- [ ] New user can sign up, log in, and recover password
- [ ] Free user can stream and record up to 3 clips
- [ ] Free user sees upgrade prompt when hitting clip limit
- [ ] Paid user has unlimited clips, annotations, sessions, auto-detection
- [ ] Subscription purchase works on both iOS and Android
- [ ] Sessions are created automatically and clips are grouped correctly
- [ ] Viewer can remotely arm/disarm recording on camera
- [ ] Motion-based auto-detection captures swings with pre/post-roll
- [ ] First-time user understands the two-device concept from onboarding
- [ ] App passes App Store and Play Store review
- [ ] Crash reporting is active and collecting data
- [ ] Privacy policy and terms of service are published
