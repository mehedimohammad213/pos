const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:9006";

function getApiBaseUrl(): string {
  // Browser: always same-origin so HTTPS UI can use Next.js /api rewrite (no mixed content).
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return API_URL;
}

export const ACCESS_TOKEN_KEY = "pos_access_token";
export const REFRESH_TOKEN_KEY = "pos_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function doRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return false;
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; raw?: boolean } = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!options.skipAuth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.body && typeof options.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = `${getApiBaseUrl()}/api${path}`;
  let res = await fetch(url, { ...options, headers });

  if (res.status === 401 && !options.skipAuth) {
    if (!refreshInFlight) {
      refreshInFlight = doRefresh().finally(() => {
        refreshInFlight = null;
      });
    }
    const refreshed = await refreshInFlight;
    if (refreshed) {
      const token = getAccessToken();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      res = await fetch(url, { ...options, headers });
    } else {
      clearTokens();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      // Stop callers without an unhandled rejection (Next.js error overlay).
      return new Promise<T>(() => {});
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  if (options.raw) return res as unknown as T;
  return res.json() as Promise<T>;
}

export async function apiText(path: string, options?: RequestInit): Promise<string> {
  const headers = new Headers(options?.headers);
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const url = `${getApiBaseUrl()}/api${path}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  return res.text();
}

/** Resolve relative /uploads paths for display. */
export function mediaUrl(path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) return path;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return path.startsWith("/") ? path : `/${path}`;
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${getApiBaseUrl()}/api/uploads`, { method: "POST", headers, body: form });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  return res.json() as Promise<{ url: string }>;
}

export function downloadBlob(text: string, filename: string, mime = "text/csv") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
