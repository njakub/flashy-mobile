/**
 * Pure conflict-resolution logic for SyncEngine's pull-apply step — ported
 * from flashy/src/lib/sync/SyncEngine.ts's applyDeck/applyCard/
 * applyTestRunQuestion. Extracted from the SQLite read/write so the
 * decision logic (the product's correctness core — see docs/plans/
 * flashy-mobile.md "Sync engine port") is unit-testable without a real
 * database: each function takes the current local row (or null) plus the
 * wire row and returns the row to persist, or null to skip the write
 * entirely (local has raced ahead since the push and stays dirty for the
 * next cycle).
 */
import type { Card, Deck, TestRun, TestRunQuestion } from "@/lib/types";
import type { WireCard, WireDeck, WireTestRunQuestion } from "./wire";

export interface SyncMeta {
  deletedAt: string | null;
  dirty: 0 | 1;
}

export type StoredDeck = Deck & SyncMeta;
export type StoredCard = Card & SyncMeta;
export type StoredTestRun = TestRun & SyncMeta;
/** Immutable — no deletedAt of its own; only ever removed via a TestRun cascade. */
export type StoredTestRunQuestion = TestRunQuestion & { dirty: 0 | 1 };

/**
 * Whole-row last-writer-wins by updatedAt. If local raced ahead since this
 * row was pushed, skip the wire row entirely (local stays dirty:1 and
 * re-pushes next cycle); else overwrite and clear dirty.
 */
export function mergeDeck(local: StoredDeck | null, wire: WireDeck): StoredDeck | null {
  if (local && new Date(local.updatedAt).getTime() > new Date(wire.updatedAt).getTime()) {
    return null;
  }
  return {
    id: wire.id,
    ownerId: wire.ownerId,
    name: wire.name,
    // A not-yet-deployed server omits parentId — keep the local value
    // rather than flattening the hierarchy.
    parentId: wire.parentId !== undefined ? wire.parentId : (local?.parentId ?? null),
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
    deletedAt: wire.deletedAt,
    dirty: 0,
  };
}

/**
 * The card fields whose edits participate in content LWW. Writers must bump
 * updatedAt when (and ONLY when) a patch touches one of these — a
 * scheduling-only review must not advance the content clock, or mergeCard
 * below would treat a newer remote content edit as stale and discard it.
 */
export const CARD_CONTENT_FIELDS = [
  "front",
  "back",
  "alternateAnswers",
  "answerJustifications",
  "labels",
  "keyPoints",
] as const;

export function isCardContentPatch(patch: Record<string, unknown>): boolean {
  return CARD_CONTENT_FIELDS.some((field) => field in patch);
}

/**
 * Card — two independent field groups, each compared against the row's
 * CURRENT local values (not a pre-push snapshot), which is what makes
 * concurrent same-device edits race-safe:
 *   - content (front/back/alternateAnswers/answerJustifications/labels/
 *     keyPoints/updatedAt/deletedAt): stale if local.updatedAt > wire's.
 *   - scheduling: advance-only, keyed on lastReviewedAt — local wins iff
 *     local.lastReviewedAt !== null AND (wire's is null OR local's is newer).
 * dirty = contentStale || schedulingStale ? 1 : 0. If BOTH groups raced
 * ahead locally, the entire pull is skipped (no write at all).
 */
export function mergeCard(local: StoredCard | null, wire: WireCard): StoredCard | null {
  if (!local) {
    return {
      id: wire.id,
      ownerId: wire.ownerId,
      deckId: wire.deckId,
      front: wire.front,
      back: wire.back,
      alternateAnswers: wire.alternateAnswers,
      answerJustifications: wire.answerJustifications,
      labels: wire.labels,
      keyPoints: wire.keyPoints ?? [],
      createdAt: wire.createdAt,
      updatedAt: wire.updatedAt,
      deletedAt: wire.deletedAt,
      scheduling: wire.scheduling,
      dirty: 0,
    };
  }

  const contentStale = new Date(local.updatedAt).getTime() > new Date(wire.updatedAt).getTime();

  const localLastReviewed = local.scheduling.lastReviewedAt
    ? new Date(local.scheduling.lastReviewedAt).getTime()
    : null;
  const wireLastReviewed = wire.scheduling.lastReviewedAt
    ? new Date(wire.scheduling.lastReviewedAt).getTime()
    : null;
  const schedulingStale =
    localLastReviewed !== null && (wireLastReviewed === null || localLastReviewed > wireLastReviewed);

  if (contentStale && schedulingStale) return null; // fully raced ahead locally

  return {
    ...local,
    front: contentStale ? local.front : wire.front,
    back: contentStale ? local.back : wire.back,
    alternateAnswers: contentStale ? local.alternateAnswers : wire.alternateAnswers,
    answerJustifications: contentStale ? local.answerJustifications : wire.answerJustifications,
    labels: contentStale ? local.labels : wire.labels,
    // Joins the content group. wire.keyPoints is optional in this client's
    // WireCard mirror only to tolerate a not-yet-deployed server during
    // rollout — falling back to local.keyPoints in that case is "leave
    // unchanged", never a clear.
    keyPoints: contentStale ? local.keyPoints : (wire.keyPoints ?? local.keyPoints ?? []),
    updatedAt: contentStale ? local.updatedAt : wire.updatedAt,
    deletedAt: contentStale ? local.deletedAt : wire.deletedAt,
    scheduling: schedulingStale ? local.scheduling : wire.scheduling,
    dirty: contentStale || schedulingStale ? 1 : 0,
  };
}

/**
 * TestRun: always overwrite, dirty:0 — append-only history, no conflicts.
 * The tombstone cascade (deleting cached test_run_questions when
 * wire.deletedAt !== null) is a query+delete side effect, not a merge
 * decision, so SyncEngine performs it separately after calling this.
 */
export function mergeTestRun(wire: {
  id: string;
  ownerId: string;
  deckId: string;
  startedAt: string;
  completedAt: string;
  questionCount: number;
  correctCount: number;
  deletedAt: string | null;
}): StoredTestRun {
  return { ...wire, dirty: 0 };
}

/**
 * TestRunQuestion — append-only immutable: if the row exists locally, only
 * clear its dirty flag (never touch content); otherwise insert. Returns
 * null when no write is needed at all (row exists and is already clean).
 */
export function mergeTestRunQuestion(
  local: StoredTestRunQuestion | null,
  wire: WireTestRunQuestion,
): StoredTestRunQuestion | null {
  if (local) {
    return local.dirty === 1 ? { ...local, dirty: 0 } : null;
  }
  return {
    id: wire.id,
    runId: wire.runId,
    cardId: wire.cardId,
    cardFrontSnapshot: wire.cardFrontSnapshot,
    cardBackSnapshot: wire.cardBackSnapshot,
    userAnswer: wire.userAnswer,
    outcome: wire.outcome,
    similarity: wire.similarity,
    dirty: 0,
  };
}
