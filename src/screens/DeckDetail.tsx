import React, { useCallback, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { useReloadOnSync } from "@/lib/sync/useReloadOnSync";
import { Screen, Button, Input, Chip, InlineConfirm } from "@/ui";
import { FLAGGED_LABEL } from "@/lib/constants";
import { isConceptCard } from "@/lib/content/concept";
import { previewText } from "@/lib/content/markdown";
import { useAuth } from "@/providers/AuthProvider";
import {
  ancestors,
  buildDeckTree,
  flattenTree,
  subtreeIds,
  type DeckNode,
} from "@/lib/decks/tree";
import type { Card, CardStats, Deck } from "@/lib/types";

interface SubtreeCounts {
  decks: number; // descendant decks, excluding this one
  cards: number; // including this deck's own
  due: number;
}

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
  const { colors, space, radius, type, textStyle } = useTheme();
  const { decks, cards, testRuns } = useRepositories();
  const { ownerId } = useAuth();
  const router = useRouter();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cardList, setCardList] = useState<Card[]>([]);
  const [allDecks, setAllDecks] = useState<Deck[]>([]);
  const [subtree, setSubtree] = useState<SubtreeCounts>({ decks: 0, cards: 0, due: 0 });
  // Rolled-up card/due counts per child deck, for the sub-decks list.
  const [childCounts, setChildCounts] = useState<Record<string, { cards: number; due: number }>>(
    {},
  );
  const [newSubName, setNewSubName] = useState("");
  const [moving, setMoving] = useState(false);
  const [statsMap, setStatsMap] = useState<Map<string, CardStats>>(new Map());
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteCardId, setConfirmDeleteCardId] = useState<string | null>(null);
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

    const everyDeck = await decks.getAll(d.ownerId);
    setAllDecks(everyDeck);
    const ids = subtreeIds(everyDeck, deckId);
    const subtreeCards = await cards.getByDecks(ids);
    const nowIso = new Date().toISOString();
    const isDue = (x: Card) => x.scheduling.dueAt <= nowIso;
    setSubtree({
      decks: ids.length - 1,
      cards: subtreeCards.length,
      due: subtreeCards.filter(isDue).length,
    });
    const node = flattenTree(buildDeckTree(everyDeck)).find((n) => n.deck.id === deckId);
    const perChild: Record<string, { cards: number; due: number }> = {};
    for (const child of node?.children ?? []) {
      const childIds = new Set(subtreeIds(everyDeck, child.deck.id));
      const inChild = subtreeCards.filter((x) => childIds.has(x.deckId));
      perChild[child.deck.id] = { cards: inChild.length, due: inChild.filter(isDue).length };
    }
    setChildCounts(perChild);
    const statsList = await testRuns.getStatsByCards(c.map((x) => x.id));
    setStatsMap(new Map(statsList.map((s) => [s.cardId, s])));
  }, [deckId, decks, cards, testRuns, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useReloadOnSync(load);

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

  async function handleAddSubDeck() {
    const name = newSubName.trim();
    if (!name || !deck) return;
    setError(null);
    try {
      await decks.create({ name, ownerId, parentId: deck.id });
      setNewSubName("");
      await load();
    } catch {
      setError("Failed to create sub-deck.");
    }
  }

  async function handleMove(parentId: string | null) {
    setMoving(false);
    if (!deck || parentId === deck.parentId) return;
    setError(null);
    try {
      await decks.update(deck.id, { parentId });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move deck.");
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
    setConfirmDeleteCardId(null);
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
  const flat = flattenTree(buildDeckTree(allDecks));
  const children: DeckNode[] = flat.find((n) => n.deck.id === deckId)?.children ?? [];
  const breadcrumb = ancestors(allDecks, deckId);
  // Anywhere outside this deck's own subtree is a valid new parent.
  const excluded = new Set(subtreeIds(allDecks, deckId));
  const moveTargets = flat.filter((n) => !excluded.has(n.deck.id));
  const currentParent = breadcrumb.at(-1)?.id ?? null;
  const deleteMessage =
    `Delete "${deck.name}"` +
    (subtree.decks > 0
      ? `, its ${subtree.decks} sub-deck${subtree.decks !== 1 ? "s" : ""}`
      : "") +
    ` and all ${subtree.cards} card${subtree.cards !== 1 ? "s" : ""} with their test history? This cannot be undone.`;
  const visibleCards = showFlaggedOnly
    ? cardList.filter((c) => c.labels.includes(FLAGGED_LABEL))
    : cardList;

  return (
    <Screen scroll={false}>
      <View style={{ gap: space.lg, flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
          <View style={{ flex: 1 }}>
            {breadcrumb.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {breadcrumb.map((a) => (
                  <Pressable key={a.id} onPress={() => router.push(`/decks/${a.id}`)}>
                    <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
                      {a.name} /{" "}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
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
                  {subtree.decks > 0 && ` (${subtree.cards} including sub-decks)`}
                  {avgAccuracy !== null && ` · ${avgAccuracy}% average accuracy`}
                </Text>
              </>
            )}
          </View>
          {!editing && (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Rename" variant="secondary" onPress={() => setEditing(true)} />
              <Button label="Move" variant="secondary" onPress={() => setMoving((v) => !v)} />
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
            message={deleteMessage}
            confirmLabel="Yes, delete everything"
            onConfirm={handleDeleteDeck}
            onCancel={() => setConfirmDelete(false)}
          />
        )}

        {moving && (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: radius.row,
              padding: space.md,
              gap: space.xs,
              maxHeight: 240,
            }}
          >
            <Text style={[textStyle(type.micro), { color: colors.text3 }]}>MOVE TO</Text>
            <ScrollView>
              {[{ id: null, name: "Top level", depth: 0 }, ...moveTargets.map((n) => ({
                id: n.deck.id as string | null,
                name: n.deck.name,
                depth: n.depth + 1,
              }))].map((t) => (
                <Pressable
                  key={t.id ?? "__top"}
                  onPress={() => void handleMove(t.id)}
                  style={{ paddingVertical: space.sm, paddingLeft: t.depth * space.lg }}
                >
                  <Text
                    style={[
                      textStyle(type.body),
                      { color: t.id === currentParent ? colors.accentHi : colors.text1 },
                    ]}
                  >
                    {t.name}
                    {t.id === currentParent ? " (current)" : ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {error && (
          <Text style={[textStyle(type.meta), { color: colors.incorrect }]}>{error}</Text>
        )}

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1.5 }}>
            <Button
              label={`Study · ${subtree.due} due`}
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

        <View style={{ gap: space.sm }}>
          <Text style={[textStyle(type.micro), { color: colors.text3 }]}>SUB-DECKS</Text>
          {children.map((child) => {
            const c = childCounts[child.deck.id] ?? { cards: 0, due: 0 };
            return (
              <Pressable
                key={child.deck.id}
                onPress={() => router.push(`/decks/${child.deck.id}`)}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: space.md,
                  borderWidth: 1,
                  borderColor: pressed ? colors.accent : colors.line,
                  borderRadius: radius.row,
                  backgroundColor: colors.bg1,
                  paddingHorizontal: space.md,
                  paddingVertical: space.sm,
                })}
              >
                <Text style={[textStyle(type.body), { color: colors.text1, flex: 1 }]} numberOfLines={1}>
                  {child.deck.name}
                </Text>
                <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
                  {c.cards} card{c.cards !== 1 ? "s" : ""}
                  {c.due > 0 && ` · ${c.due} due`}
                </Text>
              </Pressable>
            );
          })}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Input
                value={newSubName}
                onChangeText={setNewSubName}
                placeholder="New sub-deck name…"
                maxLength={120}
                onSubmitEditing={handleAddSubDeck}
                returnKeyType="done"
              />
            </View>
            <Button
              label="Add"
              variant="secondary"
              onPress={handleAddSubDeck}
              disabled={!newSubName.trim()}
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
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable onPress={() => router.push(`/decks/${deckId}/import`)}>
              <Chip label="Import" variant="neutral" />
            </Pressable>
            <Pressable onPress={() => router.push(`/decks/${deckId}/cards/new`)}>
              <Chip label="+ Add card" variant="accentSoft" />
            </Pressable>
          </View>
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
              if (confirmDeleteCardId === card.id) {
                return (
                  <View style={{ paddingVertical: space.md }}>
                    <InlineConfirm
                      message={`Delete "${previewText(card.front)}"?`}
                      onConfirm={() => handleDeleteCard(card.id)}
                      onCancel={() => setConfirmDeleteCardId(null)}
                    />
                  </View>
                );
              }
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
                      <Pressable onPress={() => setConfirmDeleteCardId(card.id)}>
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
