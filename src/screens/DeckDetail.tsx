import React, { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { Screen, Button, Input, Chip, InlineConfirm } from "@/ui";
import { FLAGGED_LABEL } from "@/lib/constants";
import { isConceptCard } from "@/lib/content/concept";
import { previewText } from "@/lib/content/markdown";
import type { Card, CardStats, Deck } from "@/lib/types";

interface Props {
  deckId: string;
}

function accuracyColor(
  pct: number | null,
  colors: { text3: string; correct: string; selfGrade: string; incorrect: string },
): string {
  if (pct === null) return colors.text3;
  if (pct >= 80) return colors.correct;
  if (pct >= 60) return colors.selfGrade;
  return colors.incorrect;
}

export function DeckDetail({ deckId }: Props) {
  const { colors, space, type, textStyle } = useTheme();
  const { decks, cards, testRuns } = useRepositories();
  const router = useRouter();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cardList, setCardList] = useState<Card[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [statsMap, setStatsMap] = useState<Map<string, CardStats>>(new Map());
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);

  const load = useCallback(async () => {
    const d = await decks.getById(deckId);
    if (!d) {
      router.replace("/");
      return;
    }
    setDeck(d);
    setEditName(d.name);
    const c = await cards.getByDeck(deckId);
    setCardList(c.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    const due = await cards.getDueCards(deckId, new Date());
    setDueCount(due.length);
    const statsList = await testRuns.getStatsByCards(c.map((x) => x.id));
    setStatsMap(new Map(statsList.map((s) => [s.cardId, s])));
  }, [deckId, decks, cards, testRuns, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleRename() {
    const name = editName.trim();
    if (!name || !deck) return;
    setError(null);
    try {
      await decks.update(deck.id, { name });
      setEditing(false);
      await load();
    } catch {
      setError("Failed to rename deck.");
    }
  }

  async function handleDeleteDeck() {
    if (!deck) return;
    try {
      await decks.delete(deck.id);
      router.replace("/");
    } catch {
      setError("Failed to delete deck.");
    }
  }

  async function handleDeleteCard(cardId: string) {
    try {
      await cards.delete(cardId);
      await load();
    } catch {
      setError("Failed to delete card.");
    }
  }

  if (!deck) {
    return (
      <Screen>
        <Text style={[textStyle(type.meta), { color: colors.text3 }]}>Loading…</Text>
      </Screen>
    );
  }

  const totals = Array.from(statsMap.values()).reduce(
    (acc, s) => ({ attempts: acc.attempts + s.attempts, correct: acc.correct + s.correct }),
    { attempts: 0, correct: 0 },
  );
  const avgAccuracy =
    totals.attempts > 0 ? Math.round((totals.correct / totals.attempts) * 100) : null;
  const flaggedCount = cardList.filter((c) => c.labels.includes(FLAGGED_LABEL)).length;
  const visibleCards = showFlaggedOnly
    ? cardList.filter((c) => c.labels.includes(FLAGGED_LABEL))
    : cardList;

  return (
    <Screen scroll={false}>
      <View style={{ gap: space.lg, flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
          <View style={{ flex: 1 }}>
            {editing ? (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Input value={editName} onChangeText={setEditName} maxLength={120} autoFocus />
                </View>
                <Button label="Save" onPress={handleRename} />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => {
                    setEditing(false);
                    setEditName(deck.name);
                  }}
                />
              </View>
            ) : (
              <>
                <Text style={[textStyle(type.title), { color: colors.text1 }]}>{deck.name}</Text>
                <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
                  {cardList.length} card{cardList.length !== 1 ? "s" : ""}
                  {avgAccuracy !== null && ` · ${avgAccuracy}% average accuracy`}
                </Text>
              </>
            )}
          </View>
          {!editing && (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Rename" variant="secondary" onPress={() => setEditing(true)} />
              <Button
                label="Delete"
                variant="incorrectSoft"
                onPress={() => setConfirmDelete(true)}
              />
            </View>
          )}
        </View>

        {confirmDelete && (
          <InlineConfirm
            message={`Delete "${deck.name}" and all ${cardList.length} card${cardList.length !== 1 ? "s" : ""}? This cannot be undone.`}
            confirmLabel="Yes, delete everything"
            onConfirm={handleDeleteDeck}
            onCancel={() => setConfirmDelete(false)}
          />
        )}

        {error && (
          <Text style={[textStyle(type.meta), { color: colors.incorrect }]}>{error}</Text>
        )}

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1.5 }}>
            <Button
              label={`Study · ${dueCount} due`}
              onPress={() => router.push(`/decks/${deckId}/study`)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Test"
              variant="secondary"
              onPress={() => router.push(`/decks/${deckId}/test`)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="History"
              variant="secondary"
              onPress={() => router.push(`/decks/${deckId}/history`)}
            />
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={[textStyle(type.micro), { color: colors.text3 }]}>CARDS</Text>
            {flaggedCount > 0 && (
              <Pressable onPress={() => setShowFlaggedOnly((v) => !v)}>
                <Chip
                  label={`⚑ ${flaggedCount} flagged`}
                  variant={showFlaggedOnly ? "incorrectSoft" : "neutral"}
                />
              </Pressable>
            )}
          </View>
          <Pressable onPress={() => router.push(`/decks/${deckId}/cards/new`)}>
            <Chip label="+ Add card" variant="accentSoft" />
          </Pressable>
        </View>

        {visibleCards.length === 0 ? (
          <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
            {cardList.length === 0 ? "No cards yet." : "No flagged cards."}
          </Text>
        ) : (
          <FlatList
            data={visibleCards}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ gap: 0 }}
            renderItem={({ item: card }) => {
              const s = statsMap.get(card.id);
              const pct = s && s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : null;
              const hasChips = isConceptCard(card) || card.labels.length > 0;
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
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[textStyle(type.body), { color: colors.text1 }]}
                      numberOfLines={1}
                    >
                      {previewText(card.front)}
                    </Text>
                    {hasChips && (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: space.xs,
                          marginTop: space.xs,
                        }}
                      >
                        {isConceptCard(card) && (
                          <Chip
                            label={`Concept · ${(card.keyPoints ?? []).length}`}
                            variant="accentSoft"
                          />
                        )}
                        {card.labels.map((l) => (
                          <Chip
                            key={l}
                            label={l === FLAGGED_LABEL ? `⚑ ${l}` : l}
                            variant={l === FLAGGED_LABEL ? "incorrectSoft" : "neutral"}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text
                      style={[
                        textStyle(type.statMono),
                        { color: accuracyColor(pct, colors) },
                      ]}
                    >
                      {pct === null ? "—" : `${pct}%`}
                    </Text>
                    <Text style={[textStyle(type.statMono), { color: colors.text3 }]}>
                      {s?.attempts ?? 0} tries
                    </Text>
                    <View style={{ flexDirection: "row", gap: space.sm, marginTop: 2 }}>
                      <Pressable onPress={() => router.push(`/decks/${deckId}/cards/${card.id}/edit`)}>
                        <Text style={[textStyle(type.micro), { color: colors.text3 }]}>Edit</Text>
                      </Pressable>
                      <Pressable onPress={() => handleDeleteCard(card.id)}>
                        <Text style={[textStyle(type.micro), { color: colors.text3 }]}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </Screen>
  );
}
