import React from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

/**
 * Sync-status dot + profile icon button — mobile's replacement for the
 * web's AuthBar (see docs/plans/flashy-mobile.md DeckList row), mounted as
 * the home screen's header right slot instead of a full-width top bar.
 */
export function SyncStatusHeader() {
  const { colors, space } = useTheme();
  const { status, syncing, syncError } = useAuth();
  const router = useRouter();

  const dotColor =
    status !== "signedIn"
      ? colors.text3
      : syncError
        ? colors.incorrect
        : syncing
          ? colors.selfGrade
          : colors.correct;

  return (
    <Pressable
      onPress={() => router.push(status === "signedIn" ? "/profile" : "/login")}
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: dotColor,
        }}
      />
      <Text style={{ color: colors.text2, fontSize: 20 }}>👤</Text>
    </Pressable>
  );
}
