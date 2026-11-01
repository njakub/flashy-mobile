import { getDb } from "@/lib/db";
import { rowToDeck, type DeckRow } from "@/lib/db/rows";
import { newId } from "@/lib/id";
import { notifyDirty } from "@/lib/sync/dirtyBus";
import type { Deck } from "@/lib/types";
import { subtreeIds, wouldCreateCycle } from "@/lib/decks/tree";
import type { DeckRepository } from "./interfaces";
import { SqliteCardRepository } from "./SqliteCardRepository";
import { SqliteTestRunRepository } from "./SqliteTestRunRepository";

/**
 * Port of DexieDeckRepository onto expo-sqlite. Behavioral spec (soft
 * deletes, read filters, deck-delete cascade, notifyDirty after every
 * write): flashy/src/lib/repositories/DexieDeckRepository.ts.
 */
export class SqliteDeckRepository implements DeckRepository {
  private cardRepo = new SqliteCardRepository();
  private testRunRepo = new SqliteTestRunRepository();

  async getAll(ownerId: string): Promise<Deck[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<DeckRow>(
      "SELECT * FROM decks WHERE ownerId = ? AND deletedAt IS NULL",
      [ownerId],
    );
    return rows.map(rowToDeck);
  }

  async getById(id: string): Promise<Deck | undefined> {
    const db = await getDb();
    const row = await db.getFirstAsync<DeckRow>(
      "SELECT * FROM decks WHERE id = ? AND deletedAt IS NULL",
      [id],
    );
    return row ? rowToDeck(row) : undefined;
  }

  async create(deck: Omit<Deck, "id" | "createdAt" | "updatedAt">): Promise<Deck> {
    const db = await getDb();
    const now = new Date().toISOString();
    const newDeck: Deck = { id: newId(), createdAt: now, updatedAt: now, ...deck };
    await db.runAsync(
      `INSERT INTO decks (id, ownerId, name, parentId, createdAt, updatedAt, deletedAt, dirty)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 1)`,
      [
        newDeck.id,
        newDeck.ownerId,
        newDeck.name,
        newDeck.parentId,
        newDeck.createdAt,
        newDeck.updatedAt,
      ],
    );
    notifyDirty();
    return newDeck;
  }

  async update(id: string, patch: Partial<Pick<Deck, "name" | "parentId">>): Promise<Deck> {
    const db = await getDb();
    if (patch.parentId !== undefined) {
      const deck = await this.getById(id);
      if (!deck) throw new Error(`Deck ${id} not found`);
      const all = await this.getAll(deck.ownerId);
      if (patch.parentId !== null && !all.some((d) => d.id === patch.parentId)) {
        throw new Error(`Parent deck ${patch.parentId} not found`);
      }
      if (wouldCreateCycle(all, id, patch.parentId)) {
        throw new Error("Cannot move a deck into itself or one of its sub-decks");
      }
    }
    const updatedAt = new Date().toISOString();
    // parentId can legitimately be set to NULL, so it can't use COALESCE
    // like name — the flag says whether the patch touches it at all.
    await db.runAsync(
      `UPDATE decks SET name = COALESCE(?, name),
         parentId = CASE WHEN ? THEN ? ELSE parentId END,
         updatedAt = ?, dirty = 1 WHERE id = ?`,
      [
        patch.name ?? null,
        patch.parentId !== undefined ? 1 : 0,
        patch.parentId ?? null,
        updatedAt,
        id,
      ],
    );
    const updated = await this.getById(id);
    if (!updated) throw new Error(`Deck ${id} not found`);
    notifyDirty();
    return updated;
  }

  /**
   * Soft-delete cascade: tombstones the deck and every descendant deck,
   * plus all their cards and test history locally, so every tombstone is pushed to the server on next
   * sync (the server also cascades defensively, but the client cascades
   * too so a device offline for a while still converges correctly).
   */
  async delete(id: string): Promise<void> {
    const db = await getDb();
    const deck = await this.getById(id);
    if (!deck) return;
    // Server doesn't cascade to child decks — tombstone the whole subtree
    // so each tombstone syncs (and triggers the server's per-deck cascade).
    const ids = subtreeIds(await this.getAll(deck.ownerId), id);
    const deletedAt = new Date().toISOString();
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const deckId of ids) {
        await this.cardRepo.deleteByDeck(deckId, txn);
        await this.testRunRepo.deleteByDeck(deckId, txn);
        await txn.runAsync("UPDATE decks SET deletedAt = ?, dirty = 1 WHERE id = ?", [
          deletedAt,
          deckId,
        ]);
      }
    });
    notifyDirty();
  }
}
