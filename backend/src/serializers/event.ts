import type { Role } from "../db/schema.js";
import type { EventRow } from "../services/eventService.js";

function toIso(ts: number | null): string | null {
  return ts === null ? null : new Date(ts * 1000).toISOString();
}

function parseTags(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/**
 * Maps a DB row to the API shape, applying role-based field masking (design.md §3).
 * A `viewer` receives only id, timestamp, severity, title, type — every
 * potentially sensitive field (description, asset/source IPs, hostname, tags,
 * source) is stripped server-side. Admins and analysts get the full shape.
 *
 * Masking happens here, in the serializer, so no route can accidentally leak
 * fields: the viewer object literally never contains the sensitive keys.
 */
export function serializeEvent(row: EventRow, role: Role) {
  const common = {
    id: row.id,
    timestamp: toIso(row.timestamp),
    severity: row.severity,
    title: row.title,
  };

  if (role === "viewer") {
    return { ...common, type: row.type };
  }

  return {
    ...common,
    description: row.description,
    assetHostname: row.asset_hostname,
    assetIp: row.asset_ip,
    sourceIp: row.source_ip,
    tags: parseTags(row.tags),
    type: row.type,
    source: row.source,
  };
}
