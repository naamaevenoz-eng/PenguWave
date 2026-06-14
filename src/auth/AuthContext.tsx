import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "../types";
import * as api from "../api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore any existing session on first load (refresh cookie → access token → /me).
  useEffect(() => {
    let active = true;
    api
      .bootstrapSession()
      .then((u) => active && setUser(u))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    await api.login(email, password);
    // Source role/status from /me, never by decoding the token client-side.
    setUser(await api.getMe());
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isAdmin: user?.role === "admin", login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
