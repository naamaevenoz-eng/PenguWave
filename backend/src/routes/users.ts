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
  findAuthUserById,
} from "../services/userService.js";
import { recordAudit } from "../services/auditService.js";

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
  recordAudit({
    action: "user.created",
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    targetType: "user",
    targetId: user.id,
    ipAddress: req.ip,
    correlationId: req.correlationId,
    metadata: { email: user.email, role: user.role },
  });
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
  // Capture old values first so we can record exactly what changed.
  const existing = findAuthUserById(req.params.id);
  if (!existing) {
    return sendError(req, res, 404, "User not found");
  }
  const updated = updateUser(req.params.id, parsed.data);
  if (!updated) {
    return sendError(req, res, 404, "User not found");
  }

  if (parsed.data.role !== undefined && parsed.data.role !== existing.role) {
    recordAudit({
      action: "user.role_changed",
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      targetType: "user",
      targetId: existing.id,
      ipAddress: req.ip,
      correlationId: req.correlationId,
      metadata: { from: existing.role, to: updated.role },
    });
  }
  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    recordAudit({
      action: "user.status_changed",
      actorId: req.user!.id,
      actorEmail: req.user!.email,
      targetType: "user",
      targetId: existing.id,
      ipAddress: req.ip,
      correlationId: req.correlationId,
      metadata: { from: existing.status, to: updated.status },
    });
  }
  res.status(200).json(updated);
});

// DELETE /api/users/:id
usersRouter.delete("/:id", (req, res) => {
  // Self-deletion guard.
  if (req.params.id === req.user!.id) {
    return sendError(req, res, 400, "Cannot delete your own account");
  }
  const existing = findAuthUserById(req.params.id);
  if (!existing) {
    return sendError(req, res, 404, "User not found");
  }
  deleteUser(req.params.id);
  recordAudit({
    action: "user.deleted",
    actorId: req.user!.id,
    actorEmail: req.user!.email,
    targetType: "user",
    targetId: existing.id,
    ipAddress: req.ip,
    correlationId: req.correlationId,
    metadata: { email: existing.email, role: existing.role },
  });
  res.status(200).json({ message: "User deleted" });
});
