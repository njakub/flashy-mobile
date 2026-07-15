# flashy-api: Social auth + account deletion contract

Status: **implemented** in flashy-api (2026-07-15) — `POST /auth/google`
already existed for the web app; `POST /auth/apple` and
`DELETE /auth/account` were added (src/auth/apple.util.ts, auth.service.ts),
with a `add_apple_auth` migration (User.appleId, User.appleRefreshToken).
Deploy flashy-api and run migrations before shipping the mobile build.

All three mint/consume the same `AuthTokens` shape as the existing
email/password flow:

```json
{ "accessToken": "<jwt>", "refreshToken": "<opaque>", "user": { "id": "…", "email": "…" } }
```

Errors: non-2xx with `{ "message": "human-readable reason" }` (matches the
client's `postJson` parsing).

## Schema (as implemented)

flashy-api already had nullable `passwordHash` and `googleId` on User; the
Apple migration adds `appleId` (unique) and `appleRefreshToken` — provider
ids live as columns on User rather than a separate identities table.

Account linking rule (both endpoints): match provider id first; else match
an existing account by **verified** email and link; else create a new user.

## POST /auth/apple

Body: `{ "identityToken": string, "authorizationCode"?: string, "fullName"?: { "givenName"?: string, "familyName"?: string } }`

Verification of `identityToken` (an RS256 JWT):
1. Signature against Apple JWKS: `https://appleid.apple.com/auth/keys` (cache keys).
2. `iss === "https://appleid.apple.com"`.
3. `aud === "com.flashy.mobile"` (the app's bundle id).
4. `exp` in the future.

Identity claims: `sub` (stable per-user id — the linking key), `email`,
`email_verified` (may be a private-relay address; treat as verified when the
claim says so). `fullName` arrives **only on the user's first authorization**
— store it if present; Apple never sends it again.

`authorizationCode` (when present) is exchanged server-side for an Apple
refresh token — stored on the user solely so account deletion can revoke
Apple's grant. The exchange needs an Apple client secret and is skipped
unless these env vars are set on flashy-api:

- `APPLE_TEAM_ID` — Apple Developer team id
- `APPLE_KEY_ID` — key id of a "Sign in with Apple" key (developer portal)
- `APPLE_PRIVATE_KEY` — that key's .p8 contents (PKCS#8 PEM; literal \n
  escapes allowed for single-line env storage)
- `APPLE_BUNDLE_ID` — optional, defaults to `com.flashy.mobile`

## POST /auth/google

Body: `{ "idToken": string }`

Verification (use `google-auth-library`'s `verifyIdToken` or JWKS manually):
1. Signature against Google's JWKS.
2. `aud === <GOOGLE_WEB_CLIENT_ID>` (the *web* OAuth client id — the same one
   the app passes to `GoogleSignin.configure({ webClientId })`).
3. `iss ∈ { "accounts.google.com", "https://accounts.google.com" }`.
4. Require `email_verified === true`.

Identity claims: `sub` (linking key), `email`, `name`.

## DELETE /auth/account

Header: `Authorization: Bearer <accessToken>` → `204 No Content`.

1. Delete the user row and ALL owned rows (decks, cards, test_runs,
   test_run_questions, provider identities).
2. Revoke every refresh token for the user.
3. If an Apple identity is linked: revoke Apple tokens via
   `POST https://appleid.apple.com/auth/revoke` — Apple requires this
   alongside the in-app deletion mandated by App Store Guideline 5.1.1(v).

Client behavior after 204 (already implemented): signs out locally, re-owns
local rows to the local user, resets the sync cursor.

## Google Cloud console prerequisites

Three OAuth 2.0 client IDs in one project:
- **Web** — its client id is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the app
  AND the `aud` flashy-api asserts.
- **iOS** — bundle id `com.flashy.mobile`; its client id is
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and its reversed form must replace the
  `REPLACE_WITH_IOS_CLIENT_ID` placeholder in app.json's
  `@react-native-google-signin/google-signin` plugin `iosUrlScheme`.
- **Android** — package `com.flashy.mobile` + SHA-1s (release cert from
  `eas credentials`, plus debug cert for dev builds). No client id needed in
  the app for Android; the console entry itself is the requirement.

Apple prerequisites: "Sign in with Apple" capability on the App ID
(`eas credentials` syncs the entitlement added by the
`expo-apple-authentication` config plugin).
