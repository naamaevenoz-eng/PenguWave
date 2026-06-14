import { z } from "zod";
import { SEVERITIES } from "../db/schema.js";

// The strict contract the AI output MUST satisfy. Anything that deviates
// (wrong types, missing fields, unknown severity, extra keys) is rejected by
// .parse() before it can reach the client — this is our output guardrail.
export const IncidentAnalysisSchema = z
  .object({
    summary: z.string().max(500),
    attackVector: z.string().max(300),
    severity: z.enum(SEVERITIES),
    recommendedActions: z.array(z.string().max(300)).min(1).max(10),
    confidence: z.enum(["high", "medium", "low"]),
  })
  .strict();

export type IncidentAnalysis = z.infer<typeof IncidentAnalysisSchema>;
