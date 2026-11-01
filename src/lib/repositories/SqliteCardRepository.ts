import type { SQLiteDatabase } from "expo-sqlite";
import { getDb } from "@/lib/db";
import { rowToCard, type CardRow } from "@/lib/db/rows";
import { newId } from "@/lib/id";
import { DEFAULT_SCHEDULING_STATE } from "@/lib/scheduler";
import { notifyDirty } from "@/lib/sync/dirtyBus";
import { isCardContentPatch } from "@/lib/sync/merge";
import type { Card } from "@/lib/types";
import type { CardRepository } from "./interfaces";

/**
 * Port of DexieCardRepository onto expo-sqlite. Behavioral spec:
 * flashy/src/lib/repositories/DexieCardRepository.ts.
 *
 * Methods that participate in a cross-table cascade (deleteByDeck, called
 * from SqliteDeckRepository.delete) accept an optional executor so they can
 * run inside the caller's withExclusiveTransactionAsync transaction instead
 * of opening their own.
 */
export class SqliteCardRepository implements CardRepository {
  async getByDeck(deckId: string): Promise<Card[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<CardRow>(
      "SELECT * FROM cards WHERE deckId = ? AND deletedAt IS NULL",
      [deckId],
    );
    return rows.map(rowToCard);
  }

  async getDueCards(deckId: string | null, now: Date): Promise<Card[]> {
    const db = await getDb();
    const nowIso = now.toISOString();
    const rows =
      deckId !== null
        ? await db.getAllAsync<CardRow>(
            "SELECT * FROM cards WHERE deckId = ? AND deletedAt IS NULL AND dueAt <= ?",
            [deckId, nowIso],
          )
        : await db.getAllAsync<CardRow>(
            "SELECT * FROM cards WHERE deletedAt IS NULL AND dueAt <= ?",
            [nowIso],
          );
    return rows.map(rowToCard);
  }

  async getByDecks(deckIds: string[]): Promise<Card[]> {
    if (deckIds.length === 0) return [];
    const db = await getDb();
    const marks = deckIds.map(() => "?").join(", ");
    const rows = await db.getAllAsync<CardRow>(
      `SELECT * FROM cards WHERE deckId IN (${marks}) AND deletedAt IS NULL`,
      deckIds,
    );
    return rows.map(rowToCard);
  }

  async getDueCardsInDecks(deckIds: string[], now: Date): Promise<Card[]> {
    if (deckIds.length === 0) return [];
    const db = await getDb();
    const marks = deckIds.map(() => "?").join(", ");
    const rows = await db.getAllAsync<CardRow>(
      `SELECT * FROM cards WHERE deckId IN (${marks}) AND deletedAt IS NULL AND dueAt <= ?`,
      [...deckIds, now.toISOString()],
    );
    return rows.map(rowToCard);
  }

  async getAllByOwner(ownerId: string): Promise<Card[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<CardRow>(
      "SELECT * FROM cards WHERE ownerId = ? AND deletedAt IS NULL",
      [ownerId],
    );
    return rows.map(rowToCard);
  }

