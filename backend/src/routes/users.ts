import { Router } from "express";
import { sendError } from "../lib/http.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRole } from "../middleware/requireRole.js";
import { CreateUserSchema, UpdateUserSchema } from "../schemas/users.js";
import {
  listUsers,
  emailExists,
  createUser,
  updateUser,
  deleteUser,
} from "../services/userService.js";

export const usersRouter = Router();

// Admin only — enforced once at the router level for every method below.
usersRouter.use(authenticate, requireRole("admin"));

// GET /api/users
usersRouter.get("/", (_req, res) => {
  res.status(200).json(listUsers());
});

// POST /api/users
usersRouter.post("/", (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, parsed.error.issues[0]?.message ?? "Invalid request body");
  }
  const { email, password, role } = parsed.data;
  if (emailExists(email)) {
    return sendError(req, res, 400, "Email already exists");
  }
  const user = createUser(email, password, role);
  res.status(201).json(user);
});

// PATCH /api/users/:id — role and/or status updates.
usersRouter.patch("/:id", (req, res) => {
  const parsed = UpdateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, parsed.error.issues[0]?.message ?? "Invalid request body");
  }
  // Self-modification guard: an admin must not change their own role or status
  // (prevents accidental privilege loss or self-lockout).
  if (req.params.id === req.user!.id) {
    return sendError(req, res, 400, "Cannot change your own role or status");
  }
  const updated = updateUser(req.params.id, parsed.data);
  if (!updated) {
    return sendError(req, res, 404, "User not found");
  }
  res.status(200).json(updated);
});

// DELETE /api/users/:id
usersRouter.delete("/:id", (req, res) => {
  // Self-deletion guard.
  if (req.params.id === req.user!.id) {
    return sendError(req, res, 400, "Cannot delete your own account");
  }
  if (!deleteUser(req.params.id)) {
    return sendError(req, res, 404, "User not found");
  }
  res.status(200).json({ message: "User deleted" });
});
