import { Stack } from "expo-router";
import { LoginScreen } from "@/screens/LoginScreen";

export default function LoginRoute() {
  return (
    <>
      <Stack.Screen options={{ title: "Sign in" }} />
      <LoginScreen />
    </>
  );
}
