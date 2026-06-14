import { z } from "zod";

// Optional pagination. Missing params fall back to sensible defaults; provided
// params are coerced from strings and bounded (limit capped at 100 per design.md §3).
export const EventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type EventsQuery = z.infer<typeof EventsQuerySchema>;
