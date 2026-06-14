import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/http.js";
import { isAccessTokenBlocklisted, verifyAccessToken } from "../services/tokenService.js";
import { findAuthUserById } from "../services/userService.js";

/**
 * Guards downstream routes. On success attaches req.user (fresh from DB) plus
 * the token's jti/exp (used by logout). Any failure → 401 with the standard
 * error shape. Authorization (role checks) is handled separately by requireRole.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return sendError(req, res, 401, "Authentication required");
  }
  const token = header.slice("Bearer ".length).trim();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return sendError(req, res, 401, "Authentication required");
  }

  // Token explicitly revoked via logout.
  if (isAccessTokenBlocklisted(payload.jti)) {
    return sendError(req, res, 401, "Authentication required");
  }

  // Re-load the principal: a deleted or disabled user must not pass even with a
  // still-valid token, and role changes take effect on the next request.
  const user = findAuthUserById(payload.sub);
  if (!user || user.status !== "active") {
    return sendError(req, res, 401, "Authentication required");
  }

  req.user = user;
  req.accessJti = payload.jti;
  req.accessExp = payload.exp;
  next();
}
