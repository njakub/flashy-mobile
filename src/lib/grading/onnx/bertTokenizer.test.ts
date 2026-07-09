import fs from "fs";
import path from "path";
import {
  CLS_TOKEN,
  SEP_TOKEN,
  UNK_TOKEN,
  encode,
  loadVocab,
  meanPoolAndNormalize,
  type Vocab,
} from "./bertTokenizer";

/** Hand-built vocab exercising lowercasing, accent-stripping, punctuation
 * splitting, and greedy longest-match WordPiece — small enough that every
 * expected id is verifiable by inspection, unlike the real 30k-token vocab. */
function buildTestVocab(): Vocab {
  const tokens = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "hello", "world", "cafe", "!", "?", "."];
  return { tokenToId: new Map(tokens.map((t, i) => [t, i])) };
}

describe("encode — special tokens and ids", () => {
  const vocab = buildTestVocab();

  it("wraps content with [CLS] ... [SEP]", () => {
    const { inputIds } = encode("hello world", vocab);
    expect(inputIds[0]).toBe(vocab.tokenToId.get(CLS_TOKEN));
    expect(inputIds[inputIds.length - 1]).toBe(vocab.tokenToId.get(SEP_TOKEN));
  });

  it("looks up known whole-word tokens directly", () => {
    const { inputIds } = encode("hello world", vocab);
    expect(inputIds).toEqual([
      vocab.tokenToId.get(CLS_TOKEN),
      vocab.tokenToId.get("hello"),
      vocab.tokenToId.get("world"),
      vocab.tokenToId.get(SEP_TOKEN),
    ]);
  });

  it("lowercases input (uncased tokenizer)", () => {
    const upper = encode("HELLO WORLD", vocab).inputIds;
    const lower = encode("hello world", vocab).inputIds;
    expect(upper).toEqual(lower);
  });

  it("strips accents before lookup", () => {
    // "café" NFD-decomposes to c-a-f-e + combining acute accent, which strip
    // Accents removes, leaving a lookup for the plain "cafe" vocab entry.
    const { inputIds } = encode("café", vocab);
    expect(inputIds).toEqual([
      vocab.tokenToId.get(CLS_TOKEN),
      vocab.tokenToId.get("cafe"),
      vocab.tokenToId.get(SEP_TOKEN),
    ]);
  });

  it("splits punctuation into standalone tokens", () => {
    const { inputIds } = encode("hello!", vocab);
    expect(inputIds).toEqual([
      vocab.tokenToId.get(CLS_TOKEN),
      vocab.tokenToId.get("hello"),
      vocab.tokenToId.get("!"),
      vocab.tokenToId.get(SEP_TOKEN),
    ]);
  });

  it("falls back to [UNK] for a word with no matching subword", () => {
    const { inputIds } = encode("xyzzy", vocab);
    expect(inputIds).toEqual([
      vocab.tokenToId.get(CLS_TOKEN),
      vocab.tokenToId.get(UNK_TOKEN),
      vocab.tokenToId.get(SEP_TOKEN),
    ]);
  });

  it("greedy longest-match WordPiece splits an unseen word into known subwords", () => {
    // "playing" as a whole word is absent from splitVocab below, but its
    // exact prefix "play" and continuation "##ing" both are — WordPiece
    // should fall back to that two-piece split instead of [UNK].
    const vocab2: Vocab = {
      tokenToId: new Map([
        ["[PAD]", 0],
        ["[UNK]", 1],
        ["[CLS]", 2],
        ["[SEP]", 3],
        ["play", 4],
        ["##ing", 5],
        ["playing", 6], // present so we can assert whole-word wins when available
      ]),
    };
    // Remove the whole-word entry to force a split.
    const splitVocab: Vocab = {
      tokenToId: new Map(
        Array.from(vocab2.tokenToId.entries()).filter(([t]) => t !== "playing"),
      ),
    };
    const { inputIds } = encode("playing", splitVocab);
    expect(inputIds).toEqual([
      splitVocab.tokenToId.get("[CLS]"),
      splitVocab.tokenToId.get("play"),
      splitVocab.tokenToId.get("##ing"),
      splitVocab.tokenToId.get("[SEP]"),
    ]);

    const { inputIds: wholeWordIds } = encode("playing", vocab2);
    expect(wholeWordIds).toEqual([
      vocab2.tokenToId.get("[CLS]"),
      vocab2.tokenToId.get("playing"),
      vocab2.tokenToId.get("[SEP]"),
    ]);
  });

  it("attentionMask/tokenTypeIds are all-1/all-0 for the full (unpadded) sequence", () => {
    const { inputIds, attentionMask, tokenTypeIds } = encode("hello world", vocab);
    expect(attentionMask).toEqual(new Array(inputIds.length).fill(1));
    expect(tokenTypeIds).toEqual(new Array(inputIds.length).fill(0));
  });
});

describe("meanPoolAndNormalize", () => {
  it("averages only masked-in positions and L2-normalizes the result", () => {
    const hiddenSize = 4;
    const seqLen = 3;
    // token 0: [1,0,0,0], token 1: [0,1,0,0] (masked out), token 2: [1,0,0,0]
    const hidden = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
    const mask = [1, 0, 1];
    const pooled = meanPoolAndNormalize(hidden, seqLen, hiddenSize, mask);
    // Mean of [1,0,0,0] and [1,0,0,0] is [1,0,0,0]; already unit length.
    expect(pooled[0]).toBeCloseTo(1, 5);
    expect(pooled[1]).toBeCloseTo(0, 5);
    let normSq = 0;
    for (let i = 0; i < hiddenSize; i++) normSq += pooled[i] * pooled[i];
    expect(Math.sqrt(normSq)).toBeCloseTo(1, 5);
  });

  it("returns a zero vector without dividing by zero when nothing is masked in", () => {
    const pooled = meanPoolAndNormalize(new Float32Array([1, 2, 3, 4]), 1, 4, [0]);
    expect(Array.from(pooled)).toEqual([0, 0, 0, 0]);
  });
});

describe("real bundled vocab.txt (smoke test)", () => {
  const vocabPath = path.join(__dirname, "../../../../assets/models/vocab.txt");
  const vocab = loadVocab(fs.readFileSync(vocabPath, "utf-8"));

  it("loads the standard BERT special-token ids", () => {
    expect(vocab.tokenToId.get("[PAD]")).toBe(0);
    expect(vocab.tokenToId.get("[UNK]")).toBe(100);
    expect(vocab.tokenToId.get("[CLS]")).toBe(101);
    expect(vocab.tokenToId.get("[SEP]")).toBe(102);
  });

  it("tokenizes a common word as a single whole-word token", () => {
    const { inputIds } = encode("hello", vocab);
    expect(inputIds).toEqual([101, vocab.tokenToId.get("hello"), 102]);
  });

  it("produces a plausible, non-empty sequence for a full sentence", () => {
    const { inputIds, attentionMask } = encode(
      "The mitochondria is the powerhouse of the cell.",
      vocab,
    );
    expect(inputIds[0]).toBe(101);
    expect(inputIds[inputIds.length - 1]).toBe(102);
    expect(inputIds.length).toBeGreaterThan(2);
    expect(inputIds.every((id) => Number.isInteger(id))).toBe(true);
    expect(attentionMask.every((m) => m === 1)).toBe(true);
  });
});
