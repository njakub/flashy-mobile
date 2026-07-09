/**
 * Mirrors flashy/src/lib/config.ts's API_BASE_URL pattern — mobile equivalent
 * reads EXPO_PUBLIC_API_URL instead of NEXT_PUBLIC_API_URL. Dev default is
 * localhost, but that only reaches flashy-api from an iOS simulator; the
 * Android emulator must use http://10.0.2.2:3001 and physical devices need
 * the Mac's LAN IP — set EXPO_PUBLIC_API_URL accordingly per platform (see
 * docs/plans/flashy-mobile.md "Backend API contract").
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
