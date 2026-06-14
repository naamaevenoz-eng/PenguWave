import { Router, type CookieOptions } from "express";
import { config, REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from "../config.js";
import { sendError } from "../lib/http.js";
import { LoginSchema } from "../schemas/auth.js";
import { authenticate } from "../middleware/authenticate.js";
import { verifyCredentials, findAuthUserById } from "../services/userService.js";
import { recordAudit } from "../services/auditService.js";
import {
  signAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  blocklistAccessToken,
} from "../services/tokenService.js";

export const authRouter = Router();

// Refresh cookie: httpOnly (no JS access), scoped to the refresh path only,
// SameSite=Lax + Secure in production. This is why the access token (Bearer
// header) is immune to CSRF and the refresh token is tightly constrained.
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.isProduction,
  path: REFRESH_COOKIE_PATH,
  maxAge: config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
};

// POST /api/auth/login
authRouter.post("/login", (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(req, res, 400, parsed.error.issues[0]?.message ?? "Invalid request body");
  }

  const user = verifyCredentials(parsed.data.email, parsed.data.password);
  if (!user) {
    recordAudit({
      action: "auth.login.failure",
      actorEmail: parsed.data.email,
      ipAddress: req.ip,
      correlationId: req.correlationId,
    });
    return sendError(req, res, 401, "Invalid email or password");
  }
  if (user.status !== "active") {
    recordAudit({
      action: "auth.login.failure",
      actorId: user.id,
      actorEmail: user.email,
      ipAddress: req.ip,
      correlationId: req.correlationId,
      metadata: { reason: "account_disabled" },
    });
    return sendError(req, res, 403, "Account is disabled");
  }

  const token = signAccessToken(user);
  const refreshToken = issueRefreshToken(user.id);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
  recordAudit({
    action: "auth.login.success",
    actorId: user.id,
    actorEmail: user.email,
    ipAddress: req.ip,
    correlationId: req.correlationId,
  });
  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, role: user.role },
  });
});

// POST /api/auth/logout
authRouter.post("/logout", authenticate, (req, res) => {
  // Revoke the current access token (blocklist its jti until natural expiry)
  // and all refresh tokens for the user, then clear the cookie.
  if (req.accessJti && req.accessExp) {
    blocklistAccessToken(req.accessJti, req.accessExp);
  }
  if (req.user) {
    revokeAllRefreshTokensForUser(req.user.id);
  }
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  recordAudit({
    action: "auth.logout",
    actorId: req.user?.id,
    actorEmail: req.user?.email,
    ipAddress: req.ip,
    correlationId: req.correlationId,
  });
  res.status(200).json({ message: "Logged out" });
});

// GET /api/auth/me
authRouter.get("/me", authenticate, (req, res) => {
  const { id, email, role, status } = req.user!;
  res.status(200).json({ id, email, role, status });
});

// POST /api/auth/refresh — rotates the refresh token and mints a new access token.
authRouter.post("/refresh", (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!raw) {
    return sendError(req, res, 401, "Invalid or expired refresh token");
  }

  const verified = verifyRefreshToken(raw);
  if (!verified) {
    return sendError(req, res, 401, "Invalid or expired refresh token");
  }

  const user = findAuthUserById(verified.userId);
  if (!user || user.status !== "active") {
    return sendError(req, res, 401, "Invalid or expired refresh token");
  }

  // Rotation: revoke the presented token, issue a fresh pair.
  revokeRefreshToken(verified.jti);
  const newRefresh = issueRefreshToken(user.id);
  const newAccess = signAccessToken(user);
  res.cookie(REFRESH_COOKIE_NAME, newRefresh, refreshCookieOptions);
  recordAudit({
    action: "auth.token.refresh",
    actorId: user.id,
    actorEmail: user.email,
    ipAddress: req.ip,
    correlationId: req.correlationId,
  });
  res.status(200).json({ token: newAccess });
});
