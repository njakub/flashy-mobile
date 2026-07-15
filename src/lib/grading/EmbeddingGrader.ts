/**
 * Port of flashy/src/lib/grading/EmbeddingGrader.ts onto onnxruntime-react-native
 * (web used transformers.js/WASM via a shared pipeline cache; here the ONNX
 * session + tokenizer live in ./onnx/session.ts). Grading thresholds and the
 * cosine-similarity + per-instance embedding cache logic are unchanged.
 */
import type { GradeResult } from "@/lib/types";
import type { Grader } from "./Grader";
import {
  EMBEDDING_PASS_THRESHOLD,
  EMBEDDING_FAIL_THRESHOLD,
} from "@/lib/constants";
import { embed, preloadEmbeddingSession } from "./onnx/session";

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class EmbeddingGrader implements Grader {
  private passThreshold: number;
  private failThreshold: number;

  /**
   * Per-instance embedding cache. Keys are the raw text strings; values are
   * the normalized Float32Array embeddings. Accepted-answer strings are
   * stable within a session, so they're embedded once and reused on every
   * subsequent call. Lives for the lifetime of the grader instance (one
   * TestSession) and is cleared automatically when the screen unmounts.
   */
  private embeddingCache = new Map<string, Float32Array>();

  constructor(
    passThreshold = EMBEDDING_PASS_THRESHOLD,
    failThreshold = EMBEDDING_FAIL_THRESHOLD,
  ) {
    this.passThreshold = passThreshold;
    this.failThreshold = failThreshold;
  }

  private async getCachedEmbedding(text: string): Promise<Float32Array> {
    const cached = this.embeddingCache.get(text);
    if (cached) return cached;
    const vec = await embed(text);
    this.embeddingCache.set(text, vec);
    return vec;
  }

  async grade(
    _cardFront: string,
    correctAnswers: string[],
    userAnswer: string,
  ): Promise<GradeResult> {
    if (correctAnswers.length === 0) {
      throw new Error("correctAnswers must contain at least one answer");
    }

    const [userVec, ...acceptedVecs] = await Promise.all([
      this.getCachedEmbedding(userAnswer),
      ...correctAnswers.map((a) => this.getCachedEmbedding(a)),
    ]);

    // Seed below any real cosine value (-1..1) so the best match is reported
    // even when every accepted answer scores negative.
    let bestSimilarity = -Infinity;
    let bestAnswer = correctAnswers[0];
    acceptedVecs.forEach((vec, i) => {
      const sim = cosineSimilarity(userVec, vec);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestAnswer = correctAnswers[i];
      }
    });

    let outcome: GradeResult["outcome"];
    if (bestSimilarity >= this.passThreshold) {
      outcome = "correct";
    } else if (bestSimilarity <= this.failThreshold) {
      outcome = "incorrect";
    } else {
      outcome = "ambiguous";
    }

    return { outcome, similarity: bestSimilarity, matchedAnswer: bestAnswer };
  }
}

/** Pre-warm the embedding model so the first card in test mode does not
 * incur the full load delay. Call this on TestSession screen mount. */
export function preloadEmbeddingModel(): void {
  preloadEmbeddingSession();
}
