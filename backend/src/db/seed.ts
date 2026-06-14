import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import { db, nowEpoch } from "./index.js";
import { SEVERITIES } from "./schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MOCK_EVENTS_PATH = path.join(here, "../../../data/mock_events.json");
const BCRYPT_ROUNDS = 12;

// Demo accounts for local development. These credentials are intentionally
// documented (README) — they are not secrets, just a way to exercise each role.
const DEMO_USERS = [
  { email: "admin@penguwave.io", password: "Admin123!", role: "admin" },
  { email: "analyst@penguwave.io", password: "Analyst123!", role: "analyst" },
  { email: "viewer@penguwave.io", password: "Viewer123!", role: "viewer" },
] as const;

const SEVERITY_SET = new Set<string>(SEVERITIES);

// --- Normalizers: turn messy, real-world records into valid rows -------------

/** Lowercase + validate; coerce anything unrecognized to "info" so a bad
 *  record never breaks the load (e.g. "CRITICAL" -> "critical"). */
function normalizeSeverity(raw: unknown): { value: string; coerced: boolean } {
  const s = String(raw ?? "").toLowerCase().trim();
  if (SEVERITY_SET.has(s)) return { value: s, coerced: false };
  return { value: "info", coerced: true };
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string" && t.length > 0);
}

/** type is derived from the first tag (falls back to "generic") — gives the
 *  viewer-facing dashboard a meaningful category. */
function deriveType(tags: string[]): string {
  return tags[0] ?? "generic";
}

/** ISO 8601 string -> unix epoch seconds; null for missing/invalid timestamps. */
function toEpochSeconds(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

function nullableString(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

// --- Seeding -----------------------------------------------------------------

function seedUsers(): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, role, status, created_at, updated_at)
     VALUES (@id, @email, @password_hash, @role, 'active', @ts, @ts)`,
  );
  const ts = nowEpoch();
  let created = 0;
  for (const u of DEMO_USERS) {
    const result = insert.run({
      id: crypto.randomUUID(),
      email: u.email,
      password_hash: bcrypt.hashSync(u.password, BCRYPT_ROUNDS),
      role: u.role,
      ts,
    });
    created += result.changes; // 0 when the email already exists (idempotent)
  }
  return created;
}

function seedEvents(): { processed: number; severityCoerced: number; nullFields: number } {
  if (!fs.existsSync(MOCK_EVENTS_PATH)) {
    throw new Error(`Mock events file not found at ${MOCK_EVENTS_PATH}`);
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(MOCK_EVENTS_PATH, "utf-8"));
  if (!Array.isArray(parsed)) {
    throw new Error("mock_events.json did not contain a JSON array");
  }

  // UPSERT keyed on id: idempotent (no duplicates) AND refreshes data on re-seed.
  const upsert = db.prepare(
    `INSERT INTO events
       (id, timestamp, severity, title, description, asset_hostname, asset_ip, source_ip, tags, type, source, user_id)
     VALUES
       (@id, @timestamp, @severity, @title, @description, @asset_hostname, @asset_ip, @source_ip, @tags, @type, @source, @user_id)
     ON CONFLICT(id) DO UPDATE SET
       timestamp      = excluded.timestamp,
       severity       = excluded.severity,
       title          = excluded.title,
       description    = excluded.description,
       asset_hostname = excluded.asset_hostname,
       asset_ip       = excluded.asset_ip,
       source_ip      = excluded.source_ip,
       tags           = excluded.tags,
       type           = excluded.type,
       source         = excluded.source,
       user_id        = excluded.user_id`,
  );

  let severityCoerced = 0;
  let nullFields = 0;

  const run = db.transaction((rows: unknown[]) => {
    for (const raw of rows) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const tags = normalizeTags(r.tags);
      const severity = normalizeSeverity(r.severity);
      if (severity.coerced) severityCoerced++;

      const sourceIp = nullableString(r.sourceIp);
      const userId = nullableString(r.userId);
      const timestamp = toEpochSeconds(r.timestamp);
      if (sourceIp === null || userId === null || timestamp === null) nullFields++;

      upsert.run({
        id: nullableString(r.id) ?? `evt-gen-${crypto.randomUUID()}`,
        timestamp,
        severity: severity.value,
        title: nullableString(r.title),
        description: nullableString(r.description),
        asset_hostname: nullableString(r.assetHostname),
        asset_ip: nullableString(r.assetIp),
        source_ip: sourceIp,
        tags: JSON.stringify(tags),
        type: deriveType(tags),
        source: "mock",
        user_id: userId,
      });
    }
  });

  run(parsed);
  return { processed: parsed.length, severityCoerced, nullFields };
}

function main(): void {
  console.log("Seeding PenguWave database...");
  const usersCreated = seedUsers();
  const events = seedEvents();
  console.log(`  users:  ${usersCreated} created (${DEMO_USERS.length - usersCreated} already existed)`);
  console.log(`  events: ${events.processed} processed`);
  console.log(`          ${events.severityCoerced} severity value(s) coerced, ${events.nullFields} record(s) had null field(s)`);
  console.log("Done.");
}

main();
