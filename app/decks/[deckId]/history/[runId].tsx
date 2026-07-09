import { Stack, useLocalSearchParams } from "expo-router";
import { TestRunDetail } from "@/screens/TestRunDetail";

export default function RunDetailRoute() {
  const { deckId, runId } = useLocalSearchParams<{ deckId: string; runId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Run detail" }} />
      <TestRunDetail deckId={deckId} runId={runId} />
    </>
  );
}
