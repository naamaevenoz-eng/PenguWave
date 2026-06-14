import { z } from "zod";
import { ROLES, USER_STATUSES } from "../db/schema.js";

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
});

export const UpdateUserSchema = z
  .object({
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: "At least one field (role or status) must be provided",
  });

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