  async getById(id: string): Promise<Card | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<CardRow>(
      "SELECT * FROM cards WHERE id = ? AND deletedAt IS NULL",
      [id],
    );
    return row ? rowToCard(row) : undefined;
  }

  /** Builds the full row and INSERTs it on the given executor — shared by
   * create (own connection) and createMany (inside a transaction). */
  private async insertCard(
    executor: Pick<SQLiteDatabase, "runAsync">,
    card: Omit<Card, "id" | "createdAt" | "updatedAt">,
  ): Promise<Card> {
    const now = new Date().toISOString();
    const scheduling = card.scheduling ?? DEFAULT_SCHEDULING_STATE();
    const newCard: Card = {
      id: newId(),
      createdAt: now,
      updatedAt: now,
      ...card,
      scheduling,
    };
    await executor.runAsync(
      `INSERT INTO cards (
        id, ownerId, deckId, front, back, alternateAnswers, answerJustifications,
        labels, keyPoints, createdAt, updatedAt,
        easeFactor, intervalDays, dueAt, reps, lapses, lastReviewedAt,
        deletedAt, dirty
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
      [
        newCard.id,
        newCard.ownerId,
        newCard.deckId,
        newCard.front,
        newCard.back,
        JSON.stringify(newCard.alternateAnswers ?? []),
        newCard.answerJustifications ? JSON.stringify(newCard.answerJustifications) : null,
        JSON.stringify(newCard.labels ?? []),
        newCard.keyPoints ? JSON.stringify(newCard.keyPoints) : null,
        newCard.createdAt,
        newCard.updatedAt,
        scheduling.easeFactor,
        scheduling.intervalDays,
        scheduling.dueAt,
        scheduling.reps,
        scheduling.lapses,
        scheduling.lastReviewedAt,
      ],
    );
    return newCard;
  }

  async create(card: Omit<Card, "id" | "createdAt" | "updatedAt">): Promise<Card> {
    const db = await getDb();
    const newCard = await this.insertCard(db, card);
    notifyDirty();
    return newCard;
  }

  async createMany(cards: Omit<Card, "id" | "createdAt" | "updatedAt">[]): Promise<Card[]> {
    if (cards.length === 0) return [];
    const db = await getDb();
    const created: Card[] = [];
    // Exclusive (not plain) transaction: withTransactionAsync is documented
    // as interruptible by other async queries — a concurrent sync pull must
    // not interleave with a bulk import.
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const card of cards) {
        created.push(await this.insertCard(txn, card));
      }
    });
    notifyDirty();
    return created;
  }

  async update(
    id: string,
    patch: Partial<
      Pick<
        Card,
        | "front"
        | "back"
        | "alternateAnswers"
        | "answerJustifications"
        | "labels"
        | "keyPoints"
        | "scheduling"
      >
    >,
  ): Promise<Card> {
    const db = await getDb();
    const existing = await this.getById(id);
    if (!existing) throw new Error(`Card ${id} not found`);
    // updatedAt is the content group's LWW clock (see mergeCard) — a
    // scheduling-only patch (study/test review) must leave it untouched so a
    // concurrent remote content edit isn't judged stale and discarded.
    const updatedAt = isCardContentPatch(patch) ? new Date().toISOString() : existing.updatedAt;
    const scheduling = patch.scheduling ?? existing.scheduling;

    await db.runAsync(
      `UPDATE cards SET
        front = ?, back = ?, alternateAnswers = ?, answerJustifications = ?,
        labels = ?, keyPoints = ?,
        easeFactor = ?, intervalDays = ?, dueAt = ?, reps = ?, lapses = ?, lastReviewedAt = ?,
        updatedAt = ?, dirty = 1
      WHERE id = ?`,
      [
        patch.front ?? existing.front,
        patch.back ?? existing.back,
        JSON.stringify(patch.alternateAnswers ?? existing.alternateAnswers),
        (patch.answerJustifications ?? existing.answerJustifications)
          ? JSON.stringify(patch.answerJustifications ?? existing.answerJustifications)
          : null,
        JSON.stringify(patch.labels ?? existing.labels),
        (patch.keyPoints ?? existing.keyPoints)
          ? JSON.stringify(patch.keyPoints ?? existing.keyPoints)
          : null,
        scheduling.easeFactor,
        scheduling.intervalDays,
        scheduling.dueAt,
        scheduling.reps,
        scheduling.lapses,
        scheduling.lastReviewedAt,
        updatedAt,
        id,
      ],
    );
    notifyDirty();
    const updated = await this.getById(id);
    if (!updated) throw new Error(`Card ${id} not found`);
    return updated;
  }

  /** Soft delete: tombstoned locally, pushed to the server on next sync. */
  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync("UPDATE cards SET deletedAt = ?, dirty = 1 WHERE id = ?", [
      new Date().toISOString(),
      id,
    ]);
    notifyDirty();
  }

  async deleteByDeck(deckId: string, executor?: SQLiteDatabase): Promise<void> {
    const db = executor ?? (await getDb());
    await db.runAsync(
      "UPDATE cards SET deletedAt = ?, dirty = 1 WHERE deckId = ?",
      [new Date().toISOString(), deckId],
    );
    if (!executor) notifyDirty();
  }
}
