import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

interface CardProps {
  children: React.ReactNode;
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** bg1 (or bg2 when `raised`), 1px line border, radius `card` (20), padding `xxl`. */
export function Card({ children, raised, style }: CardProps) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: raised ? colors.bg2 : colors.bg1,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.card,
          padding: space.xxl,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
