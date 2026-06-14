import { db } from "../db/index.js";

/** Raw events row as stored in SQLite (snake_case, epoch timestamp, JSON tags). */
export interface EventRow {
  id: string;
  timestamp: number | null;
  severity: string;
  title: string | null;
  description: string | null;
  asset_hostname: string | null;
  asset_ip: string | null;
  source_ip: string | null;
  tags: string;
  type: string;
  source: string;
  user_id: string | null;
}

const COLUMNS =
  "id, timestamp, severity, title, description, asset_hostname, asset_ip, source_ip, tags, type, source, user_id";

/** Newest first. SQLite sorts NULL timestamps last under DESC, which is what
 *  we want for any records missing a timestamp. */
export function listEvents(limit: number, offset: number): EventRow[] {
  return db
    .prepare(`SELECT ${COLUMNS} FROM events ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(limit, offset) as EventRow[];
}

export function getEventById(id: string): EventRow | undefined {
  return db.prepare(`SELECT ${COLUMNS} FROM events WHERE id = ?`).get(id) as EventRow | undefined;
}
