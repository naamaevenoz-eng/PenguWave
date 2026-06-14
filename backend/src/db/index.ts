import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCHEMA_SQL } from "./schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(here, "../../data/penguwave.db");
const DB_PATH = process.env.DB_PATH ?? DEFAULT_DB_PATH;

// Ensure the data directory exists before opening the file-backed DB.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

// WAL improves read/write concurrency; foreign_keys is OFF by default in SQLite
// and must be enabled per-connection for our ON DELETE CASCADE to take effect.
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema(): void {
  db.exec(SCHEMA_SQL);
}

// Run on import so any module that touches the DB has the schema in place.
initSchema();

/** Current unix time in whole seconds — the unit used for all timestamp columns. */
export function nowEpoch(): number {
  return Math.floor(Date.now() / 1000);
}
