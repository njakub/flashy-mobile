/**
 * Mirrors flashy/src/lib/content/markdown.ts verbatim (pure string
 * processing, no DOM deps).
 *
 * Minimal Markdown handling for card content: prose + fenced code blocks
 * only. Card.front/back stay plain strings — a fenced code block
 * (```lang\n…\n```) is just a substring convention, not a persisted format
 * flag, so old data/clients degrade to plain text for free.
 */

export interface ContentSegment {
  kind: "prose" | "code";
  text: string;
  lang?: string; // from the fence info string, lowercased; "" if none given
}

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

/** Splits text into alternating prose/code segments in source order. */
export function splitFences(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let lastIndex = 0;
  FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "prose", text: text.slice(lastIndex, match.index) });
    }
    const lang = match[1].trim().toLowerCase();
    // Strip exactly one trailing newline before the closing fence, if present,
    // so the code block doesn't carry a spurious blank last line.
    const code = match[2].endsWith("\n") ? match[2].slice(0, -1) : match[2];
    segments.push({ kind: "code", text: code, lang: lang || undefined });
    lastIndex = FENCE_RE.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "prose", text: text.slice(lastIndex) });
  }
  return segments;
}

export function hasCodeFence(text: string): boolean {
  FENCE_RE.lastIndex = 0;
  return FENCE_RE.test(text);
}

/** True when the text is entirely fenced code with no surrounding prose —
 * used to disable rather than silently no-op a "read aloud" affordance. */
export function isCodeOnly(text: string): boolean {
  const segments = splitFences(text);
  return (
    segments.length > 0 &&
    segments.some((s) => s.kind === "code") &&
    segments.every((s) => s.kind === "code" || s.text.trim() === "")
  );
}

/**
 * One-line summary for truncated list rows: fenced code collapses to a
 * `[code]` marker instead of dumping raw source into a truncated line.
 */
export function previewText(text: string): string {
  return splitFences(text)
    .map((seg) => (seg.kind === "code" ? "[code]" : seg.text))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strips comments and collapses whitespace, for tolerant code-vs-code comparison. */
export function normalizeCode(code: string): string {
  return code
    .replace(/\/\/.*$/gm, "") // line comments (//, #-style handled below)
    .replace(/#.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/\s+/g, " ")
    .trim();
}
