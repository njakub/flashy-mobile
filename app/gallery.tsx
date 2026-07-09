import React, { useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";
import {
  Screen,
  Button,
  Card,
  Input,
  SegmentedControl,
  Chip,
  ProgressBar,
  StatTile,
  InlineConfirm,
} from "@/ui";

/**
 * Temporary M0 gallery screen — exercises every UI primitive against both
 * color schemes before any real screen (DeckList etc., M1+) lands here.
 */
export default function GalleryScreen() {
  const { colors, space, type, textStyle } = useTheme();
  const [segment, setSegment] = useState<"runs" | "labels">("runs");
  const [confirming, setConfirming] = useState(false);

  return (
    <Screen>
      <View style={{ gap: space.xxl }}>
        <Text style={[textStyle(type.display), { color: colors.text1 }]}>
          Flashy Mobile
        </Text>

        <View style={{ flexDirection: "row", gap: space.md }}>
          <StatTile value="12" label="due today" />
          <StatTile value="🔥 4" label="streak" />
          <StatTile value="92%" label="30-day accuracy" />
        </View>

        <ProgressBar progress={0.6} />

        <SegmentedControl
          segments={[
            { value: "runs", label: "Runs" },
            { value: "labels", label: "By label" },
          ]}
          value={segment}
          onChange={setSegment}
        />

        <Card>
          <Text style={[textStyle(type.cardFront), { color: colors.text1 }]}>
            What is the capital of France?
          </Text>
        </Card>

        <Input placeholder="Type your answer…" />

        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Chip label="geography" />
          <Chip label="⚑ flagged" variant="incorrectSoft" />
          <Chip label="correct" variant="correctSoft" />
          <Chip label="self-grade" variant="selfGradeSoft" />
        </View>

        <View style={{ gap: space.sm }}>
          <Button label="Primary" variant="primary" onPress={() => {}} />
          <Button label="Secondary" variant="secondary" onPress={() => {}} />
          <Button label="Ghost" variant="ghost" onPress={() => {}} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button label="Again" variant="incorrectSoft" onPress={() => {}} />
            <Button label="Hard" variant="selfGradeSoft" onPress={() => {}} />
            <Button label="Good" variant="secondary" onPress={() => {}} />
            <Button label="Easy" variant="correctSoft" onPress={() => {}} />
          </View>
          <Button label="Delete deck" variant="danger" onPress={() => setConfirming(true)} />
        </View>

        {confirming && (
          <InlineConfirm
            message="Delete this deck and all its cards?"
            onConfirm={() => setConfirming(false)}
            onCancel={() => setConfirming(false)}
          />
        )}
      </View>
    </Screen>
  );
}
