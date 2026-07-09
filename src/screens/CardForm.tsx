import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { useAuth } from "@/providers/AuthProvider";
import { DEFAULT_SCHEDULING_STATE } from "@/lib/scheduler";
import { Button, Input, Chip } from "@/ui";
import type { Card } from "@/lib/types";

interface Props {
  deckId: string;
  cardId?: string; // undefined = create mode
}

function parseLabels(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function CardForm({ deckId, cardId }: Props) {
  const { colors, space, type, textStyle } = useTheme();
  const { cards } = useRepositories();
  const { ownerId } = useAuth();
  const router = useRouter();

  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [alternateAnswers, setAlternateAnswers] = useState<string[]>([]);
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<Card | null>(null);

  useEffect(() => {
    if (!cardId) return;
    cards.getById(cardId).then((c) => {
      if (c) {
        setExisting(c);
        setFront(c.front);
        setBack(c.back);
        setAlternateAnswers(c.alternateAnswers ?? []);
        setKeyPoints(c.keyPoints ?? []);
        setLabelInput((c.labels ?? []).join(", "));
      }
    });
  }, [cardId, cards]);

  function addAlternate() {
    setAlternateAnswers((prev) => [...prev, ""]);
  }
  function updateAlternate(index: number, value: string) {
    setAlternateAnswers((prev) => prev.map((a, i) => (i === index ? value : a)));
  }
  function removeAlternate(index: number) {
    setAlternateAnswers((prev) => prev.filter((_, i) => i !== index));
  }

  function addKeyPoint() {
    setKeyPoints((prev) => [...prev, ""]);
  }
  function updateKeyPoint(index: number, value: string) {
    setKeyPoints((prev) => prev.map((p, i) => (i === index ? value : p)));
  }
  function removeKeyPoint(index: number) {
    setKeyPoints((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) {
      setError("Both front and back are required.");
      return;
    }
    const alts = alternateAnswers.map((a) => a.trim()).filter(Boolean);
    const kps = keyPoints.map((k) => k.trim()).filter(Boolean);
    const lbs = parseLabels(labelInput);
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await cards.update(existing.id, {
          front: f,
          back: b,
          alternateAnswers: alts,
          keyPoints: kps,
          labels: lbs,
        });
      } else {
        await cards.create({
          deckId,
          ownerId,
          front: f,
          back: b,
          alternateAnswers: alts,
          keyPoints: kps,
          labels: lbs,
          scheduling: DEFAULT_SCHEDULING_STATE(),
        });
      }
      router.replace(`/decks/${deckId}`);
    } catch {
      setError("Failed to save card.");
      setSaving(false);
    }
  }

  const parsedLabels = parseLabels(labelInput);

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.bg0 }}
      contentContainerStyle={{ padding: space.lg, gap: space.xl }}
      bottomOffset={space.xxl}
    >
      <Text style={[textStyle(type.title), { color: colors.text1 }]}>
        {existing ? "Edit card" : "New card"}
      </Text>

      <View style={{ gap: space.sm }}>
        <Text style={[textStyle(type.micro), { color: colors.text2 }]}>Front</Text>
        <Input value={front} onChangeText={setFront} placeholder="Question or prompt…" multiline />
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[textStyle(type.micro), { color: colors.text2 }]}>Back (primary answer)</Text>
        <Input value={back} onChangeText={setBack} placeholder="Answer…" multiline />
      </View>

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[textStyle(type.micro), { color: colors.text2 }]}>
            Alternate answers
          </Text>
          <Button label="+ Add" variant="ghost" onPress={addAlternate} />
        </View>
        {alternateAnswers.length === 0 && (
          <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
            None — the primary answer above is the only accepted answer.
          </Text>
        )}
        {alternateAnswers.map((alt, i) => (
          <View key={i} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Input
                value={alt}
                onChangeText={(v) => updateAlternate(i, v)}
                placeholder={`Alternate answer ${i + 1}…`}
              />
            </View>
            <Button label="✕" variant="ghost" onPress={() => removeAlternate(i)} />
          </View>
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[textStyle(type.micro), { color: colors.text2 }]}>
            Key points (concept card rubric)
          </Text>
          <Button label="+ Add" variant="ghost" onPress={addKeyPoint} />
        </View>
        {keyPoints.length === 0 && (
          <Text style={[textStyle(type.meta), { color: colors.text3 }]}>
            None — this is a regular Q/A card.
          </Text>
        )}
        {keyPoints.map((point, i) => (
          <View key={i} style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Input
                value={point}
                onChangeText={(v) => updateKeyPoint(i, v)}
                placeholder={`Key point ${i + 1}…`}
              />
            </View>
            <Button label="✕" variant="ghost" onPress={() => removeKeyPoint(i)} />
          </View>
        ))}
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[textStyle(type.micro), { color: colors.text2 }]}>
          Labels (comma-separated)
        </Text>
        <Input value={labelInput} onChangeText={setLabelInput} placeholder="e.g. vocab, chapter-3, hard" />
        {parsedLabels.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {parsedLabels.map((l) => (
              <Chip key={l} label={l} variant="accentSoft" />
            ))}
          </View>
        )}
      </View>

      {error && <Text style={[textStyle(type.meta), { color: colors.incorrect }]}>{error}</Text>}

      <View style={{ flexDirection: "row", gap: space.md }}>
        <Button
          label={saving ? "Saving…" : existing ? "Save changes" : "Add card"}
          onPress={handleSubmit}
          disabled={saving}
        />
        <Button
          label="Cancel"
          variant="secondary"
          onPress={() => router.replace(`/decks/${deckId}`)}
        />
      </View>
    </KeyboardAwareScrollView>
  );
}
