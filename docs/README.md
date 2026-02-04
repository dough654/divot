# SwingLink Documentation

Technical documentation for SwingLink's architecture, design decisions, and subsystems.

## Architecture

| Document | Description |
|----------|-------------|
| [Annotation System](architecture/annotation-system.md) | Drawing tools, type system, component architecture, storage, and frame capture/export |
| [Auto-Reconnection](architecture/auto-reconnection.md) | ICE restart, signaling rejoin, backoff, recording/transfer awareness |

## Architecture Decision Records (ADRs)

| ADR | Status | Summary |
|-----|--------|---------|
| [001 - Android Frame Capture](adr/001-android-frame-capture.md) | Accepted | Why Android uses SVG `toDataURL` instead of `captureRef` for frame export |

## Adding Documentation

- **Architecture docs** go in `architecture/` and describe how a subsystem works end-to-end.
- **ADRs** go in `adr/` with sequential numbering (`002-short-title.md`). Use the format: Status, Context, Decision, Consequences.
- Keep docs close to the code they describe — link to source files with relative paths from the repo root.
