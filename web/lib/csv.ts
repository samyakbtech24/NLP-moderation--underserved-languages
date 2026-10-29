import { MAX_CSV_ROWS } from "./api";

/** Minimal CSV parser: handles quoted fields and commas inside quotes. */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    // skip completely empty trailing rows
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushCell();
    } else if (ch === "\n") {
      pushCell();
      pushRow();
    } else if (ch === "\r") {
      // ignore; handle \r\n via \n
    } else {
      cell += ch;
    }
  }
  pushCell();
  if (row.length > 1 || row[0] !== "") pushRow();
  return rows;
}

export function textsFromCsv(raw: string): { texts: string[]; column: string } {
  const rows = parseCsv(raw);
  if (rows.length === 0) throw new Error("CSV is empty.");
  const header = rows[0].map((h) => h.trim());
  const textIdx = header.findIndex((h) => h.toLowerCase() === "text");
  const useHeader = textIdx >= 0 || header.some((h) => /[a-zA-Z]/.test(h));
  const colIdx = textIdx >= 0 ? textIdx : 0;
  const column = textIdx >= 0 ? header[textIdx] : useHeader ? header[0] : "column_0";
  const dataRows = useHeader ? rows.slice(1) : rows;
  const texts = dataRows
    .map((r) => (r[colIdx] ?? "").trim())
    .filter((t) => t.length > 0)
    .slice(0, MAX_CSV_ROWS);
  if (texts.length === 0) throw new Error("No non-empty comments found.");
  return { texts, column };
}

export function resultsToCsv(
  results: { text: string; p_abusive: number; flagged: boolean }[],
): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = ["text,p_abusive,flagged"];
  for (const r of results) {
    lines.push(`${escape(r.text)},${r.p_abusive},${r.flagged}`);
  }
  return lines.join("\n");
}
