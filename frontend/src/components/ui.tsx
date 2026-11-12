"use client";

import { forwardRef, type ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}

export function Btn({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-teal-600 text-white hover:bg-teal-700",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-teal-700 hover:bg-teal-50",
  };
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${className}`}
      {...props}
    />
  );
});

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{children}</label>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white ${className}`}>
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children }: { children?: ReactNode }) {
  return <th className="border-b border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-600">{children ?? null}</th>;
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-slate-100 px-4 py-3 ${className}`}>{children}</td>;
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" | "info" }) {
  const colors = {
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-teal-200 bg-teal-50 text-teal-900",
    info: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${colors[tone]}`}>{children}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div
        className={`relative max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl ${
          wide ? "w-full max-w-2xl" : "w-full max-w-lg"
        }`}
      >
        <ModalHeader title={title} onClose={onClose} />
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100">
        ✕
      </button>
    </div>
  );
}

export function Money({ amount }: { amount: number }) {
  return <span className="font-mono tabular-nums">{amount}</span>;
}
