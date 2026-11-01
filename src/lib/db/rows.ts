import type { Card, Deck, TestRun, TestRunQuestion } from "@/lib/types";

/**
 * Raw SQLite row shapes (see schema.ts) and the mapping to/from the public
 * domain types in @/lib/types. Card.scheduling is flattened into columns;
 * array/record fields are stored as JSON TEXT.
 */

export interface DeckRow {
  id: string;
  ownerId: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  dirty: 0 | 1;
}

export interface CardRow {
  id: string;
  ownerId: string;
  deckId: string;
  front: string;
  back: string;
  alternateAnswers: string;
  answerJustifications: string | null;
  labels: string;
  keyPoints: string | null;
  createdAt: string;
  updatedAt: string;
  easeFactor: number;
  intervalDays: number;
  dueAt: string;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
  deletedAt: string | null;
  dirty: 0 | 1;
}

export interface TestRunRow {
  id: string;
  ownerId: string;
  deckId: string;
  startedAt: string;
  completedAt: string;
  questionCount: number;
  correctCount: number;
  deletedAt: string | null;
  dirty: 0 | 1;
}

export interface TestRunQuestionRow {
  id: string;
  runId: string;
  cardId: string;
  cardFrontSnapshot: string;
  cardBackSnapshot: string;
  userAnswer: string;
  outcome: string;
  similarity: number | null;
  dirty: 0 | 1;
}

export function rowToDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    parentId: row.parentId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function rowToCard(row: CardRow): Card {
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
    keyPoints:
      row.keyPoints !== null ? (JSON.parse(row.keyPoints) as string[]) : undefined,
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
  };
}

export function rowToTestRun(row: TestRunRow): TestRun {
  return {
    id: row.id,
    ownerId: row.ownerId,
    deckId: row.deckId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    questionCount: row.questionCount,
    correctCount: row.correctCount,
  };
}

export function rowToTestRunQuestion(row: TestRunQuestionRow): TestRunQuestion {
  return {
    id: row.id,
    runId: row.runId,
    cardId: row.cardId,
    cardFrontSnapshot: row.cardFrontSnapshot,
    cardBackSnapshot: row.cardBackSnapshot,
    userAnswer: row.userAnswer,
    outcome: row.outcome as "correct" | "incorrect",
    similarity: row.similarity ?? undefined,
  };
}
