import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { AuthClient, type AuthTokens, type AuthUser } from "@/lib/auth/AuthClient";
import { tokenStore } from "@/lib/auth/tokenStore";
import { bootstrapLocalUserData, releaseUserDataToLocal } from "@/lib/auth/bootstrap";
import { SyncEngine, type SyncResult } from "@/lib/sync/SyncEngine";
import { onDirty } from "@/lib/sync/dirtyBus";
import { LOCAL_USER_ID } from "@/lib/constants";

const SYNC_INTERVAL_MS = 45_000;
const DIRTY_DEBOUNCE_MS = 2_000;

type AuthStatus = "loading" | "signedOut" | "signedIn";

interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Real user id once signed in, LOCAL_USER_ID otherwise — the seam every
   *  repository call sources ownerId from instead of a hardcoded constant. */
  ownerId: string;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  /** identityToken from expo-apple-authentication's native credential;
   *  fullName is only present on the user's first authorization;
   *  authorizationCode enables server-side Apple token revocation. */
  loginWithApple(
    identityToken: string,
    fullName?: { givenName?: string; familyName?: string },
    authorizationCode?: string,
  ): Promise<void>;
  /** idToken from @react-native-google-signin (minted for the web client). */
  loginWithGoogle(idToken: string): Promise<void>;
  logout(): Promise<void>;
  /** Deletes the server account + all server data (App Store 5.1.1(v)),
   *  then re-owns local rows to LOCAL_USER_ID so the app keeps working
   *  offline. */
  deleteAccount(): Promise<void>;
  lastSyncAt: string | null;
  syncError: string | null;
  syncing: boolean;
  /** Resolves the current access token, refreshing it first if needed.
   *  Returns null if there's no signed-in session. Used by LlmGrader to
   *  call the guarded POST /grade endpoint, same pattern as SyncEngine. */
  getAccessToken(): Promise<string | null>;
  /** Triggers an immediate sync round trip — used by the Profile screen's
   *  "Sync now" button. No-op while signed out. */
  syncNow(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Manual base64url decode — RN's JS engine doesn't reliably expose a
 * global atob/btoa, so this doesn't depend on one. */
function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let buffer = 0;
  let bits = 0;
  for (const char of padded) {
    if (char === "=") break;
    const value = chars.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return result;
}

function decodeJwtExpMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isExpiringSoon(token: string): boolean {
  const expMs = decodeJwtExpMs(token);
  if (expMs === null) return true;
  return expMs - Date.now() < 60_000; // refresh if <60s left
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Sync loop and getAccessToken both run outside the React render cycle
  // (interval callback), so they read the latest session via a ref rather
  // than closing over stale state.
  const sessionRef = useRef<Session | null>(null);

  const applySession = useCallback(async (session: Session) => {
    sessionRef.current = session;
    await tokenStore.set(session.refreshToken);
    setUser(session.user);
    setStatus("signedIn");
  }, []);

  const clearSession = useCallback(() => {
    sessionRef.current = null;
    void tokenStore.clear();
    setUser(null);
    setStatus("signedOut");
  }, []);

  // Dedups concurrent refresh() calls (sync tick + LlmGrader request could
  // both find an expiring token at once) so a rotated refresh token is never
  // burned twice — the second caller awaits the first's in-flight refresh
  // instead of firing its own.
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);

  async function getAccessToken(): Promise<string | null> {
    const session = sessionRef.current;
    if (session && !isExpiringSoon(session.accessToken)) {
      return session.accessToken;
    }
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const promise = (async () => {
      const storedRefreshToken = session?.refreshToken ?? (await tokenStore.get());
      if (!storedRefreshToken) return null;
      try {
        const tokens = await AuthClient.refresh(storedRefreshToken);
        await applySession(tokens);
        return tokens.accessToken;
      } catch {
        clearSession();
        return null;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();
    refreshPromiseRef.current = promise;
    return promise;
  }

  const syncEngineRef = useRef<SyncEngine | null>(null);

  // The 45s interval, the post-write debounce, and sign-in/foreground
  // triggers can all fire close together; without this guard two syncOnce()
  // calls could run concurrently and apply their pulls out of order,
  // interleaving the sync_state cursor writes. Every trigger below awaits
  // this single in-flight promise instead of starting a second round trip.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const runSync = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;
    if (!sessionRef.current) return Promise.resolve();
    if (!syncEngineRef.current) {
      syncEngineRef.current = new SyncEngine(getAccessToken);
    }
    setSyncing(true);
    const promise = syncEngineRef.current
      .syncOnce()
      .then((result: SyncResult | null) => {
        if (result) {
          setLastSyncAt(new Date().toISOString());
          setSyncError(null);
        }
      })
      .catch((err: unknown) => {
        setSyncError(err instanceof Error ? err.message : "Sync failed");
      })
      .finally(() => {
        setSyncing(false);
        inFlightRef.current = null;
      });
    inFlightRef.current = promise;
    return promise;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cold start: restore session from the stored refresh token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await tokenStore.get();
      if (!stored) {
        if (!cancelled) setStatus("signedOut");
        return;
      }
      try {
        const tokens = await AuthClient.refresh(stored);
        if (cancelled) return;
        await applySession(tokens);
        await bootstrapLocalUserData(tokens.user.id);
      } catch {
        if (!cancelled) clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync on sign-in, then periodically while the app is foregrounded and
  // signed in. Also resync on AppState -> "active" (device just woke up /
  // app just resumed) rather than waiting up to SYNC_INTERVAL_MS.
  useEffect(() => {
    if (status !== "signedIn") return;
    void Promise.resolve().then(() => runSync());
    let interval: ReturnType<typeof setInterval> | undefined;
    const startInterval = () => {
      if (interval) return;
      interval = setInterval(() => void runSync(), SYNC_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (interval) clearInterval(interval);
      interval = undefined;
    };
    startInterval();

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === "active") {
        void runSync();
        startInterval();
      } else {
        stopInterval();
      }
    };
    const appStateSub = AppState.addEventListener("change", onAppStateChange);

    const netInfoUnsub = NetInfo.addEventListener((netState) => {
      if (netState.isConnected) void runSync();
    });

    return () => {
      stopInterval();
      appStateSub.remove();
      netInfoUnsub();
    };
  }, [status, runSync]);

  // Sync shortly after any local write, debounced.
  useEffect(() => {
    if (status !== "signedIn") return;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onDirty(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void runSync(), DIRTY_DEBOUNCE_MS);
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [status, runSync]);

  // Shared post-login tail for every sign-in flavor (password, Apple,
  // Google): persist the session, then re-own any pre-sign-in local data.
  const completeSignIn = useCallback(
    async (tokens: AuthTokens) => {
      await applySession(tokens);
      await bootstrapLocalUserData(tokens.user.id);
    },
    [applySession],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      await completeSignIn(await AuthClient.login(email, password));
    },
    [completeSignIn],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await completeSignIn(await AuthClient.register(email, password));
    },
    [completeSignIn],
  );

  const loginWithApple = useCallback(
    async (
      identityToken: string,
      fullName?: { givenName?: string; familyName?: string },
      authorizationCode?: string,
    ) => {
      await completeSignIn(
        await AuthClient.loginWithApple(identityToken, fullName, authorizationCode),
      );
    },
    [completeSignIn],
  );

  const loginWithGoogle = useCallback(
    async (idToken: string) => {
      await completeSignIn(await AuthClient.loginWithGoogle(idToken));
    },
    [completeSignIn],
  );

  const logout = useCallback(async () => {
    const session = sessionRef.current;
    if (session) {
      await AuthClient.logout(session.refreshToken).catch(() => {});
    }
    clearSession();
  }, [clearSession]);

  const deleteAccount = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    const token = await getAccessToken();
    if (!userId || !token) throw new Error("Not signed in.");
    await AuthClient.deleteAccount(token);
    clearSession();
    // Keep the data usable offline under the local owner; also resets the
    // sync cursor so a future account starts a clean pull.
    await releaseUserDataToLocal(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSession]);

  const value: AuthContextValue = {
    status,
    user,
    ownerId: user?.id ?? LOCAL_USER_ID,
    login,
    register,
    loginWithApple,
    loginWithGoogle,
    logout,
    deleteAccount,
    lastSyncAt,
    syncError,
    syncing,
    getAccessToken,
    syncNow: runSync,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
