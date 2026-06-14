import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config.js";
import { db, nowEpoch } from "../db/index.js";
import type { AuthUser } from "../types.js";

// --- Access tokens (short-lived, stateless, sent in the response body) -------

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: AuthUser["role"];
  jti: string;
  iss: string;
  aud: string;
}

export function signAccessToken(user: AuthUser): string {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    jti: crypto.randomUUID(),
  };
  return jwt.sign(payload, config.jwt.accessSecret, {
    algorithm: "HS256",
    expiresIn: config.jwt.accessTtl as SignOptions["expiresIn"],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}

/** Verify signature, algorithm, issuer and audience. Throws on any failure. */
export function verifyAccessToken(token: string): AccessTokenPayload & { exp: number } {
  return jwt.verify(token, config.jwt.accessSecret, {
    algorithms: ["HS256"],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  }) as AccessTokenPayload & { exp: number };
}

// --- Logout blocklist (revokes a still-valid access token by its jti) --------

export function blocklistAccessToken(jti: string, exp: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO token_blocklist (jti, expires_at, created_at) VALUES (?, ?, ?)`,
  ).run(jti, exp, nowEpoch());
}

export function isAccessTokenBlocklisted(jti: string): boolean {
  const row = db.prepare(`SELECT 1 FROM token_blocklist WHERE jti = ?`).get(jti);
  return row !== undefined;
}

// --- Refresh tokens (long-lived; signed JWT + DB hash for rotation/revoke) ---
// The raw token lives only in the httpOnly cookie. We persist a SHA-256 hash so
// the DB never holds anything replayable, and so each token can be rotated and
// revoked individually (logout, refresh) — design.md §5.

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function issueRefreshToken(userId: string): string {
  const jti = crypto.randomUUID();
  const expiresAt = nowEpoch() + config.jwt.refreshTtlDays * 24 * 60 * 60;
  const token = jwt.sign({ sub: userId, jti }, config.jwt.refreshSecret, {
    algorithm: "HS256",
    expiresIn: `${config.jwt.refreshTtlDays}d` as SignOptions["expiresIn"],
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
  db.prepare(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
  ).run(jti, userId, sha256(token), expiresAt, nowEpoch());
  return token;
}

/** Validate a refresh token end to end: signature, then the DB row must exist,
 *  be unrevoked and unexpired. Returns the owning userId, or null on any miss. */
export function verifyRefreshToken(token: string): { userId: string; jti: string } | null {
  let decoded: { sub: string; jti: string };
  try {
    decoded = jwt.verify(token, config.jwt.refreshSecret, {
      algorithms: ["HS256"],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as { sub: string; jti: string };
  } catch {
    return null;
  }
  const row = db
    .prepare(`SELECT user_id, revoked, expires_at FROM refresh_tokens WHERE token_hash = ?`)
    .get(sha256(token)) as { user_id: string; revoked: number; expires_at: number } | undefined;
  if (!row || row.revoked === 1 || row.expires_at < nowEpoch()) return null;
  return { userId: row.user_id, jti: decoded.jti };
}

export function revokeRefreshToken(jti: string): void {
  db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`).run(jti);
}

export function revokeAllRefreshTokensForUser(userId: string): void {
  db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?`).run(userId);
}
