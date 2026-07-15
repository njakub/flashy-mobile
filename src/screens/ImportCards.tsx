import React, { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useTheme } from "@/providers/ThemeProvider";
import { useRepositories } from "@/providers/RepositoryProvider";
import { useAuth } from "@/providers/AuthProvider";
import { DEFAULT_SCHEDULING_STATE } from "@/lib/scheduler";
import { parseImport } from "@/lib/content/importParser";
import { previewText } from "@/lib/content/markdown";
import { Button, Card, Chip, Input } from "@/ui";

interface Props {
  deckId: string;
}

/** How many parsed cards to render in the preview — imports can be large
 * and this screen is one scroll view, not a virtualized list. */
const PREVIEW_LIMIT = 30;

/**
 * Bulk import: paste tab/comma/semicolon-delimited text (or pick a
 * .csv/.tsv/.txt file), preview the parsed cards, then insert them in one
 * transaction via CardRepository.createMany. Column format is documented in
 * importParser.ts (front, back, optional labels).
 */
export function ImportCards({ deckId }: Props) {
  const { colors, space, type, textStyle } = useTheme();
  const { cards } = useRepositories();
  const { ownerId } = useAuth();
  const router = useRouter();

  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseImport(text);

  async function handlePasteFromClipboard() {
    setError(null);
    const clip = await Clipboard.getStringAsync();
    if (!clip.trim()) {
      setError("Clipboard is empty.");
      return;
    }
    setText(clip);
  }

  async function handlePickFile() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/tab-separated-values", "text/plain", "text/comma-separated-values"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    try {
      setText(await new File(result.assets[0].uri).text());
    } catch {
      setError("Could not read that file.");
    }
  }

  async function handleImport() {
    if (parsed.cards.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      await cards.createMany(
        parsed.cards.map((draft) => ({
          deckId,
          ownerId,
          front: draft.front,
          back: draft.back,
          alternateAnswers: [],
          keyPoints: [],
          labels: draft.labels,
          scheduling: DEFAULT_SCHEDULING_STATE(),
        })),
      );
      router.replace(`/decks/${deckId}`);
    } catch {
      setError("Failed to import cards.");
      setImporting(false);
    }
  }

  const previewCards = parsed.cards.slice(0, PREVIEW_LIMIT);

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1, backgroundColor: colors.bg0 }}
      contentContainerStyle={{ padding: space.lg, gap: space.xl }}
      bottomOffset={space.xxl}
    >
      <View style={{ gap: space.xs }}>
        <Text style={[textStyle(type.title), { color: colors.text1 }]}>Import cards</Text>
        <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
          One card per line: front, then back, then optional labels — separated by tabs, commas,
          or semicolons. Paste from a spreadsheet or pick a CSV file.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Button label="Paste from clipboard" variant="secondary" onPress={handlePasteFromClipboard} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Pick CSV file" variant="secondary" onPress={handlePickFile} />
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <Text style={[textStyle(type.micro), { color: colors.text2 }]}>Rows to import</Text>
        <Input
          value={text}
          onChangeText={setText}
          placeholder={"What is 2+2?\t4\tmath\nCapital of France?\tParis"}
          multiline
        />
      </View>

      {error && <Text style={[textStyle(type.meta), { color: colors.incorrect }]}>{error}</Text>}

      {parsed.errors.length > 0 && (
        <View style={{ gap: space.xs }}>
          <Text style={[textStyle(type.micro), { color: colors.incorrect }]}>
            {parsed.errors.length} row{parsed.errors.length !== 1 ? "s" : ""} skipped
          </Text>
          {parsed.errors.map((e, i) => (
            <Text key={i} style={[textStyle(type.meta), { color: colors.incorrect }]}>
              Line {e.line}: {e.message}
            </Text>
          ))}
        </View>
      )}

      {parsed.cards.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Text style={[textStyle(type.micro), { color: colors.text2 }]}>
            Preview · {parsed.cards.length} card{parsed.cards.length !== 1 ? "s" : ""}
            {parsed.cards.length > PREVIEW_LIMIT ? ` (showing first ${PREVIEW_LIMIT})` : ""}
          </Text>
          {previewCards.map((draft, i) => (
            <Card key={i} style={{ gap: space.xs }}>
              <Text style={[textStyle(type.body), { color: colors.text1 }]} numberOfLines={2}>
                {previewText(draft.front)}
              </Text>
              <Text style={[textStyle(type.meta), { color: colors.text2 }]} numberOfLines={2}>
                {previewText(draft.back)}
              </Text>
              {draft.labels.length > 0 && (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  {draft.labels.map((l) => (
                    <Chip key={l} label={l} variant="neutral" />
                  ))}
                </View>
              )}
            </Card>
          ))}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: space.md }}>
        <Button
          label={
            importing
              ? "Importing…"
              : `Import ${parsed.cards.length} card${parsed.cards.length !== 1 ? "s" : ""}`
          }
          onPress={handleImport}
          disabled={importing || parsed.cards.length === 0}
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
