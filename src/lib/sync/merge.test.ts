/**
 * Ports flashy/src/lib/sync/SyncEngine.test.ts's assertions onto the pure
 * merge functions (vitest -> jest globals). The web tests exercise
 * applyCard/applyDeck/applyTestRun/applyTestRunQuestion against a live Dexie
 * db; expo-sqlite has no in-memory/node build so the same round trip can't
 * run under Jest here — merge.ts extracts exactly the conflict-resolution
 * decision (the part these tests actually care about) so it's still fully
 * covered without a real database. SyncEngine.ts (SQL-backed) calls these
 * functions verbatim.
 */
import { mergeCard, mergeDeck, mergeTestRun, mergeTestRunQuestion } from "./merge";
import type { StoredCard, StoredDeck, StoredTestRunQuestion } from "./merge";
import type { WireCard, WireDeck, WireTestRunQuestion } from "./wire";

const SCHEDULING = {
  easeFactor: 2.5,
  intervalDays: 1,
  dueAt: "2026-01-02T00:00:00.000Z",
  reps: 1,
  lapses: 0,
};

function wireCard(overrides: Partial<WireCard> = {}): WireCard {
  return {
    id: "c1",
    ownerId: "owner",
    deckId: "deck-1",
    front: "wire-front",
    back: "wire-back",
    alternateAnswers: [],
    labels: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:10:00.000Z",
    deletedAt: null,
    rev: "10",
    scheduling: { ...SCHEDULING, lastReviewedAt: "2026-01-01T00:10:00.000Z" },
    ...overrides,
  };
}

function localCard(overrides: Partial<StoredCard> = {}): StoredCard {
  return {
    id: "c1",
    ownerId: "owner",
    deckId: "deck-1",
    front: "local-front",
    back: "local-back",
    alternateAnswers: [],
    labels: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:05:00.000Z",
    scheduling: { ...SCHEDULING, lastReviewedAt: "2026-01-01T00:05:00.000Z" },
    deletedAt: null,
    dirty: 0,
    ...overrides,
  };
}

describe("mergeCard — no local row", () => {
  it("inserts the wire row verbatim, clean (dirty: 0)", () => {
    const merged = mergeCard(null, wireCard());
    expect(merged?.front).toBe("wire-front");
    expect(merged?.dirty).toBe(0);
  });
});

describe("mergeCard — four-quadrant conflict matrix", () => {
  it("quadrant 1: neither stale locally -> wire wins outright, dirty cleared", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:00:00.000Z", // older than wire's 00:10
      scheduling: { ...SCHEDULING, lastReviewedAt: null }, // never reviewed locally
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard());
    expect(merged?.front).toBe("wire-front");
    expect(merged?.scheduling.lastReviewedAt).toBe("2026-01-01T00:10:00.000Z");
    expect(merged?.dirty).toBe(0);
  });

  it("quadrant 2: content raced ahead locally, scheduling not -> content kept local, scheduling from wire, stays dirty", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:20:00.000Z", // newer than wire's 00:10 -> content stale on wire
      scheduling: { ...SCHEDULING, lastReviewedAt: null },
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard());
    expect(merged?.front).toBe("local-front");
    expect(merged?.scheduling.lastReviewedAt).toBe("2026-01-01T00:10:00.000Z");
    expect(merged?.dirty).toBe(1);
  });

  it("quadrant 3: scheduling raced ahead locally, content not -> content from wire, scheduling kept local, stays dirty", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:00:00.000Z", // older than wire -> content not stale
      scheduling: { ...SCHEDULING, lastReviewedAt: "2026-01-01T00:30:00.000Z" },
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard());
    expect(merged?.front).toBe("wire-front");
    expect(merged?.scheduling.lastReviewedAt).toBe("2026-01-01T00:30:00.000Z");
    expect(merged?.dirty).toBe(1);
  });

  it("quadrant 4: both raced ahead locally -> entire pull is skipped, no write at all", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:20:00.000Z",
      scheduling: { ...SCHEDULING, lastReviewedAt: "2026-01-01T00:30:00.000Z" },
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard());
    expect(merged).toBeNull();
  });

  it("a card never reviewed locally (lastReviewedAt null) is never considered scheduling-stale", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:20:00.000Z", // content stale
      scheduling: { ...SCHEDULING, lastReviewedAt: null },
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard());
    expect(merged?.front).toBe("local-front");
    expect(merged?.scheduling.lastReviewedAt).toBe("2026-01-01T00:10:00.000Z");
  });
});

