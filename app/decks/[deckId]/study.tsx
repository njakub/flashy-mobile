import { Stack, useLocalSearchParams } from "expo-router";
import { StudySession } from "@/screens/StudySession";

export default function StudyRoute() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  return (
    <>
      <Stack.Screen options={{ title: "Study" }} />
      <StudySession deckId={deckId} />
    </>
  );
}
