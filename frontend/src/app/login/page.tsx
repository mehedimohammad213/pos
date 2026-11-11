"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { Alert, Btn, Field, Input } from "@/components/ui";

function LoginForm() {
  const { login, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("admin@shop.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, router, next]);

  if (user) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <LoginPanel onSubmit={onSubmit} email={email} password={password} error={error} busy={busy} setEmail={setEmail} setPassword={setPassword} />
    </div>
  );
}

function LoginPanel({
  onSubmit,
  email,
  password,
  error,
  busy,
  setEmail,
  setPassword,
}: {
  onSubmit: (e: FormEvent) => void;
  email: string;
  password: string;
  error: string;
  busy: boolean;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-8 shadow-xl">
      <h1 className="text-2xl font-semibold text-teal-400">Hardware POS</h1>
      <p className="mt-1 text-sm text-slate-400">Sign in to continue</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="border-slate-600 bg-slate-900 text-white"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="border-slate-600 bg-slate-900 text-white"
          />
        </Field>
        <Btn type="submit" disabled={busy} className="w-full py-3 text-base">
          {busy ? "Signing in…" : "Sign in"}
        </Btn>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <LoginForm />
    </Suspense>
  );
}
