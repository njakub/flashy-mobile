import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { InferenceSession } from "onnxruntime-react-native";
import { encode, loadVocab, meanPoolAndNormalize, type Vocab } from "./bertTokenizer";

const HIDDEN_SIZE = 384; // all-MiniLM-L6-v2 embedding dimension

interface EmbeddingSession {
  ort: typeof import("onnxruntime-react-native");
  session: InferenceSession;
  vocab: Vocab;
}

let sessionPromise: Promise<EmbeddingSession> | null = null;

async function loadSession(): Promise<EmbeddingSession> {
  // onnxruntime-react-native runs a native install() call at module scope
  // (binding.ts), which is FATAL — not catchable — when the installed binary
  // lacks a matching native module (e.g. OTA-updated JS on a stale build).
  // Importing it lazily here keeps that failure inside this promise chain,
  // where callers degrade to self-grading instead of crashing the app.
  const ort = await import("onnxruntime-react-native");

  // Metro's asset resolver requires a literal, statically-analyzable
  // require() to register these as bundled assets — an ES import or
  // dynamic import() would not be discovered by the bundler.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const [modelAsset, vocabAsset] = await Promise.all([
    Asset.fromModule(require("../../../../assets/models/all-MiniLM-L6-v2-q8.onnx")).downloadAsync(),
    Asset.fromModule(require("../../../../assets/models/vocab.txt")).downloadAsync(),
  ]);
  /* eslint-enable @typescript-eslint/no-require-imports */
  if (!modelAsset.localUri || !vocabAsset.localUri) {
    throw new Error("Failed to resolve bundled embedding model/vocab asset paths");
  }
  const modelFile = new File(modelAsset.localUri);
  if (!modelFile.exists || modelFile.size === 0) {
    // Surface a JS error rather than handing a bad path to native code.
    throw new Error(`Embedding model asset missing or empty at ${modelAsset.localUri}`);
  }

  const vocabText = await new File(vocabAsset.localUri).text();
  const vocab = loadVocab(vocabText);
  // The native loader accepts file:// URIs (it strips the scheme itself).
  const session = await ort.InferenceSession.create(modelAsset.localUri);
  return { ort, session, vocab };
}

/** Lazily loaded once per process and cached — see EmbeddingGrader. */
function getSession(): Promise<EmbeddingSession> {
  if (!sessionPromise) {
    sessionPromise = loadSession().catch((err) => {
      // Allow retry on the next call rather than caching a permanent failure.
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

/** Embeds one string into a 384-dim, L2-normalized, mean-pooled vector —
 * matches transformers.js's `pipeline(text, { pooling: "mean", normalize: true })`. */
export async function embed(text: string): Promise<Float32Array> {
  const { ort, session, vocab } = await getSession();
  const { inputIds, attentionMask, tokenTypeIds } = encode(text, vocab);
  const seqLen = inputIds.length;

  const feeds = {
    input_ids: new ort.Tensor("int64", BigInt64Array.from(inputIds.map(BigInt)), [1, seqLen]),
    attention_mask: new ort.Tensor(
      "int64",
      BigInt64Array.from(attentionMask.map(BigInt)),
      [1, seqLen],
    ),
    token_type_ids: new ort.Tensor(
      "int64",
      BigInt64Array.from(tokenTypeIds.map(BigInt)),
      [1, seqLen],
    ),
  };

  const results = await session.run(feeds);
  const lastHiddenState = results.last_hidden_state.data as Float32Array;
  return meanPoolAndNormalize(lastHiddenState, seqLen, HIDDEN_SIZE, attentionMask);
}

/** Pre-warms the model + vocab so the first card in test mode doesn't incur
 * the full load delay. Call this on TestSession screen mount. */
export function preloadEmbeddingSession(): void {
  getSession().catch(() => undefined);
}
