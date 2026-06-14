// Shared helpers for PenguWave.

/**
 * Serialize a list of records to CSV for export.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = rows.map((r) => headers.map((h) => String(r[h] ?? "")).join(","));
  return [headers.join(","), ...lines].join("\n");
}
