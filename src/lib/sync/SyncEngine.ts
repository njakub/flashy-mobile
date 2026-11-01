import type { SQLiteDatabase } from "expo-sqlite";
import { getDb } from "@/lib/db";
import type { CardRow, DeckRow, TestRunQuestionRow, TestRunRow } from "@/lib/db/rows";
import { API_BASE_URL } from "@/lib/config";
import { notifySyncApplied } from "./syncEvents";
import {
  mergeCard,
  mergeDeck,
  mergeTestRun,
  mergeTestRunQuestion,
  type StoredCard,
  type StoredDeck,
  type StoredTestRun,
  type StoredTestRunQuestion,
} from "./merge";
import type {
  SyncCursor,
  SyncRequestBody,
  SyncResponseBody,
  WireCard,
  WireDeck,
  WireTestRun,
  WireTestRunQuestion,
} from "./wire";

export interface SyncCounts {
  decks: number;
  cards: number;
  testRuns: number;
  testRunQuestions: number;
}

export interface SyncResult {
  pushed: SyncCounts;
  pulled: SyncCounts;
}

/**
 * Resolves the current access token, refreshing it first if needed. Returns
 * null if there's no signed-in session — syncOnce() then no-ops.
 */
export type AccessTokenGetter = () => Promise<string | null>;

const CURSOR_ID = "cursor";

function defaultSyncCursor(): SyncCursor {
  return { decks: "0", cards: "0", testRuns: "0", testRunQuestions: "0" };
}

// ---------------------------------------------------------------------------
// Row <-> StoredX mapping (includes the sync-only deletedAt/dirty fields
// that the repository layer's rows.ts deliberately strips out).
// ---------------------------------------------------------------------------

function rowToStoredDeck(row: DeckRow): StoredDeck {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    parentId: row.parentId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    dirty: row.dirty,
  };
}

function rowToStoredCard(row: CardRow): StoredCard {
  return {
    id: row.id,
    ownerId: row.ownerId,
    deckId: row.deckId,
    front: row.front,
    back: row.back,
    alternateAnswers: JSON.parse(row.alternateAnswers) as string[],
    answerJustifications:
      row.answerJustifications !== null
        ? (JSON.parse(row.answerJustifications) as Record<string, string>)
        : undefined,
    labels: JSON.parse(row.labels) as string[],
    keyPoints: row.keyPoints !== null ? (JSON.parse(row.keyPoints) as string[]) : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    scheduling: {
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
      dueAt: row.dueAt,
      reps: row.reps,
      lapses: row.lapses,
      lastReviewedAt: row.lastReviewedAt,
    },
    deletedAt: row.deletedAt,
    dirty: row.dirty,
  };
}

function rowToStoredTestRun(row: TestRunRow): StoredTestRun {
  return {
    id: row.id,
    ownerId: row.ownerId,
    deckId: row.deckId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    questionCount: row.questionCount,
    correctCount: row.correctCount,
    deletedAt: row.deletedAt,
    dirty: row.dirty,
  };
}

function rowToStoredTestRunQuestion(row: TestRunQuestionRow): StoredTestRunQuestion {
  return {
    id: row.id,
    runId: row.runId,
    cardId: row.cardId,
    cardFrontSnapshot: row.cardFrontSnapshot,
    cardBackSnapshot: row.cardBackSnapshot,
    userAnswer: row.userAnswer,
    outcome: row.outcome as "correct" | "incorrect",
    similarity: row.similarity ?? undefined,
    dirty: row.dirty,
  };
}

// ---------------------------------------------------------------------------
// Push serialization — StoredX -> wire push shape (omits ownerId/rev, which
// the server derives from the JWT / assigns itself).
// ---------------------------------------------------------------------------

function toWireDeckPush(d: StoredDeck) {
  return {
    id: d.id,
    name: d.name,
    parentId: d.parentId ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    deletedAt: d.deletedAt,
  };
}

