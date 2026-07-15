import { Stack, useLocalSearchParams } from "expo-router";
import { ImportCards } from "@/screens/ImportCards";

export default function ImportRoute() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Import" }} />
      <ImportCards deckId={deckId} />
    </>
  );
}
