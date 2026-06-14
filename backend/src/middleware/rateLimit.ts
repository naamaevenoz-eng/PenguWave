import rateLimit from "express-rate-limit";
import { sendError } from "../lib/http.js";
import { recordBruteForceAttempt } from "../services/securityEventService.js";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

/**
 * Throttles login attempts to 5 per minute per IP. When the limit is breached
 * we both (a) write a brute_force_attempt security event to the dashboard and
 * (b) return 429 with retryAfter — design.md §2.
 */
export const loginRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    recordBruteForceAttempt(req.ip ?? "unknown", req.correlationId);
    sendError(req, res, 429, "Too many login attempts. Try again in 1 minute.", {
      retryAfter: WINDOW_MS / 1000,
    });
  },
});
