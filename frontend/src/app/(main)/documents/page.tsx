"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { InvoiceTemplate } from "@/lib/types";
import {
  Alert,
  Btn,
  PageHeader,
  RowBtn,
  RowDeleteBtn,
  RowLink,
  TableRowActions,
  TableWrap,
  Td,
  TdActions,
  Th,
  ThActions,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_A4_HTML, DEFAULT_POS_HTML } from "@/lib/invoiceMerge";

export default function DocumentsPage() {
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setTemplates(await api<InvoiceTemplate[]>("/documents/templates"));
  }

  useEffect(() => {
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    });
  }, []);

  async function createTemplate(paper: "a4" | "pos80") {
    setBusy(true);
    setError("");
    try {
      const created = await api<InvoiceTemplate>("/documents/templates", {
        method: "POST",
        body: JSON.stringify({
          name: paper === "a4" ? "New A4 Invoice" : "New POS Receipt",
          paper,
          content_html: paper === "a4" ? DEFAULT_A4_HTML : DEFAULT_POS_HTML,
          is_default: false,
        }),
      });
      setMsg("Template created");
      window.location.href = `/documents/${created.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    setError("");
    try {
      await api(`/documents/templates/${id}/set-default`, { method: "POST" });
      setMsg("Default print template updated");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set default");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this invoice design?")) return;
    setError("");
    try {
      await api(`/documents/templates/${id}`, { method: "DELETE" });
      setMsg("Template deleted");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Invoice Templates">
        <Btn disabled={busy} onClick={() => void createTemplate("a4")}>
          New A4 Design
        </Btn>
        <Btn variant="secondary" disabled={busy} onClick={() => void createTemplate("pos80")}>
          New POS Design
        </Btn>
      </PageHeader>

      <p className="text-sm text-slate-600">
        Design invoices like a document editor — resize text, style fonts, insert shop/sale fields, then set a
        design as the default for printing.
      </p>

      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <TableWrap>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Paper</Th>
            <Th className="hidden sm:table-cell">Default</Th>
            <Th className="hidden md:table-cell">Updated</Th>
            <ThActions />
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <Td>
                <Link href={`/documents/${t.id}`} className="font-medium text-teal-700 hover:underline">
                  {t.name}
                </Link>
                {t.is_default ? (
                  <span className="mt-1 inline-block rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 sm:hidden">
                    Default
                  </span>
                ) : null}
              </Td>
              <Td>{t.paper === "a4" ? "A4" : "POS 80mm"}</Td>
              <Td className="hidden sm:table-cell">
                {t.is_default ? (
                  <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">Default</span>
                ) : (
                  "—"
                )}
              </Td>
              <Td className="hidden md:table-cell">{formatDateTime(t.updated_at)}</Td>
              <TdActions>
                <TableRowActions>
                  <RowLink href={`/documents/${t.id}`}>Edit</RowLink>
                  {!t.is_default ? (
                    <RowBtn onClick={() => void setDefault(t.id)}>Set Default</RowBtn>
                  ) : null}
                  {!t.is_default ? <RowDeleteBtn onClick={() => void remove(t.id)} /> : null}
                </TableRowActions>
              </TdActions>
            </tr>
          ))}
          {!templates.length ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-sm text-slate-500">
                No templates yet. Create an A4 or POS design to get started.
              </td>
            </tr>
          ) : null}
        </tbody>
      </TableWrap>
    </div>
  );
}
