import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.js";

/**
 * Assembles the Express app. Phase 5 will insert the security middleware stack
 * (helmet, cors, correlationId, rate limiting, global error handler) around the
 * routes mounted here.
 */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "penguwave-backend" });
  });

  app.use("/api/auth", authRouter);

  return app;
}
