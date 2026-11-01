import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { loadDeckSubtreeIds } from "@/lib/decks/subtree";
import { useAuth } from "@/providers/AuthProvider";
import { scheduler } from "@/lib/scheduler";
import { EmbeddingGrader, preloadEmbeddingModel } from "@/lib/grading/EmbeddingGrader";
import { CodeAwareGrader } from "@/lib/grading/CodeAwareGrader";
import { ConceptAwareGrader } from "@/lib/grading/ConceptAwareGrader";
import { LlmGrader } from "@/lib/grading/LlmGrader";
import { useThresholdPrefs } from "@/lib/grading/useThresholdPrefs";
import type { Grader } from "@/lib/grading/Grader";
import { FLAGGED_LABEL, randomSuccessMessage } from "@/lib/constants";
import { distinctLabels } from "@/lib/testHistory";
import { isConceptCard } from "@/lib/content/concept";
import { Screen, Button, Card, Chip, Input, SegmentedControl, StatTile } from "@/ui";
import type { Card as CardType, GradeResult, TestRunQuestion } from "@/lib/types";

interface Props {
  deckId: string;
}

type SessionPhase = "loading" | "pick" | "question" | "grading" | "ambiguous" | "result" | "done";

const QUIZ_SIZES = [5, 10, 15, 20] as const;

/** Fisher-Yates sample — returns n unique items in random order. */
function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/**
 * Fills in a success message on a correct result that doesn't already carry
 * one: the stored justification for the matched answer if the card has one,
 * otherwise a random generic message.
 */
function withSuccessMessage(card: CardType, result: GradeResult): GradeResult {
  if (result.outcome !== "correct" || result.rationale) return result;
  const stored = result.matchedAnswer && card.answerJustifications?.[result.matchedAnswer];
  return { ...result, rationale: stored || randomSuccessMessage() };
}

/**
 * Free-text answer mode, graded by the local on-device embedding grader
 * (works offline). The AI-assisted cascade (LlmGrader, POST /grade) lands in
 * M4 once auth/sync exist — this screen's local-only chain is written so
 * that addition only touches submitAnswer/resolveGrade, not the phase
 * machine or UI below.
 */
