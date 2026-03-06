# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Expo Router screens and navigation layout.
- `src/`: Core app logic (hooks, services, utils, types).
- `components/`: Reusable UI components and test fixtures.
- `assets/`: Static images, fonts, and media.
- `modules/`: Native module bridges and platform-specific code.
- `server/`: Standalone WebRTC signaling server (Node/TypeScript).
- `scripts/`: Local build/install helpers for devices.
- `docs/`, `app.config.ts`, `eas.json`, `vitest.config.ts`: Documentation and build config.

## Build, Test, and Development Commands
App (repo root):
- `npm run dev`: Start Metro with dev client.
- `npm start`: Start Expo (default dev server).
- `npm run ios` / `npm run android` / `npm run web`: Platform launchers.
- `npm run typecheck`: TypeScript type checks.
- `npm test`: Run Vitest once.
- `npm run test:watch`: Run Vitest in watch mode.
- `npm run build:android` / `npm run build:ios`: EAS development builds (cloud).
- `npm run build:local:android` / `npm run build:local:ios`: Local builds via `scripts/`.

Signaling server (`server/`):
- `npm run dev`: Run with `ts-node`.
- `npm run build`: Compile to `dist/`.
- `npm run start`: Run compiled server.
- `npm run fly:deploy`: Deploy to Fly.io.

## Coding Style & Naming Conventions
- TypeScript/React Native with 2-space indentation and single quotes.
- Favor existing patterns: kebab-case filenames (e.g., `use-webrtc-connection.ts`).
- Hooks: `use-*.ts`. Components: `*.tsx`. Tests: `*.test.ts`.
- Use the path alias `@/` (configured in `tsconfig.json`) for root imports.
- No repo-wide lint/format script is defined; match nearby file style.

## Testing Guidelines
- Framework: Vitest (`vitest.config.ts`).
- Locations: `src/**/test/*.test.ts` and `components/__tests__/`.
- Run with `npm test` or `npm run test:watch`.
- No explicit coverage threshold; add tests for new logic or bug fixes.

## Commit & Pull Request Guidelines
- Commit messages are sentence case and often include the issue key in parentheses. Example: `Fix Android camera preview rotation (GOL-44)`.
- PRs should include a concise summary, testing notes (`npm run typecheck`, `npm test`, device/platform), and screenshots or recordings for UI changes (camera/viewer flows).

## Configuration Notes
- `app.config.ts` contains dynamic Expo config; keep plugin changes in sync.
- `patch-package` runs on `postinstall`; if a dependency is patched, include a note in the PR.
