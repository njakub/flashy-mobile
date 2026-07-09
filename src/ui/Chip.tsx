import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

export type ChipVariant = "accentSoft" | "incorrectSoft" | "correctSoft" | "selfGradeSoft" | "neutral";

interface ChipProps {
  label: string;
  variant?: ChipVariant;
  pill?: boolean;
}

/**
 * radius `chip` (8) or `pill`; type `micro` (12/500); accent-soft for
 * labels, incorrect-soft for the flagged chip.
 */
export function Chip({ label, variant = "accentSoft", pill }: ChipProps) {
  const { colors, space, radius, type, textStyle } = useTheme();

  const styleByVariant: Record<ChipVariant, { bg: string; text: string }> = {
    accentSoft: { bg: colors.accentSoft, text: colors.accentHi },
    incorrectSoft: { bg: colors.incorrectSoft, text: colors.incorrect },
    correctSoft: { bg: colors.correctSoft, text: colors.correct },
    selfGradeSoft: { bg: colors.selfGradeSoft, text: colors.selfGrade },
    neutral: { bg: colors.bg3, text: colors.text3 },
  };
  const { bg, text } = styleByVariant[variant];

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: bg,
          borderRadius: pill ? radius.pill : radius.chip,
          paddingVertical: space.xs,
          paddingHorizontal: space.sm,
        },
      ]}
    >
      <Text style={[textStyle(type.micro), { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
  },
});
