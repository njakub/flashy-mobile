import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { MIGRATIONS } from "./schema";

/**
 * Sync bookkeeping bolted onto the stored row shape, kept OUT of the public
 * domain types in src/lib/types.ts — repositories and SyncEngine (a sibling
 * that shares this store) are the only code that reads/writes these.
 *
 * deletedAt: soft-delete tombstone. Repositories filter deletedAt-set rows
 *   out of every read, so a soft delete looks identical to a hard delete to
 *   the rest of the app — but the tombstone can be pushed to the server and
 *   pulled by other devices instead of vanishing untraceably.
 * dirty: set on every local create/update/delete; cleared by SyncEngine once
 *   the server has acknowledged the row (win or lose any conflict).
 */
export interface SyncMeta {
  deletedAt: string | null;
  dirty: 0 | 1;
}

/** Single-row table holding the per-table server revision cursor for sync. */
export interface SyncCursorRow {
  id: "cursor";
  decks: string;
  cards: string;
  testRuns: string;
  testRunQuestions: string;
}

const DB_NAME = "flashy.db";

let dbPromise: Promise<SQLiteDatabase> | null = null;

async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const currentVersion = row?.user_version ?? 0;
  if (currentVersion >= MIGRATIONS.length) return;

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (let v = currentVersion; v < MIGRATIONS.length; v++) {
      await txn.execAsync(MIGRATIONS[v]);
      await txn.execAsync(`PRAGMA user_version = ${v + 1}`);
    }
  });
}

/** Singleton — lazily opened and migrated on first call, then reused. */
export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}
