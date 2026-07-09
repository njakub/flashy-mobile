import React from "react";
import { ScrollView, StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/providers/ThemeProvider";

interface ScreenProps extends ViewProps {
  scroll?: boolean;
  children: React.ReactNode;
}

/**
 * SafeAreaView, bg0, vertically scrolling centered column (~560 max width;
 * full-width with `lg` padding on phones).
 */
export function Screen({ scroll = true, children, style, ...rest }: ScreenProps) {
  const { colors, space } = useTheme();
  const Container = scroll ? ScrollView : View;
  const containerProps = scroll
    ? { contentContainerStyle: [styles.content, { padding: space.lg }] }
    : { style: [styles.content, { padding: space.lg, flex: 1 }] };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg0 }]}>
      <Container {...containerProps}>
        <View style={[styles.inner, !scroll && styles.innerFlex, style]} {...rest}>
          {children}
        </View>
      </Container>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: "center",
  },
  inner: {
    width: "100%",
    maxWidth: 560,
  },
  innerFlex: {
    flex: 1,
  },
});
