import type { SQLiteDatabase } from "expo-sqlite";
import { getDb } from "@/lib/db";
import {
  rowToTestRun,
  rowToTestRunQuestion,
  type TestRunQuestionRow,
  type TestRunRow,
} from "@/lib/db/rows";
import { newId } from "@/lib/id";
import { notifyDirty } from "@/lib/sync/dirtyBus";
import type { CardStats, TestRun, TestRunQuestion } from "@/lib/types";
import type { TestRunRepository } from "./interfaces";

/**
 * Port of DexieTestRunRepository onto expo-sqlite. Behavioral spec:
 * flashy/src/lib/repositories/DexieTestRunRepository.ts.
 */
export class SqliteTestRunRepository implements TestRunRepository {
  async saveRun(
    run: Omit<TestRun, "id">,
    questions: Omit<TestRunQuestion, "id" | "runId">[],
  ): Promise<TestRun> {
    const db = await getDb();
    const runId = newId();
    const newRun: TestRun = { id: runId, ...run };

    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `INSERT INTO test_runs (id, ownerId, deckId, startedAt, completedAt, questionCount, correctCount, deletedAt, dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
        [
          newRun.id,
          newRun.ownerId,
          newRun.deckId,
          newRun.startedAt,
          newRun.completedAt,
          newRun.questionCount,
          newRun.correctCount,
        ],
      );
      for (const q of questions) {
        await txn.runAsync(
          `INSERT INTO test_run_questions (id, runId, cardId, cardFrontSnapshot, cardBackSnapshot, userAnswer, outcome, similarity, dirty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            newId(),
            runId,
            q.cardId,
            q.cardFrontSnapshot,
            q.cardBackSnapshot,
            q.userAnswer,
            q.outcome,
            q.similarity ?? null,
          ],
        );
      }
    });
    notifyDirty();
    return newRun;
  }

  async getRunsByDeck(deckId: string): Promise<TestRun[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<TestRunRow>(
      "SELECT * FROM test_runs WHERE deckId = ? AND deletedAt IS NULL ORDER BY startedAt DESC",
      [deckId],
    );
    return rows.map(rowToTestRun);
  }

  async getRunsByOwner(ownerId: string): Promise<TestRun[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<TestRunRow>(
      "SELECT * FROM test_runs WHERE ownerId = ? AND deletedAt IS NULL",
      [ownerId],
    );
    return rows.map(rowToTestRun);
  }

  async getRunById(id: string): Promise<TestRun | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<TestRunRow>(
      "SELECT * FROM test_runs WHERE id = ? AND deletedAt IS NULL",
      [id],
    );
    return row ? rowToTestRun(row) : undefined;
  }

  async getQuestionsForRun(runId: string): Promise<TestRunQuestion[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<TestRunQuestionRow>(
      "SELECT * FROM test_run_questions WHERE runId = ?",
      [runId],
    );
    return rows.map(rowToTestRunQuestion);
  }

  async getQuestionsForRuns(runIds: string[]): Promise<TestRunQuestion[]> {
    if (runIds.length === 0) return [];
    const db = await getDb();
    const placeholders = runIds.map(() => "?").join(", ");
    const rows = await db.getAllAsync<TestRunQuestionRow>(
      `SELECT * FROM test_run_questions WHERE runId IN (${placeholders})`,
      runIds,
    );
    return rows.map(rowToTestRunQuestion);
  }

  /**
   * Single grouped pass over test_run_questions for the given card ids.
   * O(history size for those cards) — no per-card round trips.
   */
  async getStatsByCards(cardIds: string[]): Promise<CardStats[]> {
    if (cardIds.length === 0) return [];
    const db = await getDb();
    const placeholders = cardIds.map(() => "?").join(", ");
    const rows = await db.getAllAsync<TestRunQuestionRow>(
      `SELECT * FROM test_run_questions WHERE cardId IN (${placeholders})`,
      cardIds,
    );

    const statsMap = new Map<string, CardStats>();
    for (const id of cardIds) {
      statsMap.set(id, { cardId: id, attempts: 0, correct: 0 });
    }
    for (const row of rows) {
      const s = statsMap.get(row.cardId);
      if (!s) continue;
      s.attempts += 1;
      if (row.outcome === "correct") s.correct += 1;
    }
    return Array.from(statsMap.values());
  }

  /**
   * Soft-deletes (tombstones) the deck's test runs so the deletion syncs;
   * hard-deletes their question rows locally — once the parent run is gone
   * from this device, cached question rows serve no purpose here.
   */
  async deleteByDeck(deckId: string, executor?: SQLiteDatabase): Promise<void> {
    const run = async (db: SQLiteDatabase) => {
      const runs = await db.getAllAsync<{ id: string }>(
        "SELECT id FROM test_runs WHERE deckId = ?",
        [deckId],
      );
      const runIds = runs.map((r) => r.id);
      if (runIds.length > 0) {
        const placeholders = runIds.map(() => "?").join(", ");
        await db.runAsync(
          `DELETE FROM test_run_questions WHERE runId IN (${placeholders})`,
          runIds,
        );
      }
      await db.runAsync(
        "UPDATE test_runs SET deletedAt = ?, dirty = 1 WHERE deckId = ?",
        [new Date().toISOString(), deckId],
      );
    };

    if (executor) {
      await run(executor);
    } else {
      const db = await getDb();
      await db.withExclusiveTransactionAsync(run);
      notifyDirty();
    }
  }
}
