import { Stack, useLocalSearchParams } from "expo-router";
import { TestSession } from "@/screens/TestSession";

export default function TestRoute() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Test" }} />
      <TestSession deckId={deckId} />
    </>
  );
}
