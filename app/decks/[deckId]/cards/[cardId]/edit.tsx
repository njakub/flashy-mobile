import { Stack, useLocalSearchParams } from "expo-router";
import { CardForm } from "@/screens/CardForm";

export default function EditCardRoute() {
  const { deckId, cardId } = useLocalSearchParams<{ deckId: string; cardId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Edit card" }} />
      <CardForm deckId={deckId} cardId={cardId} />
    </>
  );
}
