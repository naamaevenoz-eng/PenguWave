# PenguWave Backend — Design Document
> Single source of truth. Verify every route, response shape, and status code against this document before committing.

---

## How to Use This Document

Before writing any route handler, find its entry in this document.
Before committing, run through the **Verification Checklist** at the bottom.
Any deliberate deviation from the contract must be noted in the **Deviations** section.

---

## 1. Global Conventions

### Base URL
```
http://localhost:3001
```

### Authentication mechanism
All protected endpoints expect:
```
Authorization: Bearer <access_token>
```
The access token is a signed JWT (HS256), returned by `POST /api/auth/login`.

### Universal error shape
Every error response — without exception — must match:
```json
{ "error": "Human-readable message", "correlationId": "uuid-v4" }
```
`correlationId` comes from `req.correlationId` set by `correlationIdMiddleware`.

### Status code contract

| Code | Meaning | When to use |
|------|---------|-------------|
| `200` | OK | Successful GET, PATCH, DELETE |
| `201` | Created | Successful POST that creates a resource |
| `400` | Bad Request | Validation failure (Zod), malformed body |
| `401` | Unauthenticated | Missing token, invalid token, revoked token |
| `403` | Forbidden | Valid token but wrong role |
| `404` | Not Found | Resource does not exist |
| `429` | Rate Limited | Login rate limit exceeded |
| `500` | Server Error | Unhandled exception — generic message only |
| `502` | Bad Gateway | AI analysis call failed or returned invalid output |

### ID format
All resource IDs are **UUIDs** (hex randomblob, not sequential integers).
Rationale: OWASP API1:2023 — sequential IDs enable IDOR/BOLA attacks.

### Field naming convention
- API responses use **camelCase** (matching frontend TypeScript types)
- DB columns use **snake_case** (SQLite convention)
- Mapping happens in the route handler or a serializer function

---

## 2. Authentication Endpoints

### POST /api/auth/login

| Property | Value |
|----------|-------|
| Auth required | No |
| Rate limited | Yes — 5 requests / 60 seconds per IP |
| Rate limit breach | Writes `security.brute_force_detected` event to DB |

**Request body:**
```json
{ "email": "string", "password": "string" }
```

**Zod schema (LoginSchema):**
```typescript
z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})
```

**Success response — 200:**
```json
{
  "token": "<jwt_access_token>",
  "user": {
    "id":    "uuid",
    "email": "string",
    "role":  "admin | analyst | viewer"
  }
}
```
Side effects:
- Sets `refreshToken` httpOnly cookie (path: `/api/auth/refresh`, 7 days)
- Writes `auth.login.success` to audit_log

**Error responses:**
```json
401: { "error": "Invalid email or password", "correlationId": "..." }
```
> ⚠️ Same message for wrong email AND wrong password — prevents user enumeration.
> Always run `bcrypt.compare()` even when the user does not exist.

```json
429: { "error": "Too many login attempts. Try again in 1 minute.", "correlationId": "...", "retryAfter": 60 }
```

---

### POST /api/auth/logout

| Property | Value |
|----------|-------|
| Auth required | Yes (Bearer token) |
| Role required | Any authenticated role |

**Request:** No body. Authorization header required.

**Success response — 200:**
```json
{ "message": "Logged out" }
```
Side effects:
- Adds access token `jti` to `token_blocklist` table
- Sets all refresh tokens for user to `revoked = 1`
- Clears `refreshToken` cookie
- Writes `auth.logout` to audit_log

---

### GET /api/auth/me

| Property | Value |
|----------|-------|
| Auth required | Yes (Bearer token) |
| Role required | Any authenticated role |

**Success response — 200:**
```json
{
  "id":     "uuid",
  "email":  "string",
  "role":   "admin | analyst | viewer",
  "status": "active | inactive"
}
```

**Error responses:**
```json
401: { "error": "Authentication required", "correlationId": "..." }
```

---

### POST /api/auth/refresh
> Added — not in the original contract. Documented as a deliberate extension.

| Property | Value |
|----------|-------|
| Auth required | No — uses httpOnly cookie |
| Cookie required | `refreshToken` |

**Request:** No body. Requires `refreshToken` cookie.

**Success response — 200:**
```json
{ "token": "<new_jwt_access_token>" }
```
Side effects:
- Old refresh token marked `revoked = 1`
- New refresh token stored (hash only), new cookie set
- Writes `auth.token.refresh` to audit_log

**Error responses:**
```json
401: { "error": "Invalid or expired refresh token", "correlationId": "..." }
```

---

## 3. Events Endpoints

All events endpoints require a valid Bearer token. No exceptions.

### Event object shape

This is the canonical shape returned by both list and single-item endpoints.

**Full shape (admin + analyst):**
```json
{
  "id":            "string — matches evt-XXX format from mock data",
  "timestamp":     "ISO 8601 string — e.g. 2025-02-18T14:32:01Z",
  "severity":      "critical | high | medium | low | info",
  "title":         "string | null",
  "description":   "string | null",
  "assetHostname": "string | null",
  "assetIp":       "string | null",
  "sourceIp":      "string | null",
  "tags":          ["string", ...],
  "type":          "string",
  "source":        "mock | system | security"
}
```

