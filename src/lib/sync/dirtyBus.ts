/**
 * Mirrors flashy/src/lib/sync/dirtyBus.ts verbatim.
 *
 * Fired by the Sqlite repositories after every successful local write
 * (create/update/delete). AuthProvider subscribes and debounces this into
 * a sync call — the "after a local write" trigger from the sync design,
 * so the sync-status indicator reflects reality shortly after an edit
 * rather than only at the next periodic tick.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyDirty(): void {
  for (const l of listeners) l();
}

export function onDirty(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
