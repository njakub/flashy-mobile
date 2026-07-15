import { parseImport } from "./importParser";

describe("parseImport — delimiter sniffing", () => {
  it("parses tab-separated rows (spreadsheet paste)", () => {
    const { cards, errors } = parseImport("What is 2+2?\t4\nCapital of France?\tParis");
    expect(errors).toHaveLength(0);
    expect(cards).toEqual([
      { front: "What is 2+2?", back: "4", labels: [] },
      { front: "Capital of France?", back: "Paris", labels: [] },
    ]);
  });

  it("parses comma-separated rows", () => {
    const { cards } = parseImport("front text,back text\nother front,other back");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({ front: "front text", back: "back text", labels: [] });
  });

  it("parses semicolon-separated rows", () => {
    const { cards } = parseImport("eins;one\nzwei;two");
    expect(cards).toEqual([
      { front: "eins", back: "one", labels: [] },
      { front: "zwei", back: "two", labels: [] },
    ]);
  });

  it("prefers tab when a tabbed row also contains commas", () => {
    const { cards } = parseImport("Name one, two, or three\tany of 1, 2, 3");
    expect(cards).toEqual([
      { front: "Name one, two, or three", back: "any of 1, 2, 3", labels: [] },
    ]);
  });
});

describe("parseImport — quoting", () => {
  it("keeps delimiters inside quoted fields", () => {
    const { cards } = parseImport('"List a, b, c","letters a, b, and c"');
    expect(cards).toEqual([{ front: "List a, b, c", back: "letters a, b, and c", labels: [] }]);
  });

  it("unescapes doubled quotes", () => {
    const { cards } = parseImport('"Say ""hi""",greeting');
    expect(cards).toEqual([{ front: 'Say "hi"', back: "greeting", labels: [] }]);
  });

  it("keeps newlines inside quoted fields", () => {
    const { cards, errors } = parseImport('"line one\nline two",answer\nnext,card');
    expect(errors).toHaveLength(0);
    expect(cards).toEqual([
      { front: "line one\nline two", back: "answer", labels: [] },
      { front: "next", back: "card", labels: [] },
    ]);
  });
});

describe("parseImport — header, labels, blank lines, CRLF", () => {
  it("drops a front/back header row case-insensitively", () => {
    const { cards } = parseImport("Front,Back,Labels\nq,a,");
    expect(cards).toEqual([{ front: "q", back: "a", labels: [] }]);
  });

  it("does not drop a first row that isn't a header", () => {
    const { cards } = parseImport("q1,a1\nq2,a2");
    expect(cards).toHaveLength(2);
  });

  it("splits the third column into labels on | or ,", () => {
    const tsv = "q1\ta1\tmath|easy\nq2\ta2\tscience";
    const { cards } = parseImport(tsv);
    expect(cards[0].labels).toEqual(["math", "easy"]);
    expect(cards[1].labels).toEqual(["science"]);
  });

  it("skips blank lines and handles CRLF", () => {
    const { cards, errors } = parseImport("q1\ta1\r\n\r\nq2\ta2\r\n");
    expect(errors).toHaveLength(0);
    expect(cards).toHaveLength(2);
  });

  it("returns nothing for empty/whitespace input", () => {
    expect(parseImport("")).toEqual({ cards: [], errors: [] });
    expect(parseImport("  \n \n")).toEqual({ cards: [], errors: [] });
  });
});

describe("parseImport — row errors", () => {
  it("reports rows missing the back column with their line number, without blocking valid rows", () => {
    const { cards, errors } = parseImport("q1\ta1\nonly-front\nq2\ta2");
    expect(cards).toHaveLength(2);
    expect(errors).toEqual([{ line: 2, message: "Missing back (answer) column" }]);
  });

  it("reports rows with an empty front", () => {
    const { errors } = parseImport("\tanswer only");
    expect(errors).toEqual([{ line: 1, message: "Missing front text" }]);
  });
});
