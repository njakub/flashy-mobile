import { Stack } from "expo-router";
import { DeckList } from "@/screens/DeckList";
import { SyncStatusHeader } from "@/screens/SyncStatusHeader";

export default function Index() {
  return (
    <>
      <Stack.Screen
        options={{
          title: "Decks",
          headerShown: true,
          headerTitle: "",
          headerShadowVisible: false,
          headerRight: () => <SyncStatusHeader />,
        }}
      />
      <DeckList />
    </>
  );
}