describe("mergeCard — keyPoints (concept-card rubric, joins the content group)", () => {
  it("wire keyPoints overwrites local when content isn't stale, including [] clearing it", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:00:00.000Z",
      scheduling: { ...SCHEDULING, lastReviewedAt: null },
      keyPoints: ["old point 1", "old point 2"],
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard({ keyPoints: [] }));
    expect(merged?.keyPoints).toEqual([]);
  });

  it("wire keyPoints overwrites local with new values when content isn't stale", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:00:00.000Z",
      scheduling: { ...SCHEDULING, lastReviewedAt: null },
      keyPoints: ["old point"],
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard({ keyPoints: ["new point 1", "new point 2"] }));
    expect(merged?.keyPoints).toEqual(["new point 1", "new point 2"]);
  });

  it("keeps local keyPoints when local content raced ahead (contentStale), still dirty", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:20:00.000Z",
      scheduling: { ...SCHEDULING, lastReviewedAt: null },
      keyPoints: ["local point"],
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard({ keyPoints: ["wire point"] }));
    expect(merged?.keyPoints).toEqual(["local point"]);
    expect(merged?.dirty).toBe(1);
  });

  it("a wire row without keyPoints (rollout shape) preserves local, doesn't null it", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:00:00.000Z",
      scheduling: { ...SCHEDULING, lastReviewedAt: null },
      keyPoints: ["local point 1", "local point 2"],
      dirty: 1,
    });
    const wire = wireCard();
    delete (wire as { keyPoints?: string[] }).keyPoints;
    const merged = mergeCard(local, wire);
    expect(merged?.keyPoints).toEqual(["local point 1", "local point 2"]);
  });

  it("keyPoints follows the content winner independently of the scheduling winner", () => {
    const local = localCard({
      updatedAt: "2026-01-01T00:00:00.000Z", // content not stale -> wire content wins
      scheduling: { ...SCHEDULING, lastReviewedAt: "2026-01-01T00:30:00.000Z" }, // scheduling stale on wire
      keyPoints: ["local point"],
      dirty: 1,
    });
    const merged = mergeCard(local, wireCard({ keyPoints: ["wire point"] }));
    expect(merged?.front).toBe("wire-front");
    expect(merged?.keyPoints).toEqual(["wire point"]);
    expect(merged?.scheduling.lastReviewedAt).toBe("2026-01-01T00:30:00.000Z");
  });

  it("a new card (no local row) defaults keyPoints to [] when the wire row omits it", () => {
    const wire = wireCard();
    delete (wire as { keyPoints?: string[] }).keyPoints;
    const merged = mergeCard(null, wire);
    expect(merged?.keyPoints).toEqual([]);
  });
});

describe("mergeDeck", () => {
  const wireDeck = (overrides: Partial<WireDeck> = {}): WireDeck => ({
    id: "d1",
    ownerId: "owner",
    name: "wire-name",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:10:00.000Z",
    deletedAt: null,
    rev: "5",
    ...overrides,
  });

  it("inserts a new deck clean", () => {
    const merged = mergeDeck(null, wireDeck());
    expect(merged?.name).toBe("wire-name");
    expect(merged?.dirty).toBe(0);
  });

  it("wire wins when local hasn't raced ahead", () => {
    const local: StoredDeck = {
      id: "d1",
      ownerId: "owner",
      name: "local-name",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      dirty: 1,
    };
    const merged = mergeDeck(local, wireDeck());
    expect(merged?.name).toBe("wire-name");
    expect(merged?.dirty).toBe(0);
  });

  it("skips the pull entirely when local raced ahead since the push", () => {
    const local: StoredDeck = {
      id: "d1",
      ownerId: "owner",
      name: "local-name",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:20:00.000Z", // newer than wire
      deletedAt: null,
      dirty: 1,
    };
    const merged = mergeDeck(local, wireDeck());
    expect(merged).toBeNull();
  });

  it("applies a tombstone (deletedAt) like any other field", () => {
    const merged = mergeDeck(null, wireDeck({ deletedAt: "2026-01-01T00:15:00.000Z" }));
    expect(merged?.deletedAt).toBe("2026-01-01T00:15:00.000Z");
  });
});

describe("mergeTestRun", () => {
  it("always overwrites, dirty cleared", () => {
    const merged = mergeTestRun({
      id: "r1",
      ownerId: "owner",
      deckId: "deck-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:01:00.000Z",
      questionCount: 2,
      correctCount: 1,
      deletedAt: null,
    });
    expect(merged.dirty).toBe(0);
    expect(merged.questionCount).toBe(2);
  });
});

describe("mergeTestRunQuestion — immutability", () => {
  const wireQuestion = (overrides: Partial<WireTestRunQuestion> = {}): WireTestRunQuestion => ({
    id: "q1",
    runId: "r1",
    cardId: "c1",
    cardFrontSnapshot: "wire-front-snapshot",
    cardBackSnapshot: "wire-back-snapshot",
    userAnswer: "wire-answer",
    outcome: "correct",
    rev: "7",
    ...overrides,
  });

  it("inserts a new question row verbatim", () => {
    const merged = mergeTestRunQuestion(null, wireQuestion());
    expect(merged?.userAnswer).toBe("wire-answer");
    expect(merged?.dirty).toBe(0);
  });

  it("leaves existing local content untouched — snapshots are immutable — but still clears a stale dirty flag", () => {
    const local: StoredTestRunQuestion = {
      id: "q1",
      runId: "r1",
      cardId: "c1",
      cardFrontSnapshot: "local-front-snapshot",
      cardBackSnapshot: "local-back-snapshot",
      userAnswer: "local-answer",
      outcome: "incorrect",
      dirty: 1,
    };
    const merged = mergeTestRunQuestion(local, wireQuestion());
    expect(merged?.userAnswer).toBe("local-answer");
    expect(merged?.outcome).toBe("incorrect");
    expect(merged?.dirty).toBe(0);
  });

  it("no write needed when the local row already exists and is clean", () => {
    const local: StoredTestRunQuestion = {
      id: "q1",
      runId: "r1",
      cardId: "c1",
      cardFrontSnapshot: "local-front-snapshot",
      cardBackSnapshot: "local-back-snapshot",
      userAnswer: "local-answer",
      outcome: "incorrect",
      dirty: 0,
    };
    const merged = mergeTestRunQuestion(local, wireQuestion());
    expect(merged).toBeNull();
  });
});
