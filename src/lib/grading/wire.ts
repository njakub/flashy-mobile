/**
 * Mirrors flashy/src/lib/grading/wire.ts verbatim — wire protocol for
 * POST /grade (mirrors flashy-api's src/grade/grade.schema.ts).
 */

/** The client's embedding pre-filter verdict, sent only when the cascade
 * escalated to the LLM (the ambiguous band) — a grading-quality signal
 * recorded against the LlmUsage row. Absent when the user hit "AI grade"
 * directly without going through the cascade. */
export interface LocalSignalWire {
  outcome: "correct" | "incorrect" | "ambiguous" | "error";
  similarity?: number;
}

export interface GradeRequestBody {
  question: string;
  acceptedAnswers: string[];
  userAnswer: string;
  /** Present + non-empty only for concept cards — a rubric of things a
   * complete answer should cover; triggers concept-grading mode server-side. */
  keyPoints?: string[];
  localSignal?: LocalSignalWire;
}

export interface KeyPointCoverageWire {
  point: string;
  covered: boolean;
}

export interface GradeResponseBody {
  outcome: "correct" | "incorrect";
  rationale: string;
  /** Present only when the request carried keyPoints. */
  coverage?: KeyPointCoverageWire[];
  /** The LlmUsage row id for this call — echo it back via POST /grade/feedback
   * if the user later confirms or overrides this verdict. */
  usageId: string;
}

/** Wire protocol for POST /grade/feedback. */
export interface GradeFeedbackRequestBody {
  usageId: string;
  userVerdict: "correct" | "incorrect";
}
