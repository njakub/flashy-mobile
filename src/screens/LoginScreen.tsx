import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { Screen, Button, Input } from "@/ui";

type Mode = "login" | "register";

/**
 * Mirrors flashy/src/app/login/page.tsx — email/password only (no Google
 * sign-in in v1 mobile, see docs/plans/flashy-mobile.md "v1 scope cuts").
 */
export function LoginScreen() {
  const { colors, space, type, textStyle } = useTheme();
  const { login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        <Button
          label={mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
          variant="ghost"
          onPress={() => setMode(mode === "login" ? "register" : "login")}
        />
      </View>
    </Screen>
  );
}
