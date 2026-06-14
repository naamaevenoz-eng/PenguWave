import crypto from "node:crypto";
import { db, nowEpoch } from "../db/index.js";

export type AuditAction =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.token.refresh"
  | "user.created"
  | "user.role_changed"
  | "user.status_changed"
  | "user.deleted"
  | "ai.incident.analyzed";

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType?: "user" | "event" | "system" | null;
  targetId?: string | null;
  ipAddress?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}

// INSERT is the ONLY operation this module performs. There is intentionally no
// update or delete function — the table is append-only, and the SQLite triggers
// in schema.ts enforce that even against raw queries.
const insert = db.prepare(
  `INSERT INTO audit_logs
     (id, actor_id, actor_email, action, target_type, target_id, ip_address, correlation_id, metadata, created_at)
   VALUES
     (@id, @actor_id, @actor_email, @action, @target_type, @target_id, @ip_address, @correlation_id, @metadata, @created_at)`,
);

/** Record one audit entry. Failures here must never break the request flow, so
 *  errors are swallowed after logging (an audit write should not 500 a login). */
export function recordAudit(entry: AuditEntry): void {
  try {
    insert.run({
      id: crypto.randomUUID(),
      actor_id: entry.actorId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      ip_address: entry.ipAddress ?? null,
      correlation_id: entry.correlationId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      created_at: nowEpoch(),
    });
  } catch (err) {
    console.error("Failed to write audit log entry:", err);
  }
}
