import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_THRESHOLD_PRESET_KEY,
  getThresholdPreset,
  type ThresholdPreset,
} from "./thresholdPresets";

/**
 * Port of flashy/src/lib/grading/useThresholdPrefs.ts onto AsyncStorage.
 * Device-local, NOT synced — the right band is content-dependent (vocab
 * decks want strict, essay-style decks want lenient), so it stays local same
 * as the web version.
 *
 * AsyncStorage is async (unlike localStorage), so unlike the web hook this
 * starts at the default preset and updates once the stored key loads —
 * TestSession reads `preset` fresh each session mount, so the one-render
 * flash to a persisted non-default preset is the only user-visible
 * difference from the web's synchronous initial read.
 */
const STORAGE_KEY = "flashy_threshold_preset";

export function useThresholdPrefs(): {
  preset: ThresholdPreset;
  setPresetKey(key: string): void;
} {
  const [key, setKey] = useState<string>(DEFAULT_THRESHOLD_PRESET_KEY);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!cancelled && stored) setKey(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPresetKey = useCallback((next: string) => {
    setKey(next);
    void AsyncStorage.setItem(STORAGE_KEY, next);
  }, []);

  return { preset: getThresholdPreset(key), setPresetKey };
}
