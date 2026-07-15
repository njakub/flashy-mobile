/**
 * Mirrors flashy/src/lib/auth/AuthClient.ts verbatim — plain fetch, works
 * unchanged in React Native.
 */
import { API_BASE_URL } from "@/lib/config";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === "string") message = parsed.message;
    } catch {
      // not JSON — use raw text
    }
    throw new Error(message || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Thin wrapper over flashy-api's /auth/* endpoints. The social endpoints'
 * request/response contracts are specced in docs/social-auth-api.md. */
export const AuthClient = {
  register(email: string, password: string): Promise<AuthTokens> {
    return postJson<AuthTokens>("/auth/register", { email, password });
  },
  login(email: string, password: string): Promise<AuthTokens> {
    return postJson<AuthTokens>("/auth/login", { email, password });
  },
  /** identityToken: Apple's JWT from the native credential. fullName only
   * arrives on the user's FIRST authorization — send it when present so the
   * server can store it; it is never available again. authorizationCode
   * lets the server obtain a revocable Apple token (used by account
   * deletion). */
  loginWithApple(
    identityToken: string,
    fullName?: { givenName?: string; familyName?: string },
    authorizationCode?: string,
  ): Promise<AuthTokens> {
    return postJson<AuthTokens>("/auth/apple", {
      identityToken,
      fullName,
      authorizationCode,
    });
  },
  /** idToken: the Google ID token minted against the web client id. */
  loginWithGoogle(idToken: string): Promise<AuthTokens> {
    return postJson<AuthTokens>("/auth/google", { idToken });
  },
  refresh(refreshToken: string): Promise<AuthTokens> {
    return postJson<AuthTokens>("/auth/refresh", { refreshToken });
  },
  async logout(refreshToken: string): Promise<void> {
    await postJson("/auth/logout", { refreshToken });
  },
  /** Deletes the account and all server-side data (App Store 5.1.1(v)). */
  async deleteAccount(accessToken: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/auth/account`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Account deletion failed: ${res.status}`);
    }
  },
};
