/**
 * Mobile-only tests (no web counterpart): the embedding pipeline behind
 * `embed` is native ONNX here, so these tests mock ./onnx/session and cover
 * the grading logic plus the failure path TestSession relies on for
 * degrading to self-grade.
 */
import { EmbeddingGrader } from "./EmbeddingGrader";
import { CodeAwareGrader } from "./CodeAwareGrader";
import { ConceptAwareGrader } from "./ConceptAwareGrader";
import { embed } from "./onnx/session";

jest.mock("./onnx/session", () => ({
  embed: jest.fn(),
  preloadEmbeddingSession: jest.fn(),
}));

const embedMock = embed as jest.MockedFunction<typeof embed>;

/** L2-normalizes so cosine similarity equals the plain dot product. */
function unit(...xs: number[]): Float32Array {
  const norm = Math.sqrt(xs.reduce((s, x) => s + x * x, 0));
  return Float32Array.from(xs.map((x) => x / norm));
}

function mockEmbeddings(vectors: Record<string, Float32Array>) {
  embedMock.mockImplementation(async (text: string) => {
    const vec = vectors[text];
    if (!vec) throw new Error(`no mock embedding for "${text}"`);
    return vec;
  });
}

beforeEach(() => {
  embedMock.mockReset();
});

describe("EmbeddingGrader — outcomes by threshold", () => {
  it("grades correct at/above the pass threshold", async () => {
    mockEmbeddings({ user: unit(1, 0), answer: unit(1, 0) });
    const grader = new EmbeddingGrader(0.8, 0.5);
    const result = await grader.grade("q", ["answer"], "user");
    expect(result.outcome).toBe("correct");
    expect(result.similarity).toBeCloseTo(1);
    expect(result.matchedAnswer).toBe("answer");
  });

  it("grades incorrect at/below the fail threshold", async () => {
    mockEmbeddings({ user: unit(1, 0), answer: unit(0, 1) });
    const grader = new EmbeddingGrader(0.8, 0.5);
    const result = await grader.grade("q", ["answer"], "user");
    expect(result.outcome).toBe("incorrect");
    expect(result.similarity).toBeCloseTo(0);
  });

  it("grades ambiguous between the thresholds", async () => {
    // cos = 0.6 with pass 0.8 / fail 0.5
    mockEmbeddings({ user: unit(1, 0), answer: unit(0.6, 0.8) });
    const grader = new EmbeddingGrader(0.8, 0.5);
    const result = await grader.grade("q", ["answer"], "user");
    expect(result.outcome).toBe("ambiguous");
    expect(result.similarity).toBeCloseTo(0.6);
  });
});

describe("EmbeddingGrader — best-match selection", () => {
  it("picks the highest-similarity accepted answer", async () => {
    mockEmbeddings({
      user: unit(1, 0),
      far: unit(0, 1),
      near: unit(0.9, Math.sqrt(1 - 0.81)),
    });
    const grader = new EmbeddingGrader(0.8, 0.5);
    const result = await grader.grade("q", ["far", "near"], "user");
    expect(result.matchedAnswer).toBe("near");
    expect(result.similarity).toBeCloseTo(0.9);
  });

  it("still reports the true best match when every similarity is negative", async () => {
    mockEmbeddings({
      user: unit(1, 0),
      opposite: unit(-1, 0),
      lessOpposite: unit(-0.6, 0.8),
    });
    const grader = new EmbeddingGrader(0.8, 0.5);
    const result = await grader.grade("q", ["opposite", "lessOpposite"], "user");
    expect(result.outcome).toBe("incorrect");
    expect(result.matchedAnswer).toBe("lessOpposite");
    expect(result.similarity).toBeCloseTo(-0.6);
  });
});

describe("EmbeddingGrader — validation and caching", () => {
  it("throws when correctAnswers is empty", async () => {
    const grader = new EmbeddingGrader(0.8, 0.5);
    await expect(grader.grade("q", [], "user")).rejects.toThrow(
      "correctAnswers must contain at least one answer",
    );
  });

  it("embeds each distinct string once per grader instance", async () => {
    mockEmbeddings({ user: unit(1, 0), answer: unit(1, 0), other: unit(0, 1) });
    const grader = new EmbeddingGrader(0.8, 0.5);
    await grader.grade("q", ["answer"], "user");
    await grader.grade("q", ["answer"], "other");
    const embedded = embedMock.mock.calls.map(([text]) => text);
    expect(embedded.filter((t) => t === "answer")).toHaveLength(1);
  });
});

describe("grader cascade — model failure propagates to the caller", () => {
  it("rejects through ConceptAware → CodeAware → Embedding for a plain card", async () => {
    // TestSession.submitAnswer catches this rejection and degrades to the
    // ambiguous/self-grade phase — this locks in that the error is NOT
    // swallowed anywhere in the local chain.
    embedMock.mockRejectedValue(new Error("native module unavailable"));
    const cascade = new ConceptAwareGrader(
      new CodeAwareGrader(new EmbeddingGrader(0.8, 0.5)),
    );
    await expect(cascade.grade("q", ["answer"], "user")).rejects.toThrow(
      "native module unavailable",
    );
  });
});
