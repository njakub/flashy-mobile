import { useEffect, useCallback } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";
import { AuthProvider } from "@/providers/AuthProvider";
import { RepositoryProvider } from "@/providers/RepositoryProvider";
import { FONTS_TO_LOAD } from "@/lib/fonts";

SplashScreen.preventAutoHideAsync();

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

export default function RootLayout() {
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
}
