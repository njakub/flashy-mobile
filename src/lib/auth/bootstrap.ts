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
