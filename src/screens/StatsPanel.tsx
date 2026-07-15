import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { useAuth } from "@/providers/AuthProvider";
import { activityDates, computeStreak, recentAccuracy } from "@/lib/dashboardStats";
import { useReloadOnSync } from "@/lib/sync/useReloadOnSync";
import { StatTile } from "@/ui";

const ACCURACY_WINDOW_DAYS = 30;

interface Stats {
  dueToday: number;
  streak: number;
  accuracyPercent: number | null;
}

/**
 * Cross-deck stats — due today, review streak, and 30-day accuracy. All
 * derived from existing repository data, nothing new persisted (same
 * "never stored" precedent as CardStats). Mirrors
 * flashy/src/components/StatsPanel.tsx.
 */
export function StatsPanel() {
  const { colors, space } = useTheme();
  const { cards, testRuns } = useRepositories();
  const { ownerId } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  const load = useCallback(async () => {
    const [dueCards, allCards, runs] = await Promise.all([
      cards.getDueCards(null, new Date()),
      cards.getAllByOwner(ownerId),
      testRuns.getRunsByOwner(ownerId),
    ]);
    const streak = computeStreak(activityDates(allCards, runs));
    const accuracy = recentAccuracy(runs, ACCURACY_WINDOW_DAYS);
    setStats({ dueToday: dueCards.length, streak, accuracyPercent: accuracy.percent });
  }, [cards, testRuns, ownerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useReloadOnSync(load);

  if (!stats) return null;

  function accuracyColor(percent: number | null): string {
    if (percent === null) return colors.text3;
    if (percent >= 80) return colors.correct;
    if (percent >= 60) return colors.selfGrade;
    return colors.incorrect;
  }

  return (
    <View style={{ flexDirection: "row", gap: space.sm }}>
      <StatTile value={String(stats.dueToday)} label="Due today" />
      <StatTile
        value={`${stats.streak}${stats.streak > 0 ? " 🔥" : ""}`}
        label="Day streak"
      />
      <StatTile
        value={stats.accuracyPercent === null ? "—" : `${stats.accuracyPercent}%`}
        label="30-day accuracy"
        valueColor={accuracyColor(stats.accuracyPercent)}
      />
    </View>
  );
}
