import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

interface StatTileProps {
  value: string;
  label: string;
  valueColor?: string;
}

/** bg1 row-radius tile: `statMono` value + `meta` label (due today / streak / accuracy). */
export function StatTile({ value, label, valueColor }: StatTileProps) {
  const { colors, space, radius, type, textStyle } = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.bg1,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.row,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
        },
      ]}
    >
      <Text style={[textStyle(type.statMono), { color: valueColor ?? colors.text1 }]}>{value}</Text>
      <Text style={[textStyle(type.meta), { color: colors.text2 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
});
