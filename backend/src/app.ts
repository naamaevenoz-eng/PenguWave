import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config.js";
import { correlationId } from "./middleware/correlationId.js";
import { loginRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { eventsRouter } from "./routes/events.js";

/**
 * Assembles the Express app. Middleware order matters:
 *   perimeter (helmet, cors) → correlation id → body/cookie parsers
 *   → rate-limited auth → routes → 404 → terminal error handler.
 */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  // 1. Security headers on every response.
  app.use(helmet());

  // 2. Restrict cross-origin access to our frontend, with credentials so the
  //    httpOnly refresh cookie can flow on the /refresh call.
  app.use(
    cors({
      origin: config.frontendUrl,
      credentials: true,
    }),
  );

  // 3. Correlation id first among our own middleware, so every response
  //    (including parser/error responses) carries one.
  app.use(correlationId);

  // 4. Parsers.
  app.use(express.json());
  app.use(cookieParser());

  // 5. Health check (unauthenticated).
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "penguwave-backend" });
  });

  // 6. Login is rate-limited ahead of the auth router (brute-force defense).
  app.use("/api/auth/login", loginRateLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/events", eventsRouter);

  // 7. Unmatched routes → standard 404.
  app.use(notFoundHandler);

  // 8. Terminal error handler — must be last.
  app.use(errorHandler);

  return app;
}
