import * as SecureStore from "expo-secure-store";

/**
 * Refresh-token persistence — mobile equivalent of the web's
 * localStorage.setItem(REFRESH_TOKEN_KEY, ...) in AuthProvider.tsx. The
 * access token is never persisted here (module-level memory only in
 * AuthProvider, same split as web).
 */
const REFRESH_TOKEN_KEY = "flashy_refresh_token";

export const tokenStore = {
  async get(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async set(token: string): Promise<void> {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
