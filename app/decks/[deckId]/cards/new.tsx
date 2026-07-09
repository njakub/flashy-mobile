import { Stack, useLocalSearchParams } from "expo-router";
import { CardForm } from "@/screens/CardForm";

export default function NewCardRoute() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "New card" }} />
      <CardForm deckId={deckId} />
    </>
  );
}
