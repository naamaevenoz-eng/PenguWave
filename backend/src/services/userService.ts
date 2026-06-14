import bcrypt from "bcrypt";
import { db } from "../db/index.js";
import type { AuthUser } from "../types.js";

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
