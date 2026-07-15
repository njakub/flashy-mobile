import { getDb } from "@/lib/db";
import { LOCAL_USER_ID } from "@/lib/constants";

/**
 * Port of flashy/src/lib/auth/bootstrap.ts onto SQLite: one-time-per-device
 * migration on sign-in — re-stamp any pre-existing LOCAL_USER_ID-owned rows
 * to the real authenticated user's id and mark them dirty so they push on
 * the next sync. Safe to call on every sign-in/session restore — idempotent,
 * since after the first run there are no LOCAL_USER_ID rows left to find.
 */
export async function bootstrapLocalUserData(realUserId: string): Promise<void> {
  if (realUserId === LOCAL_USER_ID) return;

  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("UPDATE decks SET ownerId = ?, dirty = 1 WHERE ownerId = ?", [
      realUserId,
      LOCAL_USER_ID,
    ]);
    await txn.runAsync("UPDATE cards SET ownerId = ?, dirty = 1 WHERE ownerId = ?", [
      realUserId,
      LOCAL_USER_ID,
    ]);
    await txn.runAsync("UPDATE test_runs SET ownerId = ?, dirty = 1 WHERE ownerId = ?", [
      realUserId,
      LOCAL_USER_ID,
    ]);
  });
}

/**
 * Inverse of bootstrapLocalUserData, used by account deletion: re-own the
 * (now ex-)user's rows back to LOCAL_USER_ID so the data stays usable
 * offline, and clear dirty flags — there is no server account left to push
 * them to, and a future sign-in under a NEW account re-dirties everything
 * via bootstrapLocalUserData anyway.
 */
export async function releaseUserDataToLocal(realUserId: string): Promise<void> {
  if (realUserId === LOCAL_USER_ID) return;

  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync("UPDATE decks SET ownerId = ?, dirty = 0 WHERE ownerId = ?", [
      LOCAL_USER_ID,
      realUserId,
    ]);
    await txn.runAsync("UPDATE cards SET ownerId = ?, dirty = 0 WHERE ownerId = ?", [
      LOCAL_USER_ID,
      realUserId,
    ]);
    await txn.runAsync("UPDATE test_runs SET ownerId = ?, dirty = 0 WHERE ownerId = ?", [
      LOCAL_USER_ID,
      realUserId,
    ]);
    // Reset the (single, global) pull cursor: it tracked the deleted
    // account's server state, and a future sign-in under a new account must
    // pull from the beginning.
    await txn.runAsync(
      "UPDATE sync_state SET decks = '0', cards = '0', testRuns = '0', testRunQuestions = '0' WHERE id = 'cursor'",
      [],
    );
  });
}
