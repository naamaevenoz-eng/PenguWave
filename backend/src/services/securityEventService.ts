import crypto from "node:crypto";
import { db, nowEpoch } from "../db/index.js";

const DEDUPE_WINDOW_SECONDS = 60;

/**
 * Records a brute-force login attempt as a first-class security event in the
 * same events table the dashboard reads (design.md §5) — so the product
 * surfaces its own attack telemetry. De-duplicated per source IP within a short
 * window so a sustained attack produces one actionable event, not hundreds.
 */
export function recordBruteForceAttempt(sourceIp: string, correlationId?: string): void {
  const since = nowEpoch() - DEDUPE_WINDOW_SECONDS;
  const recent = db
    .prepare(
      `SELECT 1 FROM events
       WHERE type = 'brute_force_attempt' AND source_ip = ? AND timestamp >= ? LIMIT 1`,
    )
    .get(sourceIp, since);
  if (recent) return;

  db.prepare(
    `INSERT INTO events
       (id, timestamp, severity, title, description, asset_hostname, asset_ip, source_ip, tags, type, source, user_id)
     VALUES
       (@id, @timestamp, 'high', @title, @description, NULL, NULL, @source_ip, '["brute-force","authentication"]', 'brute_force_attempt', 'security', NULL)`,
  ).run({
    id: `evt-bf-${crypto.randomUUID()}`,
    timestamp: nowEpoch(),
    title: "Brute force login attempt detected",
    description: `Multiple failed login attempts detected from ${sourceIp}.` +
      (correlationId ? ` correlationId=${correlationId}` : ""),
    source_ip: sourceIp,
  });
}
