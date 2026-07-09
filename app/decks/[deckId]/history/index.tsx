import { Stack, useLocalSearchParams } from "expo-router";
import { TestHistory } from "@/screens/TestHistory";

export default function HistoryRoute() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "History" }} />
      <TestHistory deckId={deckId} />
    </>
  );
}
