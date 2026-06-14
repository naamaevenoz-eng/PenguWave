import type { Role, UserStatus } from "./db/schema.js";

/** The authenticated principal, re-loaded fresh from the DB on every request
 *  (so role/status changes and disables take effect immediately, not at token
 *  expiry). Never trust authz claims from the token alone. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by correlationIdMiddleware (Phase 5); used in every error body. */
      correlationId?: string;
      /** Set by authenticate middleware on success. */
      user?: AuthUser;
      /** Access-token jti + expiry, used by logout to blocklist the token. */
      accessJti?: string;
      accessExp?: number;
    }
  }
}
