import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { db, nowEpoch } from "../db/index.js";
import type { Role } from "../db/schema.js";
import type { AuthUser } from "../types.js";

const BCRYPT_ROUNDS = 12;

// A precomputed hash of a random value. We always run bcrypt.compare against
// *something* even when the user does not exist, so login timing does not
// reveal whether an email is registered (user-enumeration defense).
const DUMMY_HASH = bcrypt.hashSync("password-that-never-matches", 12);

interface UserRow extends AuthUser {
  password_hash: string;
}

/** Public projection — never selects password_hash (design.md §4). */
const PUBLIC_COLUMNS = "id, email, role, status";

export function findAuthUserById(id: string): AuthUser | undefined {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id) as
    | AuthUser
    | undefined;
}

/**
 * Verify email + password in constant-ish time.
 * Returns the user on success, or null for both "no such user" and "wrong
 * password" — the caller maps both to the same generic 401.
 */
export function verifyCredentials(email: string, password: string): AuthUser | null {
  const row = db
    .prepare(`SELECT id, email, role, status, password_hash FROM users WHERE email = ?`)
    .get(email) as UserRow | undefined;

  // Always compare to avoid leaking existence via response time.
  const ok = bcrypt.compareSync(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return null;

  return { id: row.id, email: row.email, role: row.role, status: row.status };
}

// --- Admin user management (all projections exclude password_hash) -----------

export function listUsers(): AuthUser[] {
  return db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY email`).all() as AuthUser[];
}

export function emailExists(email: string): boolean {
  return db.prepare(`SELECT 1 FROM users WHERE email = ?`).get(email) !== undefined;
}

export function createUser(email: string, password: string, role: Role): AuthUser {
  const id = crypto.randomUUID();
  const ts = nowEpoch();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run(id, email, bcrypt.hashSync(password, BCRYPT_ROUNDS), role, ts, ts);
  return { id, email, role, status: "active" };
}

/** Patch role and/or status. Returns the updated public user, or undefined if
 *  no such user exists. Unspecified fields keep their current value. */
export function updateUser(
  id: string,
  fields: { role?: Role; status?: AuthUser["status"] },
): AuthUser | undefined {
  const existing = findAuthUserById(id);
  if (!existing) return undefined;

  const role = fields.role ?? existing.role;
  const status = fields.status ?? existing.status;
  db.prepare(`UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ?`).run(
    role,
    status,
    nowEpoch(),
    id,
  );
  return { ...existing, role, status };
}

export function deleteUser(id: string): boolean {
  return db.prepare(`DELETE FROM users WHERE id = ?`).run(id).changes > 0;
}
