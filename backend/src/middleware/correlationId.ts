import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Assigns a correlation id to every request and echoes it back in the
 * X-Correlation-Id header. An inbound id is honored only if it is a valid UUID
 * (so a client can trace a call across services) — otherwise we mint our own,
 * which also prevents log-injection via an attacker-controlled header value.
 * Must run first so every downstream response, including errors, carries it.
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header("x-correlation-id");
  const id = inbound && UUID_RE.test(inbound) ? inbound : crypto.randomUUID();
  req.correlationId = id;
  res.setHeader("X-Correlation-Id", id);
  next();
}
