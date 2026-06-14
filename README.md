# PenguWave — Security Operations Portal

A security operations portal for monitoring security events. This repository takes the
original **frontend-only** PenguWave starter and turns it into a real, secure, full-stack
application: a hardened **Node + Express 5 + TypeScript + SQLite** backend (Track A), with the
existing **React 19 + Vite** frontend reconnected to it and every planted security flaw removed.

---

## Perspective & vision

A SOC analyst lives in this tool. They triage a stream of
security events under time pressure, and they trust what it shows them. That trust is the
product. So the guiding principle here was **"secure and correct first, features second"**:

- An analyst must only see what their role permits — enforced on the server, never on trust.
- Every sensitive action must be **attributable and tamper-proof** (who did what, when).
- The system must behave sanely on **messy, real-world, and hostile data** — malformed
  records, missing fields, and content crafted to attack the app or the people reading it.
- It must keep running. Optional capabilities (e.g. AI assist) must never be able to take the
  core down.

The result is a small but production-shaped system: real auth and sessions, role-based
authorization with field-level masking, persistent storage, an immutable audit trail, and an
optional AI incident assistant — all built behind a defensive middleware perimeter.

---

## How this was built — an agentic workflow

Per the "2026 way," this was built by directing a team of focused AI agents and owning every
decision and every line they produced. The work was split into four roles:

1. **Security-review agent (review-first).** Before writing anything, we swept the starter for
   vulnerabilities and bad patterns: hardcoded secrets, XSS sinks, plaintext credentials, an
   auth-bypass flag, credential logging, and client-trusted role checks. Findings drove the
   plan and are documented below.
2. **Research & threat-modeling agent.** Surveyed established prior art and standards —
   **OWASP API Security Top 10**, session/token patterns (short-lived access JWT + rotating
   refresh), bcrypt cost selection, and LLM prompt-injection defenses — to choose an approach
   rather than invent one.
3. **Architecture & planning agent.** Produced the single source of truth: a reusable
   **skill** plus **`backend/DESIGN.md`** (full route contract, data shapes, status-code
   matrix, deviations, and a pre-commit verification checklist). Every route was specified
   before it was implemented.
4. **Implementation agent.** Built the system phase by phase against the design doc.

The discipline that made this work: **one cohesive change per commit**, typecheck-clean at
every step, and **each phase verified against a running server** (not just compiled) before
moving on. Nothing shipped that couldn't be explained and demonstrated.

---

## Progress (what was delivered)

| Phase | Outcome |
|---|---|
| 0 — Review | Cataloged every planted flaw; scrubbed a leaked token from git history |
| 1–2 — Setup | Branch + TypeScript/Express/SQLite scaffold, strict tsconfig, `.env.example` |
| 3 — Data | SQLite schema + **idempotent** seed with messy-data normalization |
| 4 — Auth | login / logout / me / refresh; JWT + rotating refresh + blocklist |
| 5 — Perimeter | Helmet, CORS, correlation IDs, login rate limiting, global error handler |
| 6 — Events | list + detail, pagination, **role-based field masking** |
| 7 — Users | admin-only CRUD, Zod validation, self-modification guards |
| 8 — Audit log | append-only, **engine-enforced immutable** (SQLite triggers) |
| 8b — AI assist | `POST /events/:id/analyze` via AWS Bedrock, fully guard-railed, feature-gated |
| 10 — Frontend | reconnected to the API; **all 9 planted landmines destroyed** |
| 11 — Docs | this README + `backend/DESIGN.md`, PR, merge to `main` |

---

## Architecture

```
React (Vite, :5173)                         Express 5 API (:3001)
  AuthContext (in-memory access token)         middleware: helmet → cors → correlationId
  apiClient (auto-refresh on 401)                          → json/cookies → rateLimit → routes
  pages: Events / Users / Login                routes: auth · events · users
        │  Authorization: Bearer <jwt>         services: token · user · event · audit · llm
        │  + httpOnly refresh cookie           serializers: DB→API + role masking
        ▼                                       SQLite (better-sqlite3, WAL) — file-backed
  GET /api/auth/me  ← role/status source        tables: users · events · refresh_tokens
                                                        · token_blocklist · audit_logs(+triggers)
```

### Authentication — split-token model
- **Access token:** short-lived (15 min) signed JWT, returned in the response body, held
  **in memory** by the client (never `localStorage`) and sent as `Authorization: Bearer`.
  Not in storage → XSS can't steal it. A header, not a cookie → operational endpoints are
  **immune to CSRF**.
- **Refresh token:** long-lived, in an **httpOnly cookie** scoped to `/api/auth/refresh`
  (`SameSite=Lax`, `Secure` in prod). Only its **SHA-256 hash** is stored; it is **rotated**
  on every use (old one revoked), so a stolen refresh token has a short, single-use life.
