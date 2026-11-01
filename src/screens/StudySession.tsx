import React, { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { loadDeckSubtreeIds } from "@/lib/decks/subtree";
import { scheduler } from "@/lib/scheduler";
import { distinctLabels } from "@/lib/testHistory";
import { FLAGGED_LABEL } from "@/lib/constants";
import { isConceptCard } from "@/lib/content/concept";
import { Screen, Button, Card, Chip, ProgressBar } from "@/ui";
import type { Card as CardType, RecallRating } from "@/lib/types";

interface Props {
  deckId: string;
}

const RATINGS: { value: RecallRating; label: string; description: string }[] = [
  { value: "again", label: "Again", description: "Complete blank" },
  { value: "hard", label: "Hard", description: "Serious difficulty" },
  { value: "good", label: "Good", description: "Recalled with effort" },
  { value: "easy", label: "Easy", description: "Effortless recall" },
];

const RATING_VARIANT: Record<RecallRating, "incorrectSoft" | "selfGradeSoft" | "secondary" | "correctSoft"> = {
  again: "incorrectSoft",
  hard: "selfGradeSoft",
  good: "secondary",
  easy: "correctSoft",
};

function matchesLabels(card: CardType, selectedLabels: string[]): boolean {
  return (
    selectedLabels.length === 0 || card.labels.some((l) => selectedLabels.includes(l))
  );
}

/**
 * Loads its due queue once per session and deliberately does NOT reload on
 * background sync — re-fetching mid-session would yank cards out from under
 * an in-progress review (see docs/plans/flashy-mobile.md "Sync engine port").
 */
export function StudySession({ deckId }: Props) {
  const { colors, space, radius, type, textStyle } = useTheme();
  const { cards, decks } = useRepositories();
  const router = useRouter();

  const [queue, setQueue] = useState<CardType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const [studyingAhead, setStudyingAhead] = useState(false);
  const [deckTotalCount, setDeckTotalCount] = useState(0);
  const [deckFilteredCount, setDeckFilteredCount] = useState(0);
  const [labelOptions, setLabelOptions] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);

  const load = useCallback(
    async (studyAhead = false) => {
      setLoading(true);
      // A parent deck studies its whole subtree.
      const deckIds = await loadDeckSubtreeIds(decks, deckId);
      const allDeckCards = await cards.getByDecks(deckIds);
      const matching = allDeckCards.filter((c) => matchesLabels(c, selectedLabels));
      setLabelOptions(distinctLabels(allDeckCards));
      setDeckTotalCount(allDeckCards.length);
      setDeckFilteredCount(matching.length);

      let due = (await cards.getDueCardsInDecks(deckIds, new Date())).filter((c) =>
        matchesLabels(c, selectedLabels),
      );
      if (due.length === 0 && studyAhead) due = matching;

      due = [...due].sort(
        (a, b) => new Date(a.scheduling.dueAt).getTime() - new Date(b.scheduling.dueAt).getTime(),
      );
      setQueue(due);
      setCurrentIndex(0);
      setRevealed(false);
      setReviewed(0);
      setDone(due.length === 0);
      setStudyingAhead(studyAhead && due.length > 0);
      setLoading(false);
    },
    [cards, decks, deckId, selectedLabels],
  );

  const loadDue = useCallback(() => load(false), [load]);
  const loadAll = useCallback(() => load(true), [load]);

  useFocusEffect(
    useCallback(() => {
      void loadDue();
    }, [loadDue]),
  );

  const current = queue[currentIndex] ?? null;

  const handleRate = useCallback(
    async (rating: RecallRating) => {
      if (!current) return;
      const nextState = scheduler.review(current.scheduling, rating);
      await cards.update(current.id, { scheduling: nextState });
      setReviewed((r) => r + 1);
      const nextIndex = currentIndex + 1;
      if (nextIndex >= queue.length) {
        setDone(true);
      } else {
        setCurrentIndex(nextIndex);
        setRevealed(false);
      }
    },
    [cards, current, currentIndex, queue.length],
  );

  const isFlagged = current?.labels.includes(FLAGGED_LABEL) ?? false;

  const toggleFlag = useCallback(async () => {
    if (!current) return;
    const labels = isFlagged
      ? current.labels.filter((l) => l !== FLAGGED_LABEL)
      : [...current.labels, FLAGGED_LABEL];
    const updated = await cards.update(current.id, { labels });
    setQueue((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, [cards, current, isFlagged]);

  function toggleLabel(label: string) {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  if (loading) {
    return (
      <Screen>
        <Text style={[textStyle(type.meta), { color: colors.text3 }]}>Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <View style={{ gap: space.lg, flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[textStyle(type.title), { color: colors.text1 }]}>
            Study session
            {studyingAhead && (
              <Text style={[textStyle(type.meta), { color: colors.text3 }]}> (studying ahead)</Text>
            )}
          </Text>
          <Text style={[textStyle(type.statMono), { color: colors.text2 }]}>
            {done ? queue.length : currentIndex + 1} / {queue.length}
          </Text>
        </View>

        {labelOptions.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {labelOptions.map((l) => (
              <Pressable key={l} onPress={() => toggleLabel(l)}>
                <Chip label={l} variant={selectedLabels.includes(l) ? "accentSoft" : "neutral"} />
              </Pressable>
            ))}
          </View>
        )}

        {!done && queue.length > 0 && <ProgressBar progress={currentIndex / queue.length} />}

        {done ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg }}>
            <Card style={{ alignItems: "center", gap: space.lg }}>
              <Text style={{ fontSize: 32 }}>🎉</Text>
              <Text style={[textStyle(type.body), { color: colors.text1, textAlign: "center" }]}>
                {reviewed > 0
                  ? `Session complete — reviewed ${reviewed} card${reviewed !== 1 ? "s" : ""}.`
                  : deckTotalCount === 0
                    ? "This deck has no cards yet."
                    : selectedLabels.length > 0 && deckFilteredCount === 0
                      ? "No cards match the selected labels."
                      : "Nothing due right now."}
              </Text>
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {reviewed > 0 ? (
                  <Button label="Restart" onPress={loadDue} />
                ) : (
                  deckFilteredCount > 0 && <Button label="Study anyway" onPress={loadAll} />
                )}
                <Button
                  label="Back to deck"
                  variant="secondary"
                  onPress={() => router.replace(`/decks/${deckId}`)}
                />
              </View>
            </Card>
          </View>
        ) : (
          <>
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Card style={{ minHeight: 220, gap: space.lg }}>
                <Pressable
                  onPress={toggleFlag}
                  style={{ position: "absolute", top: space.md, right: space.md, zIndex: 1 }}
                >
                  <Text style={{ color: isFlagged ? colors.incorrect : colors.text3, fontSize: 16 }}>
                    ⚑
                  </Text>
                </Pressable>
                <Text
                  style={[
                    textStyle(type.cardFront),
                    { color: revealed ? colors.text2 : colors.text1 },
                  ]}
                >
                  {current?.front ?? ""}
                </Text>
                {revealed && (
                  <>
                    <View style={{ height: 1, backgroundColor: colors.line }} />
                    <Text style={[textStyle(type.cardBack), { color: colors.accentHi }]}>
                      {current?.back ?? ""}
                    </Text>
                    {isConceptCard(current ?? { keyPoints: [] }) && (
                      <View style={{ gap: space.xs }}>
                        <Text style={[textStyle(type.micro), { color: colors.text3 }]}>
                          KEY POINTS
                        </Text>
                        {(current?.keyPoints ?? []).map((point, i) => (
                          <View key={i} style={{ flexDirection: "row", gap: space.xs }}>
                            <Text style={{ color: colors.correct }}>✓</Text>
                            <Text style={[textStyle(type.meta), { color: colors.text2, flex: 1 }]}>
                              {point}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </Card>
            </View>

            {!revealed ? (
              <Pressable
                onPress={() => setRevealed(true)}
                style={{
                  borderWidth: 1,
                  borderStyle: "dashed",
                  borderColor: colors.line2,
                  borderRadius: radius.control,
                  paddingVertical: space.md,
                  alignItems: "center",
                }}
              >
                <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
                  Tap to reveal answer
                </Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                {RATINGS.map(({ value, label, description }) => (
                  <View key={value} style={{ flex: 1 }}>
                    <Button
                      label={label}
                      variant={RATING_VARIANT[value]}
                      onPress={() => handleRate(value)}
                    />
                    <Text
                      style={[
                        textStyle(type.micro),
                        { color: colors.text3, textAlign: "center", marginTop: 4 },
                      ]}
                      numberOfLines={1}
                    >
                      {description}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
