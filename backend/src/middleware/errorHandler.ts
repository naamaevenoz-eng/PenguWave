import crypto from "node:crypto";
import type { ErrorRequestHandler, Request, Response } from "express";
import { sendError } from "../lib/http.js";

/** Standard 404 for any unmatched route. */
export function notFoundHandler(req: Request, res: Response): void {
  sendError(req, res, 404, "Not found");
}

/**
 * Terminal error handler (must be registered last). Converts anything thrown
 * upstream into the universal error shape. Internal details — stack traces, DB
 * error strings — are logged server-side with the correlationId but never sent
 * to the client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const correlationId = req.correlationId ?? crypto.randomUUID();

  // Malformed JSON bodies arrive here from express.json().
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: "Malformed JSON body", correlationId });
    return;
  }

  console.error(`[${correlationId}] Unhandled error:`, err);
  res.status(500).json({ error: "Internal server error", correlationId });
};