- **The frontend never decodes the token.** Identity/role/status come only from `GET /me`.
- **Zero-trust authz:** every request **re-loads the user from the DB**, so a disable or
  role change takes effect on the *next request*, not at token expiry. Logout blocklists the
  access-token `jti` and revokes all refresh tokens.

### Authorization
- Shared-SOC model: all roles see all events, but `viewer` gets a **masked shape** —
  sensitive fields are absent **by construction** in the serializer (never added), so no route
  can accidentally leak them. Users API is **admin-only**, with anti-lockout guards.

### Storage
- **SQLite** (`better-sqlite3`), file-backed, WAL mode, FKs on. Schema created idempotently on
  boot; all data reproducible via `npm run seed`.

---

## Key decisions

| Decision | Why |
|---|---|
| Split-token (in-memory access + httpOnly rotating refresh) | Best XSS/CSRF tradeoff; instant revocation |
| Role/status re-read from DB each request | True zero-trust; immediate revocation |
| Masking in the serializer, not the route | Fields never exist on the viewer object → can't leak |
| Audit immutability via DB triggers | Append-only *at the engine*, not by convention |
| AI feature-gated (lazy cred validation) | Core boots & runs with zero AWS setup |
| Render event content as **text**, drop DOMPurify | No HTML rendering = no XSS surface to sanitize |
| Idempotent UPSERT seed | Safe re-runs; handles duplicate/updated records |
| `correlationId` on every response & error | Traceability without leaking internals |

Deliberate deviations from the original contract (refresh endpoint, `correlationId` field,
event `type`/`source`, `retryAfter`) are catalogued in `backend/DESIGN.md`.

---

## Techniques

- **bcrypt** password hashing (cost 12) with a **timing-safe** compare even for unknown users
  (no user-enumeration via response time).
- **JWT** (HS256, explicit `algorithms` allow-list, issuer/audience pinned).
- **Zod** validation on every input — and on the AI's *output*.
- **Salt-prompting** for the LLM: a random per-request token names the `<event_{salt}>`
  delimiter so injected log text can't forge instructions; output is strictly schema-validated.
- **Defense-in-depth:** frontend hides admin UI **and** the backend enforces `requireRole`.
- **Brute-force telemetry:** a login rate-limit breach writes a real `brute_force_attempt`
  event into the dashboard (deduped per IP/window).
- **Correlation IDs** with UUID validation on inbound values (log-injection defense).

### AI guardrails — salt-prompting & the LLM-as-a-judge pattern

The AI incident assistant treats event content as **untrusted input**, because a security
event's description can itself be adversarial (e.g. a phishing body, or text crafted to hijack
the model — *indirect prompt injection*). Two ideas defend it:

- **Salt-prompting.** Each request generates a random per-request token (the "salt") and wraps
  the untrusted event in `<event_{salt}> … </event_{salt}>` tags. The system prompt declares
  that everything inside those tags is **data, never instructions**, and to ignore any text
  that tries to change behavior. Because the salt is unguessable, injected log text **cannot
  close the tag or forge a trusted instruction boundary** — a classic delimiter attack
  (`"</event>" + new instructions`) fails since it doesn't know the salt. A
  `sanitizeForPrompt()` pass first strips control chars and `<>{}` so the content can't even
  attempt to mimic the delimiters. This is *input-side* defense.

