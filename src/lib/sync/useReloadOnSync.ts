import { useEffect } from "react";
import { onSyncApplied } from "./syncEvents";

/**
 * Re-runs `reload` whenever SyncEngine applies pulled rows (see
 * syncEvents.ts) so data synced from another device — or this device's own
 * background sync — appears without navigating away and back. Pass the same
 * useCallback-wrapped loader the screen already gives useFocusEffect.
 */
export function useReloadOnSync(reload: () => void): void {
  useEffect(() => onSyncApplied(reload), [reload]);
}
