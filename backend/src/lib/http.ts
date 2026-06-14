import crypto from "node:crypto";
import type { Request, Response } from "express";

/** Every error carries a correlationId (design.md §1). Prefer the request's
 *  id (set in Phase 5); fall back to a fresh uuid so the shape always holds. */
export function correlationIdOf(req: Request): string {
  return req.correlationId ?? crypto.randomUUID();
}

/** Single choke point for the universal error shape:
 *  { error, correlationId, ...extra }. No stack traces, no DB strings. */
export function sendError(
  req: Request,
  res: Response,
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): void {
  res.status(status).json({ error, correlationId: correlationIdOf(req), ...extra });
}
