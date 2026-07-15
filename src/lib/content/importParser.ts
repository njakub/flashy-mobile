/**
 * Mobile-only (no web counterpart): parses pasted or file-picked delimited
 * text into card drafts for the import screen. Pure — no RN or repository
 * imports — so it unit-tests like the other content helpers.
 *
 * Format: one card per row; column 1 = front, column 2 = back, optional
 * column 3 = labels (split on `|` or `,`). The delimiter is sniffed per
 * input (tab > comma > semicolon); comma/semicolon rows support
 * RFC-4180-style quoting ("" escapes a quote, delimiters and newlines are
 * literal inside quotes). A leading `front<delim>back` header row is
 * dropped. Rows without a back column become errors, never cards.
 */

export interface ImportedCardDraft {
  front: string;
  back: string;
  labels: string[];
}

export interface ImportRowError {
  line: number;
  message: string;
}

export interface ParsedImport {
  cards: ImportedCardDraft[];
  errors: ImportRowError[];
}

type Delimiter = "\t" | "," | ";";

/** Any tab at all means tab-delimited (tabs don't occur in card text except
 * as the delimiter — e.g. a spreadsheet paste — while commas in prose are
 * common). Otherwise the more frequent of comma vs semicolon wins, comma on
 * ties. Quoted regions are not excluded — sniffing is a heuristic over raw
 * text. */
function sniffDelimiter(lines: string[]): Delimiter {
  let commas = 0;
  let semicolons = 0;
  for (const line of lines) {
    if (line.includes("\t")) return "\t";
    commas += line.split(",").length - 1;
    semicolons += line.split(";").length - 1;
  }
  return semicolons > commas ? ";" : ",";
}

/**
 * Splits one CSV-style record into fields. `record` may span multiple
 * source lines when a quoted field contains newlines — the caller joins
 * them before calling.
 */
function splitFields(record: string, delimiter: Delimiter): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < record.length; i++) {
    const ch = record[i];
    if (inQuotes) {
      if (ch === '"') {
        if (record[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"' && current === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Re-joins physical lines into logical records: a record with an odd
 * number of unescaped quotes continues onto the next line. */
function toRecords(lines: string[]): { text: string; line: number }[] {
  const records: { text: string; line: number }[] = [];
  let buffer: string | null = null;
  let startLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const combined: string = buffer === null ? lines[i] : `${buffer}\n${lines[i]}`;
    const quoteCount = (combined.match(/"/g) ?? []).length;
    if (quoteCount % 2 === 1) {
      if (buffer === null) startLine = i + 1;
      buffer = combined;
    } else {
      records.push({ text: combined, line: buffer === null ? i + 1 : startLine });
      buffer = null;
    }
  }
  if (buffer !== null) records.push({ text: buffer, line: startLine });
  return records;
}

function parseLabels(field: string | undefined): string[] {
  if (!field) return [];
  return field
    .split(/[|,]/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function parseImport(text: string): ParsedImport {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return { cards: [], errors: [] };

  const delimiter = sniffDelimiter(nonEmpty);
  const cards: ImportedCardDraft[] = [];
  const errors: ImportRowError[] = [];

  let first = true;
  for (const record of toRecords(lines)) {
    if (record.text.trim().length === 0) continue;
    const fields = splitFields(record.text, delimiter).map((f) => f.trim());
    if (first) {
      first = false;
      if (
        fields.length >= 2 &&
        fields[0].toLowerCase() === "front" &&
        fields[1].toLowerCase() === "back"
      ) {
        continue; // header row
      }
    }
    const [front, back, labelField] = fields;
    if (!front) {
      errors.push({ line: record.line, message: "Missing front text" });
      continue;
    }
    if (!back) {
      errors.push({ line: record.line, message: "Missing back (answer) column" });
      continue;
    }
    cards.push({ front, back, labels: parseLabels(labelField) });
  }

  return { cards, errors };
}