**Filtered shape (viewer role only):**
```json
{
  "id":        "string",
  "timestamp": "ISO 8601 string",
  "severity":  "critical | high | medium | low | info",
  "title":     "string | null",
  "type":      "string"
}
```
> Fields removed for viewer: `description`, `assetHostname`, `assetIp`, `sourceIp`, `tags`, `metadata`, `source`.

**DB → API field mapping:**
| DB column | API field |
|-----------|-----------|
| `asset_hostname` | `assetHostname` |
| `asset_ip` | `assetIp` |
| `source_ip` | `sourceIp` |
| `timestamp` (unix int) | `timestamp` (ISO string) |
| `tags` (JSON string) | `tags` (parsed array) |

> Conversion must happen in the route handler before sending the response.
> `tags` is stored as a JSON string in SQLite — always `JSON.parse()` before returning.
> `timestamp` is stored as unix epoch — always convert to ISO string for the API response.

---

### GET /api/events

| Property | Value |
|----------|-------|
| Auth required | Yes |
| Role required | Any (`admin`, `analyst`, `viewer`) |
| Pagination | Optional query params: `?page=1&limit=50` |

**Query parameters:**
| Param | Type | Default | Max |
|-------|------|---------|-----|
| `page` | integer | 1 | — |
| `limit` | integer | 50 | 100 |

**Success response — 200:**
```json
[<event_object>, ...]
```
Array of event objects (shape depends on role — see above).

**Notes:**
- Empty array `[]` is a valid 200 response — never 404 for empty lists
- viewer receives filtered shapes for every item in the array

---

### GET /api/events/:id

| Property | Value |
|----------|-------|
| Auth required | Yes |
| Role required | Any (`admin`, `analyst`, `viewer`) |

**Success response — 200:**
```json
<event_object>
```
(Full shape for admin/analyst, filtered for viewer.)

**Error responses:**
```json
404: { "error": "Event not found", "correlationId": "..." }
```

---

### POST /api/events/:id/analyze
> Added — not in the original contract. AI-powered incident analysis.

| Property | Value |
|----------|-------|
| Auth required | Yes |
| Role required | `admin`, `analyst` only (viewer → 403) |
| External dependency | Anthropic API (`ANTHROPIC_API_KEY`) |

**Request:** No body.

**Success response — 200:**
```json
{
  "summary":            "string (max 500 chars)",
  "attackVector":       "string (max 300 chars)",
  "severity":           "critical | high | medium | low | info",
  "recommendedActions": ["string", ...],
  "confidence":         "high | medium | low"
}
```
Side effects:
- Writes `ai.incident.analyzed` to audit_log with actor ID + event ID

**Error responses:**
```json
403: { "error": "Insufficient permissions", "correlationId": "..." }
404: { "error": "Event not found", "correlationId": "..." }
502: { "error": "AI analysis unavailable", "correlationId": "..." }
```
> 502 is returned when the AI call fails OR when the AI output fails Zod validation.
> Never expose raw AI output or ZodError details to the client.

---

## 4. Users Endpoints

All users endpoints require role `admin`. Any other authenticated role receives `403`.
Apply `authenticate` + `requireRole('admin')` on the router, not per-handler.

### User object shape

**Public shape (returned in all responses):**
```json
{
  "id":     "uuid",
  "email":  "string",
  "role":   "admin | analyst | viewer",
  "status": "active | inactive"
}
```
> ⚠️ `password_hash` must **never** appear in any response. Enforce at the SELECT level:
> `SELECT id, email, role, status FROM users` — never `SELECT *`.

---

### GET /api/users

| Property | Value |
|----------|-------|
| Auth required | Yes |
| Role required | `admin` |

**Success response — 200:**
```json
[<user_object>, ...]
```

---

### POST /api/users

| Property | Value |
|----------|-------|
| Auth required | Yes |
| Role required | `admin` |

**Request body:**
```json
{ "email": "string", "password": "string", "role": "admin | analyst | viewer" }
```

**Zod schema (CreateUserSchema):**
```typescript
z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  role:     z.enum(['admin', 'analyst', 'viewer']),
})
```

**Success response — 201:**
```json
{ "id": "uuid", "email": "string", "role": "...", "status": "active" }
```
Side effects:
- Password hashed with bcrypt before storage
- Writes `user.created` to audit_log with actor ID

**Error responses:**
```json
400: { "error": "Validation error message", "correlationId": "..." }
400: { "error": "Email already exists", "correlationId": "..." }
```

---

### PATCH /api/users/:id

| Property | Value |
|----------|-------|
| Auth required | Yes |
| Role required | `admin` |
| Self-modification | Admin cannot change their own role |

**Request body (all fields optional, at least one required):**
```json
{ "role": "admin | analyst | viewer" }
```
and/or:
```json
{ "status": "active | inactive" }
```

