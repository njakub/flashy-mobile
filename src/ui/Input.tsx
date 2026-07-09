import React, { useState } from "react";
import { TextInput, type TextInputProps } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

/** bg2, line2 border (accent when focused), radius `control`, type `input` (16/400). */
export function Input({ style, onFocus, onBlur, multiline, ...rest }: TextInputProps) {
  const { colors, space, radius, type, textStyle } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      placeholderTextColor={colors.text3}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : undefined}
      style={[
        textStyle(type.input),
        {
          backgroundColor: colors.bg2,
          borderWidth: 1,
          borderColor: focused ? colors.accent : colors.line2,
          borderRadius: radius.control,
          paddingVertical: space.md,
          paddingHorizontal: space.lg,
          color: colors.text1,
        },
        multiline && { minHeight: 96 },
        style,
      ]}
      {...rest}
    />
  );
}
