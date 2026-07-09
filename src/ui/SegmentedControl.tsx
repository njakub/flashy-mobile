import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Outer container bg2 + line border, radius `segment` (13), inner flex-1
 * segments radius `control`; active = accent bg + onAccent (or bg3 + text1),
 * inactive text2.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const { colors, space, radius, type, textStyle, onAccent } = useTheme();

  return (
    <View
      style={[
        styles.outer,
        {
          backgroundColor: colors.bg2,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.segment,
          padding: 3,
        },
      ]}
    >
      {segments.map((seg) => {
        const active = seg.value === value;
        return (
          <Pressable
            key={seg.value}
            onPress={() => onChange(seg.value)}
            style={[
              styles.segment,
              {
                backgroundColor: active ? colors.accent : "transparent",
                borderRadius: radius.control,
                paddingVertical: space.sm,
              },
            ]}
          >
            <Text
              style={[
                textStyle(type.button),
                { color: active ? onAccent : colors.text2, textAlign: "center" },
              ]}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
