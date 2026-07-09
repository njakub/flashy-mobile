import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import type { TextStyle } from "react-native";
import {
  theme,
  fontWeight,
  type ThemeColors,
  type Theme,
} from "@/lib/theme";

/**
 * Maps a token weight (400/500/600/700) to the loaded RN font-family variant
 * name for a given family — RN selects weights by family name, not a
 * fontWeight style prop, once custom fonts are loaded via useFonts.
 */
const FONT_FAMILY_BY_WEIGHT: Record<
  "ui" | "mono",
  Record<number, string>
> = {
  ui: {
    [fontWeight.regular]: "HankenGrotesk_400Regular",
    [fontWeight.medium]: "HankenGrotesk_500Medium",
    [fontWeight.semibold]: "HankenGrotesk_600SemiBold",
    [fontWeight.bold]: "HankenGrotesk_700Bold",
  },
  mono: {
    [fontWeight.regular]: "IBMPlexMono_400Regular",
    [fontWeight.medium]: "IBMPlexMono_500Medium",
    [fontWeight.semibold]: "IBMPlexMono_600SemiBold",
    [fontWeight.bold]: "IBMPlexMono_700Bold",
  },
};

type TypeToken = (typeof theme.type)[keyof typeof theme.type];

/**
 * Converts a theme type-scale token into an RN TextStyle. RN needs points
 * (not unitless multipliers) for lineHeight, and letterSpacing in points
 * (not em) — theme.ts stores both as unitless/em to match the web's CSS,
 * so this is the one place that does the conversion.
 */
function textStyle(t: TypeToken): TextStyle {
  const family = t.fontFamily === theme.fontFamily.mono ? "mono" : "ui";
  return {
    fontFamily: FONT_FAMILY_BY_WEIGHT[family][t.weight] ?? undefined,
    fontSize: t.size,
    lineHeight: t.size * t.lineHeight,
    letterSpacing: t.size * t.letterSpacing,
  };
}

type ColorPalette = Record<keyof ThemeColors, string>;

interface ThemeContextValue {
  colors: ColorPalette;
  space: Theme["space"];
  radius: Theme["radius"];
  type: Theme["type"];
  fontFamily: Theme["fontFamily"];
  fontWeight: Theme["fontWeight"];
  onAccent: string;
  onSemantic: string;
  scheme: "dark" | "light";
  textStyle: (t: TypeToken) => TextStyle;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme() === "light" ? "light" : "dark";

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: theme[scheme],
      space: theme.space,
      radius: theme.radius,
      type: theme.type,
      fontFamily: theme.fontFamily,
      fontWeight: theme.fontWeight,
      onAccent: theme.onAccent,
      onSemantic: theme.onSemantic,
      scheme,
      textStyle,
    }),
    [scheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

