import React, { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { Screen, Button, Input } from "@/ui";
import { StatsPanel } from "./StatsPanel";
import type { Deck } from "@/lib/types";

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
  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await decks.getAll(ownerId);
    const sorted = d.sort((a, b) => a.name.localeCompare(b.name));
    setDeckList(sorted);
    const counts: Record<string, number> = {};
    await Promise.all(
      sorted.map(async (deck) => {
        const c = await cards.getByDeck(deck.id);
        counts[deck.id] = c.length;
      }),
    );
    setCardCounts(counts);
  }, [decks, cards, ownerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const deck = await decks.create({ name, ownerId });
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
            data={deckList}
            keyExtractor={(d) => d.id}
            contentContainerStyle={{ gap: space.md }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/decks/${item.id}`)}
                style={({ pressed }) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.lg,
                    backgroundColor: colors.bg1,
                    borderWidth: 1,
                    borderColor: pressed ? colors.accent : colors.line,
                    borderRadius: radius.row,
                    padding: space.lg,
                  },
                ]}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
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
                    {cardCounts[item.id] ?? 0} card{cardCounts[item.id] !== 1 ? "s" : ""}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </Screen>
  );
}
