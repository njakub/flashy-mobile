import { useEffect, useCallback } from "react";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import * as Sentry from "@sentry/react-native";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { RepositoryProvider } from "@/providers/RepositoryProvider";
import { FONTS_TO_LOAD } from "@/lib/fonts";

SplashScreen.preventAutoHideAsync();

// Inert until EXPO_PUBLIC_SENTRY_DSN is set (EAS env var / .env); disabled in
// dev either way. Source-map upload additionally needs SENTRY_AUTH_TOKEN at
// build time — see the release runbook.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !__DEV__ && Boolean(SENTRY_DSN),
});

/**
 * Root error boundary — catches render/lifecycle errors from any route so a
 * failure shows a recoverable screen instead of a white screen or crash.
 * Rendered by expo-router in place of the layout, so no ThemeProvider is
 * available here; colors are hardcoded to the splash palette (app.json).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    // The boundary stops propagation, so Sentry.wrap never sees this error —
    // report it explicitly.
    Sentry.captureException(error);
  }, [error]);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0f1218",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 12,
      }}
    >
      <Text style={{ color: "#f2f4f8", fontSize: 18, fontWeight: "600" }}>
        Something went wrong
      </Text>
      <Text style={{ color: "#9aa3b2", textAlign: "center" }}>{error.message}</Text>
      <Pressable
        onPress={retry}
        style={{
          marginTop: 12,
          paddingHorizontal: 20,
          paddingVertical: 10,
          borderRadius: 10,
          backgroundColor: "#2b3242",
        }}
      >
        <Text style={{ color: "#f2f4f8", fontWeight: "600" }}>Try again</Text>
      </Pressable>
    </View>
  );
}

function RootStack() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg0 }} onLayout={() => {}}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg0 },
          headerTintColor: colors.text1,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg0 },
        }}
      />
    </View>
  );
}

export default Sentry.wrap(function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS_TO_LOAD);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider>
          <AuthProvider>
            <RepositoryProvider>
              <RootStack />
            </RepositoryProvider>
          </AuthProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
});