- **LLM-as-a-judge.** The complementary *output-side* pattern: run a **second** model call
  whose only job is to score the first model's response — "is this on-topic, safe, and free of
  injected instructions?" — and reject anything that fails. It's powerful but doubles latency
  and cost and adds another fallible model in the loop.

  **Our choice:** for this scope we use **strict Zod schema validation as a deterministic
  stand-in for the judge.** The model is required to return raw JSON; we parse it and validate
  against `IncidentAnalysisSchema` with `.strict()` — exact field set, bounded string lengths,
  enum-checked `severity`/`confidence`, 1–10 actions. Anything off-contract (wrong types,
  extra keys, smuggled prose, an injected payload that isn't valid analysis) is **rejected
  before the client ever sees it**, and the request fails closed with a `502` — no raw model
  output is forwarded. This is cheaper and fully deterministic; a true second-model LLM judge
  is the natural **"with more time"** upgrade for catching subtler, schema-valid manipulation.

---

## Time complexity & performance

The data layer is built around indexed/primary-key access, so the hot paths are cheap:

| Operation | Complexity | Notes |
|---|---|---|
| Login credential lookup | **O(1)** | unique index on `email`; bcrypt is the deliberate cost |
| `authenticate` per request | **O(1)** | PK lookup on `users` + PK lookup on blocklist |
| Token refresh / blocklist check | **O(1)** | unique index on `token_hash`, PK on `jti` |
| `GET /events` (list) | **O(limit)** | `ORDER BY timestamp` is indexed; capped at 100/page |
| `GET /events/:id`, user CRUD | **O(1)** | primary-key access |
| Serialization / masking | **O(n · f)** | n rows × fields — linear, unavoidable |
| Frontend search/filter | **O(n)** | client-side over the current page (≤100) |

bcrypt at cost 12 is intentionally the most expensive step (≈100–250 ms) — that cost is the
brute-force defense, not a bottleneck. WAL mode keeps reads non-blocking against writes.

---

## Challenges (and how they were solved)

- **A secret already in git history.** The leaked `pw_live_sk_` token wasn't just in the
  working tree — it was in the baseline commit. Fixed by rewriting that commit and
  force-pushing a clean `main`; documented that for a *real* secret the only true remediation
  is rotation (it can persist in clones/caches).
- **ESM + TypeScript friction.** `"type": "module"` requires `.js` import specifiers that
  resolve to `.ts`; chose `tsx` as the runner and matched `tsconfig` so dev and build agree.
- **Express 5 typing.** Extra middleware in `.post(path, requireRole(...), handler)` widened
  param inference; fixed by typing the handler's params (`Request<{ id: string }>`).
- **Contract vs. reality mismatches.** The data carried an uppercase `CRITICAL` (not in the
  type), `null` fields, and a year-2099 timestamp; normalized severity to lowercase, made
  columns nullable, and rendered missing values safely.
- **Masked-shape typing.** Viewer events omit fields, so the frontend type makes them optional
  and every render guards them.
- **WAL sidecars almost committed.** `*.db` didn't match `*.db-wal`/`-shm`; tightened
  `.gitignore` before they could be tracked.
- **AI happy-path is untestable here.** No AWS creds in this environment, so the Bedrock
  round-trip is structured to the documented Anthropic-on-Bedrock format and the 403/404/502
  boundaries are verified; the success path is validated once real creds are in `.env`.

---

## Security review — planted issues found and fixed

| Issue | Fix |
|---|---|
| Hardcoded `pw_live_sk_` token in `src/api.ts` | Removed + scrubbed from history; auth moved server-side |
| Stored & reflected XSS (`innerHTML` / `dangerouslySetInnerHTML`, no-op `sanitizeHtml`) | Render as plain text; dead helper deleted |
| Plaintext passwords + hardcoded users in `UsersPage` | API-driven; backend never returns hashes |
| New-user password field `type="text"` | Changed to `type="password"` |
| `DEBUG_BYPASS_AUTH` flag | Deleted; auth is mandatory |
| `console.log(email, password)` | Removed from `LoginModal` and `api.ts` |
| Client-trusted `localStorage` role checks | Role from `GET /api/auth/me`; routes guarded |

### Messy-data handling
`CRITICAL`→`critical` normalization · nullable fields (e.g. `evt-058`) · year-2099 timestamp
· idempotent UPSERT seed (duplicates/updates).

---

## Quick start

Two terminals.

**Backend (`:3001`)**
```bash
cd backend
npm install
cp .env.example .env
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
# paste both into .env, then:
npm run seed
npm run dev
```

**Frontend (`:5173`)**
```bash
npm install
npm run dev
```

Open http://localhost:5173.

| Role | Email | Password |
|---|---|---|
| admin | `admin@penguwave.io` | `Admin123!` |
| analyst | `analyst@penguwave.io` | `Analyst123!` |
| viewer | `viewer@penguwave.io` | `Viewer123!` |

> Local dev credentials only. Real secrets never live in the repo; `.env` is git-ignored.
> The AI assistant is optional — add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
> `AWS_REGION`, `BEDROCK_MODEL_ID` to `backend/.env` to enable `POST /events/:id/analyze`.

---

## What I'd do with more time
- Move the rate-limiter and token blocklist to a shared store (Redis); set `trust proxy`.
- Automated test suite (endpoints were verified manually, end to end).
- CSRF token on the refresh flow as belt-and-suspenders alongside `SameSite`.
- Background cleanup of expired blocklist/refresh rows.

---

## Project layout
```
backend/
  src/
    routes/        auth · events · users
    services/      token · user · event · audit · llm (Bedrock) · securityEvent
    middleware/    authenticate · requireRole · correlationId · rateLimit · errorHandler
    schemas/       Zod validation
    serializers/   DB → API shaping + role masking
    db/            schema (DDL + triggers) · connection · seed
  DESIGN.md        full API contract, data shapes, deviations, verification checklist
src/               React frontend (auth context · pages · components)
data/              mock_events.json
docs/              original api_contract.md
```
