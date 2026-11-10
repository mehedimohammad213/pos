"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearTokens, getAccessToken, setTokens } from "./api";
import type { AuthUser, PermissionKey } from "./types";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (perm: PermissionKey) => boolean;
  canSeeCost: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      return;
    }
    try {
      const me = await api<{ user: AuthUser }>("/auth/me");
      setUser(me.user);
    } catch {
      setUser(null);
      clearTokens();
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ user: AuthUser; accessToken: string; refreshToken: string }>(
      "/auth/login",
      {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ email, password }),
      }
    );
    setTokens(res.accessToken, res.refreshToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearTokens();
    setUser(null);
  }, []);

  const hasPermission = useCallback(
    (perm: PermissionKey) => {
      if (!user) return false;
      if (user.role === "admin") return true;
      return user.permissions.includes(perm);
    },
    [user]
  );

  const canSeeCost = hasPermission("see_cost");

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser, hasPermission, canSeeCost }),
    [user, loading, login, logout, refreshUser, hasPermission, canSeeCost]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
