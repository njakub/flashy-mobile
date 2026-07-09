import React, { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { Screen, Chip } from "@/ui";
import { cardLabelsById, formatDuration } from "@/lib/testHistory";
import type { Card, TestRun, TestRunQuestion } from "@/lib/types";

interface Props {
  deckId: string;
  runId: string;
}

export function TestRunDetail({ runId }: Props) {
  const { colors, space, type, textStyle, onSemantic } = useTheme();
  const { cards, testRuns } = useRepositories();

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<TestRun | null>(null);
  const [questions, setQuestions] = useState<TestRunQuestion[]>([]);
  const [cardList, setCardList] = useState<Card[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, qs] = await Promise.all([
      testRuns.getRunById(runId),
      testRuns.getQuestionsForRun(runId),
    ]);
    setRun(r ?? null);
    setQuestions(qs);
    setCardList(r ? await cards.getByDeck(r.deckId) : []);
    setLoading(false);
  }, [testRuns, cards, runId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) {
    return (
      <Screen>
        <Text style={[textStyle(type.meta), { color: colors.text3 }]}>Loading…</Text>
      </Screen>
    );
  }

  if (!run) {
    return (
      <Screen>
        <Text style={[textStyle(type.meta), { color: colors.text3 }]}>Test run not found.</Text>
      </Screen>
    );
  }

  const cardLabels = cardLabelsById(cardList);

  return (
    <Screen scroll={false}>
      <View style={{ gap: space.lg, flex: 1 }}>
        <View>
          <Text style={[textStyle(type.title), { color: colors.text1 }]}>
            {new Date(run.startedAt).toLocaleDateString()} · {run.correctCount}/{run.questionCount}
          </Text>
          <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
            {run.questionCount} question{run.questionCount !== 1 ? "s" : ""} ·{" "}
            {formatDuration(run.startedAt, run.completedAt)}
          </Text>
        </View>

        <FlatList
          data={questions}
          keyExtractor={(q) => q.id}
          renderItem={({ item: q }) => {
            const labels = cardLabels.get(q.cardId);
            return (
              <View
                style={{
                  flexDirection: "row",
                  gap: space.md,
                  paddingVertical: space.md,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.line,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: q.outcome === "correct" ? colors.correct : colors.incorrect,
                  }}
                >
                  <Text style={{ color: onSemantic, fontSize: 12 }}>
                    {q.outcome === "correct" ? "✓" : "✕"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[textStyle(type.body), { color: colors.text1 }]}>
                    {q.cardFrontSnapshot}
                  </Text>
                  <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
                    {q.outcome === "correct" ? (
                      q.cardBackSnapshot
                    ) : (
                      <Text>
                        you wrote <Text style={{ color: colors.incorrect }}>{q.userAnswer}</Text> ·{" "}
                        {q.cardBackSnapshot}
                      </Text>
                    )}
                    {q.similarity !== undefined
                      ? ` (${(q.similarity * 100).toFixed(0)}% similarity)`
                      : ""}
                  </Text>
                  {labels === undefined ? (
                    <Text style={[textStyle(type.micro), { color: colors.text3, fontStyle: "italic" }]}>
                      card deleted
                    </Text>
                  ) : (
                    labels.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.xs }}>
                        {labels.map((l) => (
                          <Chip key={l} label={l} variant="neutral" />
                        ))}
                      </View>
                    )
                  )}
                </View>
              </View>
            );
          }}
        />
      </View>
    </Screen>
  );
}