function toWireCardPush(c: StoredCard) {
  return {
    id: c.id,
    deckId: c.deckId,
    front: c.front,
    back: c.back,
    alternateAnswers: c.alternateAnswers,
    answerJustifications: c.answerJustifications,
    labels: c.labels,
    // Always present so an explicit [] can legitimately clear key points
    // server-side (absent = "leave unchanged", [] = explicit clear).
    keyPoints: c.keyPoints ?? [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
    scheduling: c.scheduling,
  };
}

function toWireTestRunPush(r: StoredTestRun) {
  return {
    id: r.id,
    deckId: r.deckId,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    questionCount: r.questionCount,
    correctCount: r.correctCount,
    deletedAt: r.deletedAt,
  };
}

function toWireTestRunQuestionPush(q: StoredTestRunQuestion) {
  return {
    id: q.id,
    runId: q.runId,
    cardId: q.cardId,
    cardFrontSnapshot: q.cardFrontSnapshot,
    cardBackSnapshot: q.cardBackSnapshot,
    userAnswer: q.userAnswer,
    outcome: q.outcome,
    similarity: q.similarity,
  };
}

/**
 * Port of flashy/src/lib/sync/SyncEngine.ts onto expo-sqlite — a near
 * line-for-line port of the push/pull algorithm (see docs/plans/
 * flashy-mobile.md "Sync engine port"). A sibling of the Sqlite
 * repositories, not a wrapper around them: it reads/writes the decks/cards/
 * test_runs/test_run_questions tables directly, including the sync-only
 * deletedAt/dirty columns the repository interfaces don't expose.
 */
export class SyncEngine {
  constructor(private readonly getAccessToken: AccessTokenGetter) {}

  async syncOnce(): Promise<SyncResult | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    const db = await getDb();

    const [dirtyDeckRows, dirtyCardRows, dirtyTestRunRows, dirtyTRQRows] = await Promise.all([
      db.getAllAsync<DeckRow>("SELECT * FROM decks WHERE dirty = 1", []),
      db.getAllAsync<CardRow>("SELECT * FROM cards WHERE dirty = 1", []),
      db.getAllAsync<TestRunRow>("SELECT * FROM test_runs WHERE dirty = 1", []),
      db.getAllAsync<TestRunQuestionRow>("SELECT * FROM test_run_questions WHERE dirty = 1", []),
    ]);
    const dirtyDecks = dirtyDeckRows.map(rowToStoredDeck);
    const dirtyCards = dirtyCardRows.map(rowToStoredCard);
    const dirtyTestRuns = dirtyTestRunRows.map(rowToStoredTestRun);
    const dirtyTestRunQuestions = dirtyTRQRows.map(rowToStoredTestRunQuestion);

    const cursorRow = await db.getFirstAsync<{
      decks: string;
      cards: string;
      testRuns: string;
      testRunQuestions: string;
    }>("SELECT decks, cards, testRuns, testRunQuestions FROM sync_state WHERE id = ?", [
      CURSOR_ID,
    ]);
    const cursor = cursorRow ?? defaultSyncCursor();

    const body: SyncRequestBody = {
      cursor,
      push: {
        decks: dirtyDecks.map(toWireDeckPush),
        cards: dirtyCards.map(toWireCardPush),
        testRuns: dirtyTestRuns.map(toWireTestRunPush),
        testRunQuestions: dirtyTestRunQuestions.map(toWireTestRunQuestionPush),
      },
    };

    const res = await fetch(`${API_BASE_URL}/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Sync failed: ${res.status} ${await res.text()}`);
    }
    const data: SyncResponseBody = (await res.json()) as SyncResponseBody;

    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const d of data.decks) await this.applyDeck(txn, d);
      for (const c of data.cards) await this.applyCard(txn, c);
      for (const r of data.testRuns) await this.applyTestRun(txn, r);
      for (const q of data.testRunQuestions) await this.applyTestRunQuestion(txn, q);

      await txn.runAsync(
        `INSERT OR REPLACE INTO sync_state (id, decks, cards, testRuns, testRunQuestions)
         VALUES (?, ?, ?, ?, ?)`,
        [CURSOR_ID, data.cursor.decks, data.cursor.cards, data.cursor.testRuns, data.cursor.testRunQuestions],
      );
    });

    const pulledAnything =
      data.decks.length > 0 ||
      data.cards.length > 0 ||
      data.testRuns.length > 0 ||
      data.testRunQuestions.length > 0;
    if (pulledAnything) notifySyncApplied();

    return {
      pushed: {
        decks: dirtyDecks.length,
        cards: dirtyCards.length,
        testRuns: dirtyTestRuns.length,
        testRunQuestions: dirtyTestRunQuestions.length,
      },
      pulled: {
        decks: data.decks.length,
        cards: data.cards.length,
        testRuns: data.testRuns.length,
        testRunQuestions: data.testRunQuestions.length,
      },
    };
  }

  private async applyDeck(txn: SQLiteDatabase, wire: WireDeck): Promise<void> {
    const localRow = await txn.getFirstAsync<DeckRow>("SELECT * FROM decks WHERE id = ?", [
      wire.id,
    ]);
    const merged = mergeDeck(localRow ? rowToStoredDeck(localRow) : null, wire);
    if (!merged) return;
    await txn.runAsync(
      `INSERT OR REPLACE INTO decks (id, ownerId, name, parentId, createdAt, updatedAt, deletedAt, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merged.id,
        merged.ownerId,
        merged.name,
        merged.parentId,
        merged.createdAt,
        merged.updatedAt,
        merged.deletedAt,
        merged.dirty,
      ],
    );
  }

  private async applyCard(txn: SQLiteDatabase, wire: WireCard): Promise<void> {
    const localRow = await txn.getFirstAsync<CardRow>("SELECT * FROM cards WHERE id = ?", [
      wire.id,
    ]);
    const merged = mergeCard(localRow ? rowToStoredCard(localRow) : null, wire);
    if (!merged) return;
    await txn.runAsync(
      `INSERT OR REPLACE INTO cards (
        id, ownerId, deckId, front, back, alternateAnswers, answerJustifications,
        labels, keyPoints, createdAt, updatedAt,
        easeFactor, intervalDays, dueAt, reps, lapses, lastReviewedAt,
        deletedAt, dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merged.id,
        merged.ownerId,
        merged.deckId,
        merged.front,
        merged.back,
        JSON.stringify(merged.alternateAnswers ?? []),
        merged.answerJustifications ? JSON.stringify(merged.answerJustifications) : null,
        JSON.stringify(merged.labels ?? []),
        merged.keyPoints ? JSON.stringify(merged.keyPoints) : null,
        merged.createdAt,
        merged.updatedAt,
        merged.scheduling.easeFactor,
        merged.scheduling.intervalDays,
        merged.scheduling.dueAt,
        merged.scheduling.reps,
        merged.scheduling.lapses,
        merged.scheduling.lastReviewedAt,
        merged.deletedAt,
        merged.dirty,
      ],
    );
  }

  private async applyTestRun(txn: SQLiteDatabase, wire: WireTestRun): Promise<void> {
    const merged = mergeTestRun(wire);
    await txn.runAsync(
      `INSERT OR REPLACE INTO test_runs (id, ownerId, deckId, startedAt, completedAt, questionCount, correctCount, deletedAt, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merged.id,
        merged.ownerId,
        merged.deckId,
        merged.startedAt,
        merged.completedAt,
        merged.questionCount,
        merged.correctCount,
        merged.deletedAt,
        merged.dirty,
      ],
    );

    // Tombstoned run: cached question rows for it are no longer reachable on
    // this device (symmetric with SqliteTestRunRepository.deleteByDeck).
    if (wire.deletedAt !== null) {
      await txn.runAsync("DELETE FROM test_run_questions WHERE runId = ?", [wire.id]);
    }
  }

  private async applyTestRunQuestion(txn: SQLiteDatabase, wire: WireTestRunQuestion): Promise<void> {
    const localRow = await txn.getFirstAsync<TestRunQuestionRow>(
      "SELECT * FROM test_run_questions WHERE id = ?",
      [wire.id],
    );
    const merged = mergeTestRunQuestion(
      localRow ? rowToStoredTestRunQuestion(localRow) : null,
      wire,
    );
    if (!merged) return;
    await txn.runAsync(
      `INSERT OR REPLACE INTO test_run_questions (id, runId, cardId, cardFrontSnapshot, cardBackSnapshot, userAnswer, outcome, similarity, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        merged.id,
        merged.runId,
        merged.cardId,
        merged.cardFrontSnapshot,
        merged.cardBackSnapshot,
        merged.userAnswer,
        merged.outcome,
        merged.similarity ?? null,
        merged.dirty,
      ],
    );
  }
}
