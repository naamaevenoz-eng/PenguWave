# PenguWave — Security Operations Portal

A security operations portal for monitoring security events. This repository contains the
original React + TypeScript frontend **plus a real, secure backend** (Track A) that the
frontend now talks to.

- **Frontend:** React 19 + Vite + TypeScript (`/src`)
- **Backend:** Node + Express 5 + TypeScript + SQLite (`/backend`)

---

## Quick start

You need two terminals: one for the backend API, one for the frontend.

### 1. Backend (`http://localhost:3001`)

```bash
cd backend
npm install
cp .env.example .env
# Generate two strong secrets (min 32 chars each) and paste them into .env:
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
npm run seed     # creates SQLite DB, demo users, and loads the mock events
npm run dev      # starts the API on :3001
```

### 2. Frontend (`http://localhost:5173`)

```bash
# from the repo root
npm install
npm run dev
```

Open http://localhost:5173 and sign in.

### Demo accounts (created by `npm run seed`)

| Email | Password | Role |
|---|---|---|
| `admin@penguwave.io` | `Admin123!` | admin |
| `analyst@penguwave.io` | `Analyst123!` | analyst |
| `viewer@penguwave.io` | `Viewer123!` | viewer |

> These are local development credentials only. Real secrets never live in the repo.

---

## What was built

A complete backend implementing the API contract (`docs/api_contract.md`), wired to the
existing frontend:

- **Auth & sessions** — `POST /api/auth/login`, `/logout`, `GET /api/auth/me`, and a
  `POST /api/auth/refresh` rotation endpoint.
- **Events** — `GET /api/events` (pagination) and `GET /api/events/:id`, with **role-based
  field masking**.
- **Users** — admin-only CRUD with validation and self-modification guards.
- **Audit log** — append-only, engine-enforced immutable trail of sensitive actions.
- **AI incident assistant** — `POST /api/events/:id/analyze` via AWS Bedrock (optional).

The full route/response contract and deliberate deviations are documented in
[`backend/DESIGN.md`](backend/DESIGN.md).

---

## Architecture & key decisions

### Authentication — split-token model
- **Access token:** short-lived (15 min) signed JWT, returned in the response body, held
  **in memory** by the frontend (never `localStorage`), sent as `Authorization: Bearer`.
  Because it isn't in storage, an XSS payload can't exfiltrate it; because it's a header
  (not a cookie), the operational endpoints are immune to CSRF.
- **Refresh token:** long-lived, stored in an **httpOnly cookie** scoped to
  `/api/auth/refresh` (`SameSite=Lax`, `Secure` in production). Only its SHA-256 hash is
  stored server-side, and it is **rotated** on every use (old token revoked).
- **The frontend never decodes the token.** Identity, role, and status come only from
  `GET /api/auth/me`.
- **Zero-trust authorization:** every request re-loads the user from the DB, so a disabled
  account or role change takes effect immediately — not at token expiry. Logout blocklists
  the access-token `jti` and revokes all refresh tokens.

### Authorization
- Shared SOC model: **all authenticated roles see all events**. The `viewer` role receives a
  **masked event shape** (sensitive fields — description, asset/source IPs, hostname, tags,
  source — are removed *by construction* in the serializer, not deleted after the fact).
- **Users API is admin-only** (`requireRole('admin')`). Admins cannot change their own
  role/status or delete their own account (anti-lockout guard).

### Storage
- **SQLite** (`better-sqlite3`), file-backed (`backend/data/penguwave.db`) — survives restart.
  WAL mode, foreign keys on. Schema is created idempotently on boot; data is reproducible via
  `npm run seed`.

### Validation & errors
- All input validated with **Zod**. Every error uses one shape:
  `{ "error": "...", "correlationId": "<uuid>" }`. No stack traces or DB strings leak.

### Security middleware
- **Helmet** headers, **CORS** restricted to the frontend origin (credentials enabled),
  per-request **correlation IDs**, **rate limiting** on login (5/min/IP), and a global error
  handler. A login rate-limit breach writes a `brute_force_attempt` security event into the
  dashboard itself (deduped per IP/window).

### Immutable audit log
- Sensitive actions (logins, logout, token refresh, all user mutations, AI analysis) are
  recorded append-only. **SQLite triggers reject any UPDATE/DELETE** on the table, so the
  trail is immutable at the engine level — not just by convention.

### AI incident assistant (AWS Bedrock) — optional, feature-gated
- `POST /api/events/:id/analyze` (admin/analyst only) sends the event to a Claude model on
  AWS Bedrock and returns a structured triage assessment.
- **Feature-gated:** with no AWS credentials the server still boots and the rest of the app
  works; this endpoint just returns `502`.
- **Injection defenses:** untrusted event text is sanitized, then wrapped in a
  random-salted `<event_{salt}>` tag the model is told to treat strictly as data. Output is
  validated against a strict Zod schema before reaching the client; any failure → `502`,
  never leaking provider detail.
- Configure via `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and
  `BEDROCK_MODEL_ID` in `backend/.env`.

---

## Reviewing the starter — issues found and fixed

The starter contained deliberately planted problems. All were fixed (see git history):

| Issue | Fix |
|---|---|
| Hardcoded `pw_live_sk_` API token in `src/api.ts` | Removed and scrubbed from git history; auth moved to the backend |
| Stored & reflected XSS (`innerHTML` / `dangerouslySetInnerHTML` with a no-op `sanitizeHtml`) | Render all event content as plain text (React auto-escapes); dead `sanitizeHtml` deleted |
| Plaintext passwords + hardcoded users in `UsersPage` | Removed; page is API-driven; backend never returns password hashes |
| New-user password field `type="text"` | Changed to `type="password"` |
| `DEBUG_BYPASS_AUTH` flag | Deleted; authentication is mandatory |
| `console.log(email, password)` | Removed from both `LoginModal` and `api.ts` |
| Client-trusted `localStorage` role checks | Replaced with role from `GET /api/auth/me`; routes admin-gated |

### Handling messy / real-world data
- A `CRITICAL` severity (not in the original type) is normalized to lowercase and accepted.
- Records with `null` fields (e.g. `evt-058`) are stored with nullable columns and rendered
  safely (`—`).
- A far-future timestamp (`2099`) is handled without breaking.
- The seed is **idempotent** (UPSERT by id), covering duplicate/repeat loads.

---

## What I'd do with more time
- Move the login rate-limiter and token blocklist to a shared store (Redis) for multi-instance
  deployments; set `trust proxy` for correct client IPs behind a load balancer.
- Add automated tests (the endpoints were verified manually end-to-end during development).
- Add a CSRF token to the refresh flow as belt-and-suspenders alongside `SameSite`.
- Periodic cleanup of expired blocklist/refresh rows.

---

## Project layout

```
backend/
  src/
    routes/        auth, events, users
    services/      token, user, event, audit, llm (Bedrock), securityEvent
    middleware/    authenticate, requireRole, correlationId, rateLimit, errorHandler
    schemas/       Zod validation
    serializers/   DB -> API shaping + role masking
    db/            schema (DDL + triggers), connection, seed
  DESIGN.md        full API contract, data shapes, deviations, verification checklist
src/               React frontend (auth context, pages, components)
data/              mock_events.json
docs/              original api_contract.md
```
