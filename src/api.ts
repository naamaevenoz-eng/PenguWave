import type { AuthUser, SecurityEvent, User } from "./types";

const API_URL = "http://localhost:3001";

// Access token is held in memory only — never in localStorage/sessionStorage —
// so an XSS payload cannot read it. Session continuity across reloads comes from
// the httpOnly refresh cookie via bootstrapSession().
let accessToken: string | null = null;
export function getAccessToken(): string | null {
  return accessToken;
}

/** Error carrying the backend's status, message, and correlationId. */
export class ApiError extends Error {
  status: number;
  correlationId?: string;
  constructor(status: number, message: string, correlationId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.correlationId = correlationId;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // attach Bearer token (default true)
  retry?: boolean; // internal: prevents infinite refresh loops
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? res.statusText, data?.correlationId);
  }
  return data as T;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "include", // send the refresh cookie on /refresh
  });

  // Transparently refresh once on a 401, then replay the original request.
  if (
    res.status === 401 &&
    options.auth !== false &&
    !options.retry &&
    path !== "/api/auth/refresh"
  ) {
    if (await tryRefresh()) {
      return request<T>(path, { ...options, retry: true });
    }
  }

  return parse<T>(res);
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token: string };
    accessToken = data.token;
    return true;
  } catch {
    return false;
  }
}

// --- Auth ---------------------------------------------------------------------

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await request<{ token: string; user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  accessToken = data.token;
  return data.user;
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    accessToken = null;
  }
}

export function getMe(): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/me");
}

/** On app load: exchange the refresh cookie for an access token, then load the
 *  user. Returns null when there is no valid session. */
export async function bootstrapSession(): Promise<AuthUser | null> {
  if (!(await tryRefresh())) return null;
  try {
    return await getMe();
  } catch {
    return null;
  }
}

// --- Events -------------------------------------------------------------------

export function getEvents(): Promise<SecurityEvent[]> {
  // limit=100 (the backend max) pulls the full set in one page for the dashboard.
  return request<SecurityEvent[]>("/api/events?limit=100");
}

// --- Users (admin only) -------------------------------------------------------

export function getUsers(): Promise<User[]> {
  return request<User[]>("/api/users");
}

export function createUser(user: {
  email: string;
  password: string;
  role: string;
}): Promise<User> {
  return request<User>("/api/users", { method: "POST", body: user });
}

export function deleteUser(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/users/${id}`, { method: "DELETE" });
}
