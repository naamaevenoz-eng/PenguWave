import { Router } from "express";
import { sendError } from "../lib/http.js";
import { authenticate } from "../middleware/authenticate.js";
import { EventsQuerySchema } from "../schemas/events.js";
import { listEvents, getEventById } from "../services/eventService.js";
import { serializeEvent } from "../serializers/event.js";

export const eventsRouter = Router();

// Every events endpoint requires a valid Bearer token (any role).
eventsRouter.use(authenticate);

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
