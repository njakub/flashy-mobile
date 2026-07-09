import React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useThresholdPrefs } from "@/lib/grading/useThresholdPrefs";
import { THRESHOLD_PRESETS } from "@/lib/grading/thresholdPresets";
import { Screen, Button, Card, SegmentedControl } from "@/ui";

/**
 * Mirrors flashy/src/components/ProfilePage.tsx, trimmed to v1 mobile scope
 * (see docs/plans/flashy-mobile.md ProfilePage row): account + sign out,
 * last-sync time + sync-now, grading-strictness preset. Model pickers and
 * the usage dashboard are v2.
 */
export function ProfileScreen() {
  const { colors, space, type, textStyle } = useTheme();
  const { status, user, logout, lastSyncAt, syncing, syncError, syncNow } = useAuth();
  const { preset: thresholdPreset, setPresetKey } = useThresholdPrefs();
  const router = useRouter();
  const isSignedIn = status === "signedIn";

  if (status === "loading") {
    return (
      <Screen>
        <Text style={[textStyle(type.meta), { color: colors.text3 }]}>Loading…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: space.xl }}>
        <Text style={[textStyle(type.display), { color: colors.text1 }]}>Profile</Text>

        {!isSignedIn ? (
          <Card style={{ gap: space.sm }}>
            <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
              Sign in to manage your account and sync settings across devices.
            </Text>
            <Button label="Sign in" onPress={() => router.push("/login")} />
          </Card>
        ) : (
          <Card style={{ gap: space.md }}>
            <View>
              <Text
                style={[
                  textStyle(type.micro),
                  { color: colors.text3, textTransform: "uppercase" },
                ]}
              >
                Account
              </Text>
              <Text style={[textStyle(type.body), { color: colors.text1, marginTop: space.xs }]}>
                {user?.email}
              </Text>
            </View>
            <View>
              <Text style={[textStyle(type.meta), { color: colors.text2 }]}>
                {syncing ? "Syncing…" : syncError ? `Sync error: ${syncError}` : "Synced"}
              </Text>
              {lastSyncAt && (
                <Text style={[textStyle(type.micro), { color: colors.text3 }]}>
                  Last sync: {new Date(lastSyncAt).toLocaleTimeString()}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label="Sync now"
                  variant="secondary"
                  onPress={() => void syncNow()}
                  disabled={syncing}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Sign out" variant="secondary" onPress={() => void logout()} />
              </View>
            </View>
          </Card>
        )}

        <Card style={{ gap: space.md }}>
          <View>
            <Text
              style={[textStyle(type.micro), { color: colors.text3, textTransform: "uppercase" }]}
            >
              Grading strictness
            </Text>
            <Text style={[textStyle(type.meta), { color: colors.text2, marginTop: space.xs }]}>
              {`${thresholdPreset.description} This is a per-device setting — it doesn't sync.`}
            </Text>
          </View>
          <SegmentedControl
            segments={THRESHOLD_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            value={thresholdPreset.key}
            onChange={setPresetKey}
          />
        </Card>
      </View>
    </Screen>
  );
}
