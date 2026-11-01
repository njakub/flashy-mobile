/**
 * SQLite schema, tracked via PRAGMA user_version. MIGRATIONS[i] is the SQL
 * batch that takes the database from version i to version i+1 — applied in
 * order, once, at startup (see db/index.ts's migration runner).
 *
 * Mirrors flashy/src/lib/db/index.ts's Dexie schema, flattening
 * Card.scheduling into columns (as flashy-api/prisma/schema.prisma does) so
 * dueAt is indexable; array/record fields are JSON TEXT.
 */

const MIGRATION_1 = `
CREATE TABLE decks (
  id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, name TEXT NOT NULL,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
  deletedAt TEXT, dirty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX decks_owner ON decks(ownerId);
CREATE INDEX decks_dirty ON decks(dirty);

CREATE TABLE cards (
  id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, deckId TEXT NOT NULL,
  front TEXT NOT NULL, back TEXT NOT NULL,
  alternateAnswers TEXT NOT NULL DEFAULT '[]',
  answerJustifications TEXT,
  labels TEXT NOT NULL DEFAULT '[]',
  keyPoints TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
  easeFactor REAL NOT NULL, intervalDays INTEGER NOT NULL,
  dueAt TEXT NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL,
  lastReviewedAt TEXT,
  deletedAt TEXT, dirty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX cards_deck ON cards(deckId);
CREATE INDEX cards_deck_due ON cards(deckId, dueAt);
CREATE INDEX cards_owner ON cards(ownerId);
CREATE INDEX cards_dirty ON cards(dirty);

CREATE TABLE test_runs (
  id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, deckId TEXT NOT NULL,
  startedAt TEXT NOT NULL, completedAt TEXT NOT NULL,
  questionCount INTEGER NOT NULL, correctCount INTEGER NOT NULL,
  deletedAt TEXT, dirty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX test_runs_deck ON test_runs(deckId);
CREATE INDEX test_runs_owner ON test_runs(ownerId);
CREATE INDEX test_runs_dirty ON test_runs(dirty);

CREATE TABLE test_run_questions (
  id TEXT PRIMARY KEY, runId TEXT NOT NULL, cardId TEXT NOT NULL,
  cardFrontSnapshot TEXT NOT NULL, cardBackSnapshot TEXT NOT NULL,
  userAnswer TEXT NOT NULL, outcome TEXT NOT NULL,
  similarity REAL, dirty INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX trq_run ON test_run_questions(runId);
CREATE INDEX trq_card ON test_run_questions(cardId);
CREATE INDEX trq_dirty ON test_run_questions(dirty);

CREATE TABLE sync_state (
  id TEXT PRIMARY KEY,
  decks TEXT NOT NULL, cards TEXT NOT NULL,
  testRuns TEXT NOT NULL, testRunQuestions TEXT NOT NULL
);
INSERT INTO sync_state (id, decks, cards, testRuns, testRunQuestions)
  VALUES ('cursor', '0', '0', '0', '0');
`;

// Deck nesting (Deck.parentId). Existing rows become top-level (NULL) and
// are NOT marked dirty — the server already holds them as NULL.
const MIGRATION_2 = `
ALTER TABLE decks ADD COLUMN parentId TEXT;
CREATE INDEX decks_parent ON decks(parentId);
`;

/** MIGRATIONS[i] takes the schema from version i to version i+1. */
export const MIGRATIONS: readonly string[] = [MIGRATION_1, MIGRATION_2];
