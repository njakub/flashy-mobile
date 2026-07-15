import React, { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as AppleAuthentication from "expo-apple-authentication";
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "@/lib/config";
import { Screen, Button, Input } from "@/ui";

type Mode = "login" | "register";

// The web client id is the `aud` flashy-api verifies; without it Google
// sign-in can't work, so the button is hidden entirely (e.g. local dev
// before OAuth clients exist).
const googleEnabled = Boolean(GOOGLE_WEB_CLIENT_ID);
if (googleEnabled) {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
}

/**
 * Email/password (mirrors flashy/src/app/login/page.tsx) plus native Apple
 * (iOS only) and Google sign-in. Both social flows hand a provider token to
 * flashy-api, which mints the same JWT pair as the password flow — see
 * docs/social-auth-api.md.
 */
export function LoginScreen() {
  const { colors, space, type, textStyle } = useTheme();
  const { login, register, loginWithApple, loginWithGoogle } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let cancelled = false;
    AppleAuthentication.isAvailableAsync().then((available) => {
      if (!cancelled) setAppleAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApple() {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        setError("Apple sign-in did not return a token.");
        return;
      }
      setSubmitting(true);
      await loginWithApple(
        credential.identityToken,
        {
          givenName: credential.fullName?.givenName ?? undefined,
          familyName: credential.fullName?.familyName ?? undefined,
        },
        credential.authorizationCode ?? undefined,
      );
      router.replace("/");
    } catch (err) {
      // User dismissed the native sheet — not an error.
      if (isErrorWithCode(err) && err.code === "ERR_REQUEST_CANCELED") return;
      setError(err instanceof Error ? err.message : "Apple sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return; // cancelled
      const idToken = response.data.idToken;
      if (!idToken) {
        setError("Google sign-in did not return a token.");
        return;
      }
      setSubmitting(true);
      await loginWithGoogle(idToken);
      router.replace("/");
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return;
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: space.lg }}>
        <View>
          <Text style={[textStyle(type.display), { color: colors.text1 }]}>
            {mode === "login" ? "Sign in" : "Create account"}
          </Text>
          <Text style={[textStyle(type.meta), { color: colors.text3, marginTop: space.xs }]}>
            {mode === "login"
              ? "Sync your decks across devices."
              : "Your existing local decks will move with you."}
          </Text>
        </View>

        <View style={{ gap: space.sm }}>
          <Input
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min 8 characters)"
            secureTextEntry
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {error && (
            <Text style={[textStyle(type.meta), { color: colors.incorrect }]}>{error}</Text>
          )}
          <Button
            label={mode === "login" ? "Sign in" : "Create account"}
            onPress={handleSubmit}
            disabled={submitting || !email.trim() || password.length < 8}
            loading={submitting}
          />
        </View>

        {(appleAvailable || googleEnabled) && (
          <View style={{ gap: space.sm }}>
            <Text style={[textStyle(type.micro), { color: colors.text3, textAlign: "center" }]}>
              OR
            </Text>
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={10}
                style={{ height: 44 }}
                onPress={handleApple}
              />
            )}
            {googleEnabled && (
              <Button label="Continue with Google" variant="secondary" onPress={handleGoogle} />
            )}
          </View>
        )}

        <Button
          label={mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
          variant="ghost"
          onPress={() => setMode(mode === "login" ? "register" : "login")}
        />
      </View>
    </Screen>
  );
}
