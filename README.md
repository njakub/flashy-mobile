# Flashy Mobile

React Native + Expo companion app for [Flashy](../flashy) (Next.js web) and [flashy-api](../flashy-api) (NestJS backend). Local-first spaced-repetition flashcards with on-device grading; signing in adds cross-device sync against the same `flashy-api` the web app uses.

See `docs/plans/flashy-mobile.md` in the `flashy` repo for the full implementation spec this app was built from.

## Requirements

- Node.js, Xcode + Command Line Tools (iOS) and/or Android Studio + an emulator (Android)
- CocoaPods (`sudo gem install cocoapods`) for iOS
- `flashy-api` running locally if you want sync/auth/AI-grading to work — see that repo's own README

This app uses native modules (`onnxruntime-react-native`, `expo-sqlite`, etc.), so it needs a **dev client build** — Expo Go cannot load it.

## Setup

```bash
npm install
cp .env.example .env   # then edit EXPO_PUBLIC_API_URL — see below
npx expo prebuild      # generates ios/ and android/ (gitignored)
```

## Running

```bash
npm run ios        # build + run the iOS dev client (needs a Mac + Xcode)
npm run android     # build + run the Android dev client (needs Android Studio/SDK)
npm start           # start Metro once a dev client is already installed on the device/simulator
```

## Backend API URL

`EXPO_PUBLIC_API_URL` (read in `src/lib/config.ts`) must point at a reachable `flashy-api`. "Reachable" means something different per platform, since `localhost` means different things depending on where the code is actually running:

| Target | `EXPO_PUBLIC_API_URL` |
|---|---|
| iOS simulator | `http://localhost:3001` (simulator shares the Mac's network stack) |
| Android emulator | `http://10.0.2.2:3001` (the emulator's special alias for the host machine — `localhost` inside the emulator means the emulator itself) |
| Physical device (either platform) | `http://<your-mac's-LAN-IP>:3001` — device and Mac must be on the same Wi-Fi; find your IP with `ipconfig getifaddr en0` |

Set it in `.env` (copy `.env.example`) for local dev. `EXPO_PUBLIC_*` vars are inlined at build time, so change it and restart Metro (`npm start -- -c` to clear the cache if it doesn't pick up).

## Testing

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm test            # jest — pure-logic unit tests (scheduler, sync conflict resolution, grading, tokenizer)
```

`expo-sqlite` and `onnxruntime-react-native` are native modules with no Node/web build, so the SQLite repositories and the on-device embedding pipeline aren't covered by `jest` — they need a real device/simulator run. The sync engine's conflict-resolution logic (the trickiest part) *is* fully unit-tested, via the pure functions in `src/lib/sync/merge.ts`.

## Building for release (EAS)

```bash
npx eas build --profile development --platform ios      # dev client build
npx eas build --profile preview --platform android       # internal APK for testers
npx eas build --profile production --platform all        # store builds
```

`eas.json`'s `production`/`preview` profiles don't hardcode an API URL — set `EXPO_PUBLIC_API_URL` for your deployed `flashy-api` as an EAS secret or in the profile's `env` block before building for anything other than local dev.

## Hand-mirrored files

These must be kept in step with the web app (`../flashy`) by hand:

- `src/lib/sync/wire.ts` — the `POST /sync` wire protocol (also mirrored in `flashy-api/src/sync/`).
- `src/lib/decks/tree.ts` — pure deck-hierarchy helpers for nested decks (`Deck.parentId`): tree building, subtree ids, breadcrumbs, cycle checks. Mirrors `flashy/src/lib/decks/tree.ts`.

## Known v1 scope cuts

Carried over from `docs/plans/flashy-mobile.md`: no AI card generation, no voice input/TTS, no usage dashboard, no import/export UI, no per-deck grading-threshold overrides, no AI-grading auto-cascade (the "Let AI grade" button in Test mode's ambiguous band is a manual escalation only). All have existing seams in the web app's code if/when they're wanted here.