export function TestSession({ deckId }: Props) {
  const { colors, space, radius, type, textStyle, onSemantic } = useTheme();
  const { cards, decks, testRuns } = useRepositories();
  const { ownerId, status, getAccessToken } = useAuth();
  const isSignedIn = status === "signedIn";
  const router = useRouter();

  // Read once at mount (device-local strictness preset — see
  // useThresholdPrefs); a change made on /profile takes effect the next
  // time Test mode is entered, same lifetime as the grader instances below.
  const { preset: thresholdPreset } = useThresholdPrefs();
  const localGrader = useRef<Grader>(
    new ConceptAwareGrader(
      new CodeAwareGrader(
        new EmbeddingGrader(thresholdPreset.passThreshold, thresholdPreset.failThreshold),
      ),
    ),
  );
  const llmGrader = useRef(new LlmGrader(getAccessToken));

  const [pool, setPool] = useState<CardType[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [queue, setQueue] = useState<CardType[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<SessionPhase>("loading");
  const [userAnswer, setUserAnswer] = useState("");
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [activeGrader, setActiveGrader] = useState<"local" | "ai" | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [correct, setCorrect] = useState(0);

  const questionLog = useRef<Omit<TestRunQuestion, "id" | "runId">[]>([]);
  const runStartedAt = useRef<string>("");

  const [addingAlternate, setAddingAlternate] = useState(false);
  const [alternateInput, setAlternateInput] = useState("");
  const [alternateSaving, setAlternateSaving] = useState(false);
  const [checkedPoints, setCheckedPoints] = useState<boolean[]>([]);

  const labelOptions = distinctLabels(pool);
  const filteredPool =
    selectedLabels.length > 0
      ? pool.filter((c) => c.labels.some((l) => selectedLabels.includes(l)))
      : pool;

  function toggleLabel(label: string) {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  function startTest(count: number) {
    // Warm the embedding model only once a quiz actually starts — loading it
    // eagerly on mount paid a native-load cost (and its failure modes) even
    // for decks that can't run a quiz at all.
    preloadEmbeddingModel();
    const selected = sample(filteredPool, Math.min(count, filteredPool.length));
    setQueue(selected);
    setCurrentIndex(0);
    setUserAnswer("");
    setGradeResult(null);
    setGradeError(null);
    setReviewed(0);
    setCorrect(0);
    setCheckedPoints([]);
    questionLog.current = [];
    runStartedAt.current = new Date().toISOString();
    setPhase("question");
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPhase("loading");
      // A parent deck tests its whole subtree; the run is still recorded
      // against deckId (the deck the test was started from).
      const all = await cards.getByDecks(await loadDeckSubtreeIds(decks, deckId));
      if (cancelled) return;
      setPool(all);
      setPhase("pick");
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Loads its pool once per session — same rule as StudySession.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId]);

  const current = queue[currentIndex] ?? null;

  function acceptedAnswers(card: CardType): string[] {
    return [card.back, ...(card.alternateAnswers ?? [])];
  }

  const addAcceptedAnswer = useCallback(
    async (text: string, justification?: string) => {
      if (!current) return;
      const trimmed = text.trim();
      if (!trimmed || acceptedAnswers(current).includes(trimmed)) return;
      try {
        const updated = await cards.update(current.id, {
          alternateAnswers: [...(current.alternateAnswers ?? []), trimmed],
          ...(justification
            ? {
                answerJustifications: {
                  ...(current.answerJustifications ?? {}),
                  [trimmed]: justification,
                },
              }
            : {}),
        });
        setQueue((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setPool((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      } catch {
        // Best-effort — the result/ambiguous screen stays usable either way.
      }
    },
    [cards, current],
  );

  async function persistGrade(isCorrect: boolean, similarity?: number) {
    if (!current) return;
    const rating = isCorrect ? "good" : "again";
    const nextState = scheduler.review(current.scheduling, rating);
    await cards.update(current.id, { scheduling: nextState });

    questionLog.current.push({
      cardId: current.id,
      cardFrontSnapshot: current.front,
      cardBackSnapshot: current.back,
      userAnswer,
      outcome: isCorrect ? "correct" : "incorrect",
      similarity,
    });

    setReviewed((r) => r + 1);
    if (isCorrect) setCorrect((c) => c + 1);
  }

  async function resolveGrade(result: GradeResult) {
    if (!current) return;
    const finalResult = withSuccessMessage(current, result);
    setGradeResult(finalResult);
    setPhase("result");
    await persistGrade(finalResult.outcome === "correct", finalResult.similarity);
  }

  async function submitAnswer(grader: Grader, source: "local" | "ai") {
    const answer = userAnswer.trim();
    if (!answer || !current) return;
    setPhase("grading");
    setGradeError(null);
    setActiveGrader(source);
    try {
      const result = await grader.grade(
        current.front,
        acceptedAnswers(current),
        answer,
        current.keyPoints,
      );
      if (result.outcome === "ambiguous") {
        setGradeResult(result);
        setPhase("ambiguous");
      } else {
        await resolveGrade(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGradeError(message);
      setGradeResult({ outcome: "ambiguous" });
      setPhase("ambiguous");
    } finally {
      setActiveGrader(null);
    }
  }

  async function handleSelfGrade(isCorrect: boolean) {
    // Only send feedback when the ambiguous verdict being resolved came
    // from the AI grader (it's the only source that stamps a usageId).
    if (gradeResult?.usageId) {
      void llmGrader.current.sendFeedback(gradeResult.usageId, isCorrect ? "correct" : "incorrect");
    }
    await persistGrade(isCorrect, gradeResult?.similarity);
    setPhase("result");
    setGradeResult((r) => {
      if (!r) return r;
      const updated: GradeResult = {
        ...r,
        outcome: isCorrect ? "correct" : "incorrect",
        ...(current && isConceptCard(current)
          ? {
              coverage: (current.keyPoints ?? []).map((point, i) => ({
                point,
                covered: checkedPoints[i] ?? false,
              })),
            }
          : {}),
      };
      return current ? withSuccessMessage(current, updated) : updated;
    });
  }

  async function finishRun() {
    const completedAt = new Date().toISOString();
    const log = questionLog.current;
    const correctCount = log.filter((q) => q.outcome === "correct").length;
    try {
      await testRuns.saveRun(
        {
          ownerId,
          deckId,
          startedAt: runStartedAt.current || completedAt,
          completedAt,
          questionCount: log.length,
          correctCount,
        },
        log,
      );
    } catch {
      // History save failures are non-fatal — the user still sees the results.
    }
    setPhase("done");
  }

  function advance() {
    setAddingAlternate(false);
    setAlternateInput("");
    setCheckedPoints([]);
    const next = currentIndex + 1;
    if (next >= queue.length) {
      void finishRun();
    } else {
      setCurrentIndex(next);
      setUserAnswer("");
      setGradeResult(null);
      setPhase("question");
    }
  }

  const isFlagged = current?.labels.includes(FLAGGED_LABEL) ?? false;

  async function toggleFlag() {
    if (!current) return;
    const labels = isFlagged
      ? current.labels.filter((l) => l !== FLAGGED_LABEL)
      : [...current.labels, FLAGGED_LABEL];
    const updated = await cards.update(current.id, { labels });
    setQueue((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setPool((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function handleSaveAlternate() {
    const alt = alternateInput.trim();
    if (!alt) return;
    setAlternateSaving(true);
    await addAcceptedAnswer(alt);
    setAlternateInput("");
    setAddingAlternate(false);
    setAlternateSaving(false);
  }

  if (phase === "loading") {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  const missed = reviewed - correct;
  const inRun = phase === "question" || phase === "grading" || phase === "ambiguous" || phase === "result";

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.bg0 }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
      bottomOffset={space.xxl}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[textStyle(type.title), { color: colors.text1 }]}>Test mode</Text>
        {inRun && (
          <Text style={[textStyle(type.statMono), { color: colors.text2 }]}>
            {currentIndex + 1} / {queue.length}
          </Text>
        )}
      </View>

      {phase === "pick" && (
        <Card style={{ gap: space.lg }}>
          {labelOptions.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
              {labelOptions.map((l) => (
                <Pressable key={l} onPress={() => toggleLabel(l)}>
                  <Chip label={l} variant={selectedLabels.includes(l) ? "accentSoft" : "neutral"} />
                </Pressable>
              ))}
            </View>
          )}
          {pool.length === 0 ? (
            <Text style={[textStyle(type.meta), { color: colors.text3, textAlign: "center" }]}>
              No cards in this deck yet.
            </Text>
          ) : filteredPool.length === 0 ? (
            <Text style={[textStyle(type.meta), { color: colors.text3, textAlign: "center" }]}>
              No cards match the selected labels.
            </Text>
          ) : filteredPool.length < 5 ? (
            <Text style={[textStyle(type.meta), { color: colors.text3, textAlign: "center" }]}>
              Only {filteredPool.length} card{filteredPool.length !== 1 ? "s" : ""} available — need
              at least 5 for a quiz.
            </Text>
          ) : (
            <>
              <Text
                style={[
                  textStyle(type.micro),
                  { color: colors.text3, textAlign: "center", textTransform: "uppercase" },
                ]}
              >
                How many questions? · {filteredPool.length} available
              </Text>
              <SegmentedControl
                segments={QUIZ_SIZES.filter((n) => n <= filteredPool.length).map((n) => ({
                  value: String(n),
                  label: String(n),
                }))}
                value=""
                onChange={(v) => startTest(Number(v))}
              />
            </>
          )}
          <Button
            label="← Back to deck"
            variant="ghost"
            onPress={() => router.replace(`/decks/${deckId}`)}
          />
        </Card>
      )}

      {phase === "done" && (
        <View style={{ gap: space.lg }}>
          <Card style={{ alignItems: "center", gap: space.sm }}>
            <Text style={[textStyle(type.bigScore), { color: colors.text1 }]}>
              {correct}
              <Text style={{ color: colors.text3 }}>/{queue.length}</Text>
            </Text>
            <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
              {correct === queue.length
                ? "Perfect score!"
                : correct === 0
                  ? "Keep practising — you'll get there."
                  : "Good effort. Try again to improve your score."}
            </Text>
          </Card>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <StatTile value={String(correct)} label="Correct" valueColor={colors.correct} />
            <StatTile value={String(missed)} label="Missed" valueColor={colors.incorrect} />
          </View>
          <Button label="Test again" onPress={() => setPhase("pick")} />
          <Button
            label="Back to deck"
            variant="secondary"
            onPress={() => router.replace(`/decks/${deckId}`)}
          />
        </View>
      )}

      {(phase === "question" || phase === "grading") && current && (
        <View style={{ gap: space.md }}>
          <Card style={{ minHeight: 100, justifyContent: "center" }}>
            <Text style={[textStyle(type.cardFront), { color: colors.text1 }]}>
              {current.front}
            </Text>
          </Card>

          <Input
            value={userAnswer}
            onChangeText={setUserAnswer}
            placeholder="Type your answer…"
            multiline
            editable={phase !== "grading"}
          />

          <Button
            label={phase === "grading" ? "Grading…" : "Submit"}
            onPress={() => submitAnswer(localGrader.current, "local")}
            disabled={phase === "grading" || !userAnswer.trim()}
            loading={phase === "grading"}
          />

          {phase === "grading" && activeGrader === "local" && (
            <Text style={[textStyle(type.meta), { color: colors.text3, textAlign: "center" }]}>
              Loading embedding model for the first time — this takes a few seconds and is cached
              for the rest of the session.
            </Text>
          )}
          {phase === "grading" && activeGrader === "ai" && (
            <Text style={[textStyle(type.meta), { color: colors.text3, textAlign: "center" }]}>
              Asking AI to grade this answer…
            </Text>
          )}
        </View>
      )}

      {phase === "ambiguous" && current && (
        <View style={{ gap: space.md }}>
          <Card>
            <Text style={[textStyle(type.cardFront), { color: colors.text1 }]}>
              {current.front}
            </Text>
          </Card>

          {gradeError && (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.incorrectSoft,
                backgroundColor: colors.incorrectSoft,
                borderRadius: radius.control,
                padding: space.md,
                gap: 2,
              }}
            >
              <Text style={[textStyle(type.micro), { color: colors.incorrect }]}>
                Grading error — please self-grade
              </Text>
              <Text style={[textStyle(type.statMono), { color: colors.incorrect }]}>
                {gradeError}
              </Text>
            </View>
          )}

          <View
            style={{
              borderWidth: 1,
              borderColor: colors.selfGradeSoft,
              backgroundColor: colors.selfGradeSoft,
              borderRadius: radius.card,
              padding: space.lg,
              gap: space.md,
            }}
          >
            <Text style={[textStyle(type.micro), { color: colors.selfGrade }]}>
              {gradeError
                ? "Self-grade (model unavailable)"
                : isConceptCard(current)
                  ? "Tick what you covered, then grade yourself"
                  : "Your call"}
              {!gradeError && gradeResult?.similarity !== undefined
                ? `  (similarity: ${(gradeResult.similarity * 100).toFixed(0)}%)`
                : ""}
            </Text>

            <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
              You wrote{" "}
              <Text style={{ color: colors.text1, fontWeight: "600" }}>{userAnswer}</Text>
            </Text>
            <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
              Accepted <Text style={{ color: colors.text1, fontWeight: "600" }}>{current.back}</Text>
            </Text>

            {isConceptCard(current) && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.line2,
                  backgroundColor: colors.bg1,
                  borderRadius: radius.control,
                  padding: space.md,
                  gap: space.xs,
                }}
              >
                <Text style={[textStyle(type.micro), { color: colors.text3 }]}>
                  Covered {checkedPoints.filter(Boolean).length} of {(current.keyPoints ?? []).length}{" "}
                  key points
                </Text>
                {(current.keyPoints ?? []).map((point, i) => {
                  const checked = checkedPoints[i] ?? false;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => {
                        const next = [...checkedPoints];
                        next[i] = !checked;
                        setCheckedPoints(next);
                      }}
                      style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}
                    >
                      <Text style={{ color: checked ? colors.correct : colors.text3 }}>
                        {checked ? "☑" : "☐"}
                      </Text>
                      <Text style={[textStyle(type.meta), { color: colors.text2, flex: 1 }]}>
                        {point}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button label="Missed it" variant="incorrectSoft" onPress={() => handleSelfGrade(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Got it" variant="correctSoft" onPress={() => handleSelfGrade(true)} />
              </View>
            </View>

            {/* Let AI break the tie instead of self-grading. Only renders
             * while phase === "ambiguous" — submitAnswer moves phase to
             * "grading" synchronously, unmounting it. */}
            {isSignedIn && (
              <Button
                label="Let AI grade this instead"
                variant="ghost"
                onPress={() => submitAnswer(llmGrader.current, "ai")}
              />
            )}

            {!isConceptCard(current) &&
              (!addingAlternate ? (
                <Button
                  label={`Accept "${userAnswer}" for this card`}
                  variant="ghost"
                  onPress={() => {
                    setAddingAlternate(true);
                    setAlternateInput(userAnswer);
                  }}
                />
              ) : (
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={alternateInput}
                      onChangeText={setAlternateInput}
                      placeholder="Alternate accepted phrasing…"
                    />
                  </View>
                  <Button
                    label={alternateSaving ? "Saving…" : "Save"}
                    onPress={handleSaveAlternate}
                    disabled={!alternateInput.trim() || alternateSaving}
                  />
                </View>
              ))}
          </View>
        </View>
      )}

      {phase === "result" && current && gradeResult && (
        <View style={{ gap: space.md }}>
          <Card>
            <Pressable
              onPress={toggleFlag}
              style={{ position: "absolute", top: space.md, right: space.md, zIndex: 1 }}
            >
              <Text style={{ color: isFlagged ? colors.incorrect : colors.text3 }}>⚑</Text>
            </Pressable>
            <Text style={[textStyle(type.cardFront), { color: colors.text1 }]}>
              {current.front}
            </Text>
          </Card>

          <View
            style={{
              borderRadius: radius.card,
              padding: space.lg,
              gap: space.sm,
              backgroundColor:
                gradeResult.outcome === "correct" ? colors.correctSoft : colors.incorrectSoft,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    gradeResult.outcome === "correct" ? colors.correct : colors.incorrect,
                }}
              >
                <Text style={{ color: onSemantic, fontSize: 12 }}>
                  {gradeResult.outcome === "correct" ? "✓" : "✕"}
                </Text>
              </View>
              <Text
                style={[
                  textStyle(type.button),
                  { color: gradeResult.outcome === "correct" ? colors.correct : colors.incorrect },
                ]}
              >
                {gradeResult.outcome === "correct" ? "Correct" : "Not quite"}
              </Text>
              {gradeResult.similarity !== undefined && (
                <Chip
                  label={`${(gradeResult.similarity * 100).toFixed(0)}% similarity`}
                  variant={gradeResult.outcome === "correct" ? "correctSoft" : "incorrectSoft"}
                />
              )}
            </View>

            <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
              You wrote{" "}
              <Text style={{ color: colors.text1, fontWeight: "600" }}>{userAnswer}</Text>
            </Text>
            <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
              Answer <Text style={{ color: colors.text1, fontWeight: "600" }}>{current.back}</Text>
            </Text>

            {gradeResult.rationale && (
              <Text style={[textStyle(type.micro), { color: colors.text3, fontStyle: "italic" }]}>
                &ldquo;{gradeResult.rationale}&rdquo;
              </Text>
            )}

            {gradeResult.coverage && gradeResult.coverage.length > 0 && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: colors.line2,
                  backgroundColor: colors.bg1,
                  borderRadius: radius.control,
                  padding: space.md,
                  gap: space.xs,
                }}
              >
                <Text style={[textStyle(type.micro), { color: colors.text3 }]}>
                  Covered {gradeResult.coverage.filter((c) => c.covered).length} of{" "}
                  {gradeResult.coverage.length} key points
                </Text>
                {gradeResult.coverage.map((c, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: space.xs }}>
                    <Text style={{ color: c.covered ? colors.correct : colors.incorrect }}>
                      {c.covered ? "✓" : "✕"}
                    </Text>
                    <Text
                      style={[
                        textStyle(type.meta),
                        { color: c.covered ? colors.text2 : colors.incorrect, flex: 1 },
                      ]}
                    >
                      {c.point}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {gradeResult.outcome === "incorrect" &&
              !isConceptCard(current) &&
              (!addingAlternate ? (
                <Button
                  label={`Accept "${userAnswer}" for this card`}
                  variant="ghost"
                  onPress={() => {
                    setAddingAlternate(true);
                    setAlternateInput(userAnswer);
                  }}
                />
              ) : (
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Input
                      value={alternateInput}
                      onChangeText={setAlternateInput}
                      placeholder="Alternate accepted phrasing…"
                    />
                  </View>
                  <Button
                    label={alternateSaving ? "Saving…" : "Save"}
                    onPress={handleSaveAlternate}
                    disabled={!alternateInput.trim() || alternateSaving}
                  />
                </View>
              ))}
          </View>

          <Button label="Next →" onPress={advance} />
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
