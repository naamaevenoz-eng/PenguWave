// Shapes mirror the backend API (see backend design.md §3, §4).
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Role = "admin" | "analyst" | "viewer";
export type UserStatus = "active" | "inactive";

/**
 * A security event. Admins/analysts receive the full shape; viewers receive a
 * masked subset (only id, timestamp, severity, title, type), so the sensitive
 * fields are optional here on purpose.
 */
export interface SecurityEvent {
  id: string;
  timestamp: string | null;
  severity: Severity;
  title: string | null;
  type: string;
  description?: string | null;
  assetHostname?: string | null;
  assetIp?: string | null;
  sourceIp?: string | null;
  tags?: string[];
  source?: string;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
}

/** The current user as returned by GET /api/auth/me. */
export type AuthUser = User;
