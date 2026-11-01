import React, { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { useReloadOnSync } from "@/lib/sync/useReloadOnSync";
import { Screen, Button, Input } from "@/ui";
import { StatsPanel } from "./StatsPanel";
import { buildDeckTree, type DeckNode } from "@/lib/decks/tree";
import type { Deck } from "@/lib/types";

interface Counts {
  total: number;
  due: number;
}

/** Two-letter monogram for the deck icon — presentational only. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function DeckList() {
  const { colors, space, radius, type, textStyle } = useTheme();
  const { decks, cards } = useRepositories();
  const { ownerId } = useAuth();
  const router = useRouter();

  const [deckList, setDeckList] = useState<Deck[]>([]);
  // Rolled up: a deck's own cards plus every descendant's.
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  // In-memory only — every deck starts expanded on app launch.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await decks.getAll(ownerId);
    setDeckList(d);
    const allCards = await cards.getAllByOwner(ownerId);
    const nowIso = new Date().toISOString();
    const own: Record<string, Counts> = {};
    for (const c of allCards) {
      const entry = (own[c.deckId] ??= { total: 0, due: 0 });
      entry.total++;
      if (c.scheduling.dueAt <= nowIso) entry.due++;
    }
    const rolled: Record<string, Counts> = {};
    const roll = (node: DeckNode): Counts => {
      const sum = { ...(own[node.deck.id] ?? { total: 0, due: 0 }) };
      for (const child of node.children) {
        const c = roll(child);
        sum.total += c.total;
        sum.due += c.due;
      }
      rolled[node.deck.id] = sum;
      return sum;
    };
    buildDeckTree(d).forEach(roll);
    setCounts(rolled);
  }, [decks, cards, ownerId]);

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Pre-order rows, skipping anything under a collapsed deck.
  const visibleRows: DeckNode[] = [];
  const walk = (nodes: DeckNode[]) => {
    for (const n of nodes) {
      visibleRows.push(n);
      if (!collapsed.has(n.deck.id)) walk(n.children);
    }
  };
  walk(buildDeckTree(deckList));

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useReloadOnSync(load);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const deck = await decks.create({ name, ownerId, parentId: null });
      setNewName("");
      await load();
      router.push(`/decks/${deck.id}`);
    } catch {
      setError("Failed to create deck.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen scroll={false}>
      <View style={{ gap: space.xxl, flex: 1 }}>
        <Text style={[textStyle(type.display), { color: colors.text1 }]}>Decks</Text>

        {deckList.length > 0 && <StatsPanel />}

        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Input
              value={newName}
              onChangeText={setNewName}
              placeholder="New deck name…"
              maxLength={120}
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
          </View>
          <Button
            label="Create"
            onPress={handleCreate}
            disabled={creating || !newName.trim()}
          />
        </View>

        {error && (
          <Text style={[textStyle(type.meta), { color: colors.incorrect }]}>{error}</Text>
        )}

        {deckList.length === 0 ? (
          <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
            No decks yet. Create one above.
          </Text>
        ) : (
          <FlatList
            data={visibleRows}
            keyExtractor={(n) => n.deck.id}
            contentContainerStyle={{ gap: space.sm }}
            renderItem={({ item: node }) => {
              const item = node.deck;
              const c = counts[item.id] ?? { total: 0, due: 0 };
              const hasChildren = node.children.length > 0;
              const isCollapsed = collapsed.has(item.id);
              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.xs,
                    paddingLeft: node.depth * space.xl,
                  }}
                >
                  {hasChildren ? (
                    <Pressable
                      onPress={() => toggleCollapsed(item.id)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: !isCollapsed }}
                      accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${item.name}`}
                      style={{ width: 24, alignItems: "center" }}
                    >
                      <Text style={[textStyle(type.body), { color: colors.text3 }]}>
                        {isCollapsed ? "▸" : "▾"}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={{ width: 24 }} />
                  )}
                  <Pressable
                    onPress={() => router.push(`/decks/${item.id}`)}
                    style={({ pressed }) => [
                      {
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.lg,
                        backgroundColor: colors.bg1,
                        borderWidth: 1,
                        borderColor: pressed ? colors.accent : colors.line,
                        borderRadius: radius.row,
                        padding: space.md,
                      },
                    ]}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: radius.icon,
                        backgroundColor: colors.accentSoft,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={[textStyle(type.button), { color: colors.accentHi }]}>
                        {initials(item.name)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[textStyle(type.body), { color: colors.text1 }]}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
                        {c.total} card{c.total !== 1 ? "s" : ""}
                        {c.due > 0 && ` · ${c.due} due`}
                        {hasChildren &&
                          ` · ${node.children.length} sub-deck${node.children.length !== 1 ? "s" : ""}`}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              );
            }}
          />
        )}
      </View>
    </Screen>
  );
}
