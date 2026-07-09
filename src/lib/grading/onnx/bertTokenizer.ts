/**
 * Pure-TS BERT WordPiece tokenizer for the bundled `all-MiniLM-L6-v2` ONNX
 * model — no deps. MiniLM uses the standard **uncased** BERT tokenizer
 * (tokenizer_config.json: do_lower_case=true, cls_token=[CLS], sep_token=
 * [SEP], pad_token=[PAD], unk_token=[UNK]), so this must lowercase + strip
 * accents to match transformers.js's tokenizer exactly (see
 * docs/plans/flashy-mobile.md "Tokenizer parity").
 *
 * Algorithm mirrors HuggingFace's BasicTokenizer + WordpieceTokenizer:
 *   1. Basic tokenization: lowercase, strip accents, split on whitespace,
 *      then split off punctuation as standalone tokens.
 *   2. WordPiece: greedy longest-match-first subword matching against the
 *      vocab, with "##" continuation-piece prefixes.
 *   3. Wrap with [CLS]/[SEP], truncate to maxLength (256) - 2 content tokens.
 */

export const CLS_TOKEN = "[CLS]";
export const SEP_TOKEN = "[SEP]";
export const PAD_TOKEN = "[PAD]";
export const UNK_TOKEN = "[UNK]";

export const MAX_SEQUENCE_LENGTH = 256;
const MAX_INPUT_CHARS_PER_WORD = 100;

export interface Vocab {
  tokenToId: Map<string, number>;
}

/** Parses vocab.txt (one token per line; line number = token id). */
export function loadVocab(vocabText: string): Vocab {
  const tokenToId = new Map<string, number>();
  const lines = vocabText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Trailing newline produces one empty final line — skip it rather than
    // registering "" as a real vocab entry at the last id.
    if (i === lines.length - 1 && lines[i] === "") continue;
    tokenToId.set(lines[i].replace(/\r$/, ""), i);
  }
  return { tokenToId };
}

/** NFD-decompose and drop combining marks (Unicode category Mn). */
function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** BERT's _is_punctuation: ASCII punctuation ranges plus the Unicode
 * punctuation/symbol categories (covers "$", "+", "^", etc. same as BERT). */
function isPunctuation(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (
    (code >= 33 && code <= 47) ||
    (code >= 58 && code <= 64) ||
    (code >= 91 && code <= 96) ||
    (code >= 123 && code <= 126)
  ) {
    return true;
  }
  return /\p{P}|\p{S}/u.test(char);
}

/** Splits a token into standalone punctuation characters and the
 * non-punctuation runs between them (BERT's _run_split_on_punc). */
function splitOnPunctuation(token: string): string[] {
  const chars = Array.from(token);
  const output: string[][] = [];
  let startNewWord = true;
  for (const char of chars) {
    if (isPunctuation(char)) {
      output.push([char]);
      startNewWord = true;
    } else {
      if (startNewWord) output.push([]);
      output[output.length - 1].push(char);
      startNewWord = false;
    }
  }
  return output.map((chars2) => chars2.join(""));
}

/** Lowercase + strip accents + whitespace/punctuation split. */
function basicTokenize(text: string): string[] {
  const cleaned = Array.from(text)
    .filter((c) => c.codePointAt(0) !== 0 && c !== "�")
    .join("");
  const whitespaceTokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => stripAccents(t.toLowerCase()));

  const output: string[] = [];
  for (const token of whitespaceTokens) {
    output.push(...splitOnPunctuation(token));
  }
  return output;
}

/** Greedy longest-match-first WordPiece subword tokenization of one basic token. */
function wordpieceTokenize(token: string, vocab: Vocab): string[] {
  const chars = Array.from(token);
  if (chars.length > MAX_INPUT_CHARS_PER_WORD) return [UNK_TOKEN];

  const outputTokens: string[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = chars.length;
    let curSubstr: string | null = null;
    while (start < end) {
      let substr = chars.slice(start, end).join("");
      if (start > 0) substr = `##${substr}`;
      if (vocab.tokenToId.has(substr)) {
        curSubstr = substr;
        break;
      }
      end--;
    }
    if (curSubstr === null) return [UNK_TOKEN];
    outputTokens.push(curSubstr);
    start = end;
  }
  return outputTokens;
}

export interface EncodedInput {
  inputIds: number[];
  attentionMask: number[];
  tokenTypeIds: number[];
}

/**
 * Encodes text for the model: [CLS] + wordpiece tokens (truncated to
 * MAX_SEQUENCE_LENGTH - 2) + [SEP]. No padding — single-sequence requests
 * only, so attentionMask is all-1s for the actual sequence length.
 */
export function encode(text: string, vocab: Vocab): EncodedInput {
  const basicTokens = basicTokenize(text);
  const wordpieceTokens = basicTokens.flatMap((t) => wordpieceTokenize(t, vocab));
  const truncated = wordpieceTokens.slice(0, MAX_SEQUENCE_LENGTH - 2);
  const tokens = [CLS_TOKEN, ...truncated, SEP_TOKEN];

  const unkId = vocab.tokenToId.get(UNK_TOKEN) ?? 0;
  const inputIds = tokens.map((t) => vocab.tokenToId.get(t) ?? unkId);

  return {
    inputIds,
    attentionMask: new Array(inputIds.length).fill(1),
    tokenTypeIds: new Array(inputIds.length).fill(0),
  };
}

/** Mean-pool token embeddings over the attention mask, then L2-normalize —
 * matches transformers.js's `pipeline(..., { pooling: "mean", normalize: true })`. */
export function meanPoolAndNormalize(
  hiddenStates: Float32Array,
  seqLen: number,
  hiddenSize: number,
  attentionMask: number[],
): Float32Array {
  const pooled = new Float32Array(hiddenSize);
  let maskSum = 0;
  for (let t = 0; t < seqLen; t++) {
    const m = attentionMask[t];
    if (m === 0) continue;
    maskSum += m;
    const base = t * hiddenSize;
    for (let h = 0; h < hiddenSize; h++) {
      pooled[h] += hiddenStates[base + h] * m;
    }
  }
  const denom = maskSum > 0 ? maskSum : 1;
  for (let h = 0; h < hiddenSize; h++) pooled[h] /= denom;

  let normSq = 0;
  for (let h = 0; h < hiddenSize; h++) normSq += pooled[h] * pooled[h];
  const norm = Math.sqrt(normSq);
  if (norm > 0) {
    for (let h = 0; h < hiddenSize; h++) pooled[h] /= norm;
  }
  return pooled;
}
