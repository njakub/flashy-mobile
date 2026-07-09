import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "correctSoft"
  | "incorrectSoft"
  | "selfGradeSoft";

interface ButtonProps extends Omit<PressableProps, "style"> {
  variant?: ButtonVariant;
  label: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * variants: primary (accent bg, onAccent text), secondary (bg2 + line2
 * border, text2), ghost, danger (incorrect), plus soft semantic variants for
 * rating buttons (correctSoft/incorrectSoft/selfGradeSoft backgrounds with
 * matching text color). Radius `control` (14), type `button` (15/600).
 * Pressable with a pressed-state background step.
 */
export function Button({
  variant = "primary",
  label,
  loading,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { colors, space, radius, type, onAccent, textStyle } = useTheme();

  const variantStyle: Record<
    ButtonVariant,
    { bg: string; text: string; border?: string }
  > = {
    primary: { bg: colors.accent, text: onAccent },
    secondary: { bg: colors.bg2, text: colors.text2, border: colors.line2 },
    ghost: { bg: "transparent", text: colors.text2 },
    danger: { bg: colors.incorrect, text: onAccent },
    correctSoft: { bg: colors.correctSoft, text: colors.correct },
    incorrectSoft: { bg: colors.incorrectSoft, text: colors.incorrect },
    selfGradeSoft: { bg: colors.selfGradeSoft, text: colors.selfGrade },
  };

  const { bg, text, border } = variantStyle[variant];

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderRadius: radius.control,
          paddingVertical: space.md,
          paddingHorizontal: space.xl,
          borderWidth: border ? 1 : 0,
          borderColor: border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={text} />
      ) : (
        <Text style={[textStyle(type.button), { color: text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
});
