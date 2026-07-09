import React from "react";
import { View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

interface ProgressBarProps {
  progress: number; // 0..1
}

/** 4px accent fill on bg3 track, radius `pill`. */
export function ProgressBar({ progress }: ProgressBarProps) {
  const { colors, radius } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View
      style={{
        height: 4,
        width: "100%",
        backgroundColor: colors.bg3,
        borderRadius: radius.pill,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${clamped * 100}%`,
          backgroundColor: colors.accent,
          borderRadius: radius.pill,
        }}
      />
    </View>
  );
}
