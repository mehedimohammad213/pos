"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState, Suspense } from "react";
import Image from "next/image";
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
    <div className="grid min-h-screen bg-slate-900 lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-24">
        <LoginPanel
          onSubmit={onSubmit}
          email={email}
          password={password}
          error={error}
          busy={busy}
          setEmail={setEmail}
          setPassword={setPassword}
        />
      </div>

      <div className="relative hidden min-h-screen lg:block">
        <Image
          src="/login-pos.jpg"
          alt="Hardware POS checkout counter with scanner and terminal"
          fill
          priority
          className="object-cover"
          sizes="50vw"
        />
        <div className="absolute inset-0 bg-gradient-to-l from-transparent via-slate-900/20 to-slate-900/70" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="text-2xl font-semibold text-white">Sell faster. Track everything.</p>
          <p className="mt-2 max-w-md text-sm text-slate-200">
            Barcode scanning, inventory, warranties, and checkout — built for hardware retail.
          </p>
        </div>
      </div>
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
    <div className="mx-auto w-full max-w-md lg:mx-0">
      <h1 className="text-3xl font-semibold text-teal-400">Hardware POS</h1>
      <p className="mt-2 text-sm text-slate-400">Sign in to continue</p>
      <form onSubmit={onSubmit} className="mt-8 flex w-full flex-col gap-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="w-full border-slate-300 bg-white text-black"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full border-slate-300 bg-white text-black"
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
