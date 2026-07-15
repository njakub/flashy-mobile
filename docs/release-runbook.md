# Release runbook — App Store & Play Store

## 0. Values you must fill in before any release build

| Where | Placeholder | Replace with |
|---|---|---|
| `eas.json` (`preview` + `production` env) | `https://REPLACE_WITH_PRODUCTION_API_URL` | the deployed flashy-api https URL. A release build **throws at startup** until this is a real https URL (guard in `src/lib/config.ts`). |
| `app.json` google-signin plugin | `com.googleusercontent.apps.REPLACE_WITH_IOS_CLIENT_ID` | reversed iOS OAuth client id (see `docs/social-auth-api.md`). |
| EAS env vars | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google OAuth client ids. The Google button stays hidden until the web id is set, so this can trail the first release. |
| EAS env vars | `EXPO_PUBLIC_SENTRY_DSN` | Sentry project DSN (crash reporting is disabled without it). |
| EAS secret | `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`, `SENTRY_PROJECT`) | for source-map upload during EAS builds. |

Backend prerequisite: flashy-api must implement `POST /auth/apple`,
`POST /auth/google`, `DELETE /auth/account` per `docs/social-auth-api.md`
before the social buttons / account deletion work end-to-end.

## 1. Versioning & OTA rules

- `runtimeVersion.policy: "appVersion"` — **any change to native modules or
  config plugins requires bumping `expo.version`** (already bumped to 1.1.0
  for Sentry + Apple/Google sign-in) and shipping a new binary. `eas update`
  only reaches binaries whose version matches, which is exactly what
  prevents the fatal stale-binary/OTA mismatch class of crash.
- Build numbers are managed remotely (`appVersionSource: remote`,
  `autoIncrement` on production).
- After every `eas update`, upload source maps:
  `npx sentry-expo-upload-sourcemaps dist`.

## 2. Pre-flight (every release)

```
npm run typecheck && npm test && npx eslint . && npx expo-doctor
```

Manual device pass (dev client must be REBUILT after this branch — new
native modules):
1. Empty deck → Test → shows "No cards in this deck yet.", no crash.
2. 5+ card deck → run a quiz → local grading works; airplane mode → grading
   degrades to self-grade, no crash.
3. DeckDetail → Import → paste TSV rows and pick a CSV → preview → import.
4. Sign in (password / Apple / Google) → local decks appear on the server;
   edit a card on another device → it appears on the phone without
   navigating (sync refresh).
5. Profile → Delete account → returns to a working offline app.

## 3. Store accounts & metadata (one-time)

- Apple Developer Program + Play Console accounts; app records for
  `com.flashy.mobile`.
- Sign in with Apple capability on the App ID (`eas credentials` syncs the
  entitlement).
- Screenshots: 6.7" + 6.1" iPhone, phone + 7" tablet Android (DeckList,
  Test session, stats).
- Privacy policy URL — required (accounts + email).
- Apple privacy nutrition labels / Play Data Safety: collects email
  (account), user content (flashcards, synced to flashy-api), crash
  diagnostics (Sentry). Encryption: exempt (`usesNonExemptEncryption: false`
  already set).
- App Review notes: include a test account AND state that the app is fully
  usable offline (reviewer may test without signing in). Account deletion is
  in Profile → Delete account (Guideline 5.1.1(v)).

## 4. Build → test → submit

```
eas build --profile preview --platform all      # internal smoke test
eas build --profile production --platform all
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

Distribute production builds to TestFlight + Play internal testing first;
verify the API URL, Sentry test event, and a sync round trip before
promoting. Tag the git release and note the runtime version afterward.
