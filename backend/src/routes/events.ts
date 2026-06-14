import { Router, type Request, type Response } from "express";
import { sendError } from "../lib/http.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { EventsQuerySchema } from "../schemas/events.js";
import { listEvents, getEventById } from "../services/eventService.js";
import { serializeEvent } from "../serializers/event.js";
import { analyzeEvent } from "../services/llmService.js";
import { recordAudit } from "../services/auditService.js";

export const eventsRouter = Router();

// Every events endpoint requires a valid Bearer token (any role).
eventsRouter.use(authenticate);

// POST /api/events/:id/analyze — AI incident triage (admin/analyst only).
// Declared before "/:id" GET is irrelevant (different method), but kept grouped
// with the param routes for clarity.
eventsRouter.post(
  "/:id/analyze",
  requireRole("admin", "analyst"),
  async (req: Request<{ id: string }>, res: Response) => {
    const event = getEventById(req.params.id);
    if (!event) {
      return sendError(req, res, 404, "Event not found");
    }
    try {
      const analysis = await analyzeEvent(event);
      recordAudit({
        action: "ai.incident.analyzed",
        actorId: req.user!.id,
        actorEmail: req.user!.email,
        targetType: "event",
        targetId: event.id,
        ipAddress: req.ip,
        correlationId: req.correlationId,
      });
      res.status(200).json(analysis);
    } catch {
      // Any AI failure (disabled, Bedrock error/timeout, invalid output) → 502.
      // Underlying provider/Zod detail is never exposed to the client.
      return sendError(req, res, 502, "AI analysis unavailable");
    }
  },
);

// GET /api/events — list with optional pagination. Empty result is a valid 200 [].
eventsRouter.get("/", (req, res) => {
  const parsed = EventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(req, res, 400, parsed.error.issues[0]?.message ?? "Invalid query parameters");
  }
  const { page, limit } = parsed.data;
  const rows = listEvents(limit, (page - 1) * limit);
  const role = req.user!.role;
  res.status(200).json(rows.map((row) => serializeEvent(row, role)));
});

// GET /api/events/:id — single event. 404 (standard envelope) when absent.
eventsRouter.get("/:id", (req, res) => {
  const row = getEventById(req.params.id);
  if (!row) {
    return sendError(req, res, 404, "Event not found");
  }
  res.status(200).json(serializeEvent(row, req.user!.role));
});
