import { Stack, useLocalSearchParams } from "expo-router";
import { DeckDetail } from "@/screens/DeckDetail";

export default function DeckDetailRoute() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Deck" }} />
      <DeckDetail deckId={deckId} />
    </>
  );
}
