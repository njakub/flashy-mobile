import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import { Button } from "./Button";

interface InlineConfirmProps {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The web's no-modal confirmation pattern: content swaps in place for an
 * incorrectSoft-tinted panel with a confirm / cancel action.
 */
export function InlineConfirm({
  message,
  confirmLabel = "Yes, delete",
  onConfirm,
  onCancel,
}: InlineConfirmProps) {
  const { colors, space, radius, type, textStyle } = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.incorrectSoft,
          borderRadius: radius.control,
          padding: space.lg,
          gap: space.md,
        },
      ]}
    >
      <Text style={[textStyle(type.body), { color: colors.incorrect }]}>{message}</Text>
      <View style={styles.actions}>
        <Button variant="danger" label={confirmLabel} onPress={onConfirm} />
        <Button variant="ghost" label="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {},
  actions: {
    flexDirection: "row",
    gap: 8,
  },
});