**Zod schema (UpdateUserSchema):**
```typescript
z.object({
  role:   z.enum(['admin', 'analyst', 'viewer']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
}).refine(data => data.role !== undefined || data.status !== undefined, {
  message: 'At least one field (role or status) must be provided',
})
```

**Success response — 200:**
```json
{ "id": "uuid", "email": "string", "role": "...", "status": "..." }
```
Side effects:
- If `role` changed: writes `user.role_changed` to audit_log with actor ID + old role + new role
- If `status` changed: writes `user.status_changed` to audit_log

**Error responses:**
```json
400: { "error": "Cannot change your own role", "correlationId": "..." }
404: { "error": "User not found", "correlationId": "..." }
```

---

### DELETE /api/users/:id

| Property | Value |
|----------|-------|
| Auth required | Yes |
| Role required | `admin` |
| Self-deletion | Admin cannot delete themselves |

**Success response — 200:**
```json
{ "message": "User deleted" }
```
Side effects:
- Writes `user.deleted` to audit_log with actor ID + deleted user email

**Error responses:**
```json
400: { "error": "Cannot delete your own account", "correlationId": "..." }
404: { "error": "User not found", "correlationId": "..." }
```

---

## 5. Internal Data Shapes (not in API responses)

### JWT Access Token payload
```typescript
{
  sub:   string;  // user.id
  email: string;
  role:  Role;
  jti:   string;  // crypto.randomUUID() — for blocklisting
  iss:   'penguwave-api';
  aud:   'penguwave-frontend';
  exp:   number;  // now + 15 minutes
}
```

### Refresh Token (DB row)
```typescript
{
  id:         string;  // UUID
  user_id:    string;  // FK → users.id
  token_hash: string;  // SHA-256 of raw token — never store raw
  expires_at: number;  // unix epoch
  revoked:    0 | 1;
}
```

### Audit Log entry
```typescript
{
  actor_id:       string | null;  // null for pre-auth events
  actor_email:    string | null;
  action:         AuditAction;
  target_type:    'user' | 'event' | 'system' | null;
  target_id:      string | null;
  ip_address:     string | null;
  correlation_id: string | null;
  metadata:       string | null;  // JSON string
}
```

### Security Event (written to events table)
```typescript
{
  id:       string;   // generated UUID
  type:     'brute_force_attempt';
  severity: 'high';
  source:   'security';
  source_ip: string;  // attacker IP
  timestamp: number;  // unix epoch
  title:     'Brute force login attempt detected';
  description: string; // includes IP + correlationId
}
```

---

## 6. Deviations from Original Contract

| Endpoint | Deviation | Reason |
|----------|-----------|--------|
| `POST /api/auth/refresh` | Added — not in original | JWT access tokens expire in 15min; rotation needed for UX |
| `POST /api/events/:id/analyze` | Added — not in original | AI incident analysis — core creative feature |
| Error responses include `correlationId` | Extended from `{ "error": "..." }` | Traceability — analyst can report ID to support |
| `GET /api/events` adds `type`, `source` fields | Extended from contract shape | Required for security event display and filtering |
| Login 429 includes `retryAfter` field | Extended | UX — client can show countdown |

---

## 7. Pre-Commit Verification Checklist

Run through this before every `git commit` that touches a route file.

### Response shape
- [ ] Response matches the exact shape defined in this document for this endpoint
- [ ] No extra fields leaking (especially `password_hash`, `token_hash`, `metadata` for viewers)
- [ ] `password_hash` is never included in any user response
- [ ] `tags` is always a parsed array, never a raw JSON string
- [ ] `timestamp` is always an ISO 8601 string, never a raw unix integer

### Status codes
- [ ] Success uses the correct code (200 vs 201)
- [ ] Not-found uses 404, not 400
- [ ] Auth failure uses 401, role failure uses 403 — never swapped
- [ ] Validation failure uses 400 with the Zod error message

### Error format
- [ ] Every error response includes `"error"` key and `"correlationId"` key
- [ ] No stack traces, no internal error messages, no DB error strings in responses

### Auth + authz
- [ ] Every protected route has `authenticate` middleware
- [ ] Every admin-only route has `requireRole('admin')` middleware
- [ ] viewer field filtering is applied in every event response (list AND single)

### Security
- [ ] No `SELECT *` on users table — always explicit column list
- [ ] `bcrypt.compare()` called even when user does not exist (timing safety)
- [ ] JWT verify uses `{ algorithms: ['HS256'] }` — never without algorithms
- [ ] All AI event data passed through `sanitizeForPrompt()` before prompt construction
- [ ] AI response validated through `IncidentAnalysisSchema.parse()` before returning

### Audit log
- [ ] Login success/failure → `auth.login.success` / `auth.login.failure`
- [ ] Logout → `auth.logout`
- [ ] Token refresh → `auth.token.refresh`
- [ ] User created → `user.created`
- [ ] Role change → `user.role_changed` with old + new role in metadata
- [ ] User deleted → `user.deleted`
- [ ] AI analysis → `ai.incident.analyzed`
