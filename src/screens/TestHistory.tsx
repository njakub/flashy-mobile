import React, { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { Screen, Chip, SegmentedControl } from "@/ui";
import {
  cardLabelsById,
  distinctLabels,
  groupQuestionsByRun,
  computeLabelStats,
  runListForLabel,
  formatDuration,
  type RunListEntry,
} from "@/lib/testHistory";
import type { Card, TestRun, TestRunQuestion } from "@/lib/types";

interface Props {
  deckId: string;
}

function pct(correct: number, attempts: number): string {
  if (attempts === 0) return "—";
  return `${Math.round((correct / attempts) * 100)}%`;
}

type Tab = "runs" | "byLabel";

export function TestHistory({ deckId }: Props) {
  const { colors, space, radius, type, textStyle } = useTheme();
  const { cards, testRuns } = useRepositories();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [cardList, setCardList] = useState<Card[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [questions, setQuestions] = useState<TestRunQuestion[]>([]);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("runs");

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r] = await Promise.all([cards.getByDeck(deckId), testRuns.getRunsByDeck(deckId)]);
    setCardList(c);
    setRuns(r);
    setQuestions(await testRuns.getQuestionsForRuns(r.map((run) => run.id)));
    setLoading(false);
  }, [cards, testRuns, deckId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function accuracyColor(p: number): string {
    return p >= 80 ? colors.correct : p >= 60 ? colors.selfGrade : colors.incorrect;
  }

  if (loading) {
    return (
      <Screen>
        <Text style={[textStyle(type.meta), { color: colors.text3 }]}>Loading…</Text>
      </Screen>
    );
  }

  const cardLabels = cardLabelsById(cardList);
  const labels = distinctLabels(cardList);
  const questionsByRun = groupQuestionsByRun(questions);
  const labelStats = computeLabelStats(questions, cardLabels);

  const overallAttempts = runs.reduce((a, r) => a + r.questionCount, 0);
  const overallCorrect = runs.reduce((a, r) => a + r.correctCount, 0);

  const entries: RunListEntry[] = runListForLabel(runs, questionsByRun, cardLabels, selectedLabel);

  function selectLabelAndShowRuns(label: string) {
    setSelectedLabel(label);
    setTab("runs");
  }

  return (
    <Screen scroll={false}>
      <View style={{ gap: space.lg, flex: 1 }}>
        <Text style={[textStyle(type.title), { color: colors.text1 }]}>Test history</Text>

        {runs.length === 0 ? (
          <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
            No test history yet — take a test to see it here.
          </Text>
        ) : (
          <>
            {labels.length > 0 && (
              <SegmentedControl
                segments={[
                  { value: "runs", label: "Runs" },
                  { value: "byLabel", label: "By label" },
                ]}
                value={tab}
                onChange={(v) => setTab(v as Tab)}
              />
            )}

            {tab === "runs" ? (
              <>
                {selectedLabel && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Chip label={`Filtered by "${selectedLabel}"`} variant="accentSoft" />
                    <Pressable onPress={() => setSelectedLabel(null)}>
                      <Text style={[textStyle(type.micro), { color: colors.text3 }]}>✕ Clear</Text>
                    </Pressable>
                  </View>
                )}

                {entries.length === 0 ? (
                  <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
                    {`No runs contain "${selectedLabel}" cards yet.`}
                  </Text>
                ) : (
                  <FlatList
                    data={entries}
                    keyExtractor={(e) => e.run.id}
                    renderItem={({ item: { run, questionCount, correctCount } }) => {
                      const runPct =
                        questionCount > 0 ? Math.round((correctCount / questionCount) * 100) : null;
                      return (
                        <Pressable
                          onPress={() => router.push(`/decks/${deckId}/history/${run.id}`)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: space.md,
                            paddingVertical: space.md,
                            borderBottomWidth: 1,
                            borderBottomColor: colors.line,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[textStyle(type.body), { color: colors.text1 }]}>
                              {new Date(run.startedAt).toLocaleDateString()}
                            </Text>
                            <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
                              {questionCount} question{questionCount !== 1 ? "s" : ""} ·{" "}
                              {formatDuration(run.startedAt, run.completedAt)}
                            </Text>
                          </View>
                          <View style={{ alignItems: "flex-end" }}>
                            <Text
                              style={[
                                textStyle(type.statMono),
                                { color: runPct === null ? colors.text3 : accuracyColor(runPct) },
                              ]}
                            >
                              {correctCount}/{questionCount}
                            </Text>
                            <Text style={[textStyle(type.statMono), { color: colors.text3 }]}>
                              {runPct === null ? "—" : `${runPct}%`}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    }}
                  />
                )}
              </>
            ) : (
              <View style={{ gap: space.md, flex: 1 }}>
                <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
                  Accuracy across all tests, per label
                </Text>
                <Text style={[textStyle(type.micro), { color: colors.text3 }]}>
                  Reflects current labels — relabelling or deleting a card updates this
                  retroactively.
                </Text>
                <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
                  Overall{" "}
                  <Text style={{ color: colors.text1, fontWeight: "600" }}>
                    {pct(overallCorrect, overallAttempts)}
                  </Text>{" "}
                  ({overallCorrect}/{overallAttempts})
                </Text>
                <FlatList
                  data={labelStats}
                  keyExtractor={(s) => s.label}
                  renderItem={({ item: s }) => {
                    const p = s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : 0;
                    return (
                      <Pressable
                        onPress={() => selectLabelAndShowRuns(s.label)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: space.md,
                          paddingVertical: space.md,
                        }}
                      >
                        <Text
                          style={[textStyle(type.body), { color: colors.text1, width: 96 }]}
                          numberOfLines={1}
                        >
                          {s.label}
                        </Text>
                        <View
                          style={{
                            flex: 1,
                            height: 8,
                            borderRadius: radius.pill,
                            backgroundColor: colors.bg3,
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              height: "100%",
                              width: `${p}%`,
                              borderRadius: radius.pill,
                              backgroundColor: accuracyColor(p),
                            }}
                          />
                        </View>
                        <Text
                          style={[
                            textStyle(type.statMono),
                            { color: accuracyColor(p), width: 40, textAlign: "right" },
                          ]}
                        >
                          {p}%
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              </View>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
