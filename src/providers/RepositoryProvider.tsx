import React, { createContext, useContext, type ReactNode } from "react";
import type {
  CardRepository,
  DeckRepository,
  TestRunRepository,
} from "@/lib/repositories/interfaces";
import { SqliteCardRepository } from "@/lib/repositories/SqliteCardRepository";
import { SqliteDeckRepository } from "@/lib/repositories/SqliteDeckRepository";
import { SqliteTestRunRepository } from "@/lib/repositories/SqliteTestRunRepository";

/**
 * RepositoryContext — Phase 2 seam. Mirrors
 * flashy/src/components/providers/RepositoryProvider.tsx.
 *
 * Screens obtain repositories through this context, never by constructing
 * concrete implementations directly.
 */
interface Repositories {
  cards: CardRepository;
  decks: DeckRepository;
  testRuns: TestRunRepository;
}

const RepositoryContext = createContext<Repositories | null>(null);

// Singletons — expo-sqlite's db handle is itself a lazily-opened singleton
// (see lib/db/index.ts); these wrappers are stateless.
const cardRepo = new SqliteCardRepository();
const deckRepo = new SqliteDeckRepository();
const testRunRepo = new SqliteTestRunRepository();

export function RepositoryProvider({ children }: { children: ReactNode }) {
  return (
    <RepositoryContext.Provider
      value={{ cards: cardRepo, decks: deckRepo, testRuns: testRunRepo }}
    >
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext);
  if (!ctx)
    throw new Error("useRepositories must be used inside RepositoryProvider");
  return ctx;
}
