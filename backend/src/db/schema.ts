// Canonical enums (lowercase — see design.md §3) shared by the DB layer,
// Zod validation, and serializers so there is one source of truth per dimension.
export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export const ROLES = ["admin", "analyst", "viewer"] as const;
export const USER_STATUSES = ["active", "inactive"] as const;
export const EVENT_SOURCES = ["mock", "system", "security"] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Role = (typeof ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type EventSource = (typeof EVENT_SOURCES)[number];

// DDL. Idempotent (IF NOT EXISTS) so init can run on every boot.
// Conventions: IDs are TEXT (UUIDs for users/tokens, evt-XXX for seeded events),
// timestamps are unix epoch seconds (INTEGER), booleans are 0/1 INTEGER.
// Messy-data fields (title, description, asset_*, source_ip, user_id) are nullable.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id             TEXT PRIMARY KEY,
  timestamp      INTEGER,
  severity       TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title          TEXT,
  description    TEXT,
  asset_hostname TEXT,
  asset_ip       TEXT,
  source_ip      TEXT,
  tags           TEXT NOT NULL DEFAULT '[]',
  type           TEXT NOT NULL DEFAULT 'generic',
  source         TEXT NOT NULL DEFAULT 'mock' CHECK (source IN ('mock', 'system', 'security')),
  user_id        TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events (severity);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked    INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS token_blocklist (
  jti        TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`;
