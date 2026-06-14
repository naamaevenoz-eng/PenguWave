import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/http.js";
import type { Role } from "../db/schema.js";

/**
 * Authorization guard. Must run after `authenticate` (which sets req.user).
 * Returns 403 when the authenticated user's role is not in the allowed set.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return sendError(req, res, 401, "Authentication required");
    }
    if (!roles.includes(req.user.role)) {
      return sendError(req, res, 403, "Insufficient permissions");
    }
    next();
  };
}
