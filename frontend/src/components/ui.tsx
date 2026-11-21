"use client";

import Link from "next/link";
import { forwardRef, type ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 sm:mb-6">
      <h1 className="min-w-0 flex-1 truncate text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
      {children ? <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{children}</div> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>
  );
}

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
type BtnSize = "md" | "sm";

const BTN_VARIANTS: Record<BtnVariant, string> = {
  primary: "bg-teal-600 text-white hover:bg-teal-700",
  secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-teal-700 hover:bg-teal-50",
};

const BTN_SIZES: Record<BtnSize, string> = {
  md: "min-h-10 px-3 py-2 text-sm sm:px-4",
  sm: "min-h-9 px-2.5 py-1 text-xs",
};

export function Btn({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium disabled:opacity-50 ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Compact action button for table rows (Edit, Collect Due, Pay EMI, …). */
export function RowBtn({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Btn variant="ghost" size="sm" className={className} {...props}>
      {children}
    </Btn>
  );
}

/** Destructive table-row action (always ghost + red text for dense tables). */
export function RowDeleteBtn({
  children = "Delete",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Btn
      variant="ghost"
      size="sm"
      className={`text-red-600 hover:bg-red-50 hover:text-red-700 ${className}`}
      {...props}
    >
      {children}
    </Btn>
  );
}

/** Link styled like a row action button (View invoice, Open customer, …). */
export function RowLink({
  href,
  children,
  className = "",
  onClick,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 ${className}`}
    >
      {children}
    </Link>
  );
}

/** Right-aligned cluster of row action buttons. */
export function TableRowActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-1">{children}</div>;
}

/** Segmented tab control for list pages (Purchases / Suppliers, …). */
export function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-teal-600 text-white"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
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
      className={`w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 ${className}`}
      {...props}
    />
  );
});

export function Select({ className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 ${className}`}
      {...props}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{children}</label>;
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function TableWrap({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`-mx-1 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white sm:mx-0 ${className}`}>
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th className={`border-b border-slate-200 bg-slate-50 px-2 py-2.5 font-medium text-slate-600 sm:px-4 sm:py-3 ${className}`}>
      {children ?? null}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
  title,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
}) {
  return (
    <td colSpan={colSpan} title={title} className={`border-b border-slate-100 px-2 py-2.5 sm:px-4 sm:py-3 ${className}`}>
      {children}
    </td>
  );
}

/** Standard Actions column header. */
export function ThActions({ className = "" }: { className?: string }) {
  return <Th className={`text-right ${className}`}>Actions</Th>;
}

/** Actions cell that right-aligns TableRowActions. */
export function TdActions({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Td className={`text-right ${className}`}>{children}</Td>;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div
        className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-h-[90vh] sm:rounded-xl sm:p-5 ${
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        }`}
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
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
      <h2 className="min-w-0 truncate text-lg font-semibold text-slate-900">{title}</h2>
      <button type="button" onClick={onClose} className="shrink-0 rounded p-2 text-slate-500 hover:bg-slate-100">
        ✕
      </button>
    </div>
  );
}

/** Right-to-left slide-over drawer */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 transition-opacity"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex h-full w-full flex-col bg-white shadow-2xl ${
          wide ? "max-w-xl" : "max-w-md"
        }`}
        style={{
          animation: "drawerSlideIn 0.28s ease-out",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <style>{`
          @keyframes drawerSlideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Money({ amount }: { amount: number }) {
  return <span className="font-mono tabular-nums">{amount}</span>;
}

export function Pagination({
  page,
  totalPages,
  total,
  limit,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const pages: (number | "...")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
      <span>
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="min-h-10 rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p as number)}
              className={`min-h-10 min-w-[2rem] rounded px-2 py-1 ${
                p === page
                  ? "bg-teal-600 font-semibold text-white"
                  : "hover:bg-slate-100"
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="min-h-10 rounded px-2 py-1 hover:bg-slate-100 disabled:opacity-40"
        >
          ›
        </button>
      </div>
    </div>
  );
}
