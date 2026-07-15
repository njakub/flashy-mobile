/**
 * Mirrors flashy/src/lib/config.ts's API_BASE_URL pattern — mobile equivalent
 * reads EXPO_PUBLIC_API_URL instead of NEXT_PUBLIC_API_URL. Dev default is
 * localhost, but that only reaches flashy-api from an iOS simulator; the
 * Android emulator must use http://10.0.2.2:3001 and physical devices need
 * the Mac's LAN IP — set EXPO_PUBLIC_API_URL accordingly per platform (see
 * docs/plans/flashy-mobile.md "Backend API contract").
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

// Fail fast at startup instead of shipping a build whose auth/sync/AI-grade
// silently point at localhost (the ?? default above) — every store build
// must carry a real https API URL via eas.json build env.
if (!__DEV__ && (!API_BASE_URL.startsWith("https://") || API_BASE_URL.includes("REPLACE_WITH"))) {
  throw new Error(
    `EXPO_PUBLIC_API_URL must be an https URL in release builds (got "${API_BASE_URL}") — set it in eas.json.`,
  );
}

/**
 * Google OAuth client ids (Google Cloud console). The WEB client id is what
 * the ID token's `aud` is minted for (and what flashy-api verifies); the iOS
 * client id must match the iosUrlScheme in app.json's google-signin plugin.
 * The Google button is hidden while the web client id is unset.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
