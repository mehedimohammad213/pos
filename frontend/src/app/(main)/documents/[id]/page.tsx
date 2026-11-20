"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { InvoicePaper, InvoiceTemplate, ShopSettings } from "@/lib/types";
import { Alert, Btn, Field, Input, Select } from "@/components/ui";
import { DocumentEditor } from "@/components/DocumentEditor";
import {
  buildPrintableDocument,
  mergeInvoiceHtml,
  sampleSale,
} from "@/lib/invoiceMerge";

function DocumentEditorContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [template, setTemplate] = useState<InvoiceTemplate | null>(null);
  const [name, setName] = useState("");
  const [paper, setPaper] = useState<InvoicePaper>("a4");
  const [html, setHtml] = useState("");
  const [shop, setShop] = useState<ShopSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const sample = useMemo(() => sampleSale(), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [tpl, shopData] = await Promise.all([
          api<InvoiceTemplate>(`/documents/templates/${id}`),
          api<ShopSettings>("/shop"),
        ]);
        if (cancelled) return;
        setTemplate(tpl);
        setName(tpl.name);
        setPaper(tpl.paper);
        setHtml(tpl.content_html || "");
        setShop(shopData);
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const updated = await api<InvoiceTemplate>(`/documents/templates/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name,
          paper,
          content_html: html,
          is_default: template?.is_default,
        }),
      });
      setTemplate(updated);
      setMsg("Design saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function setForPrint() {
    setSaving(true);
    setError("");
    try {
      await api(`/documents/templates/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, paper, content_html: html }),
      });
      const updated = await api<InvoiceTemplate>(`/documents/templates/${id}/set-default`, {
        method: "POST",
      });
      setTemplate(updated);
      setMsg("This design is now used for printing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to set default");
    } finally {
      setSaving(false);
    }
  }

  function printPreview() {
    const doc = buildPrintableDocument(html, sample, shop, paper);
    const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
    if (!win) return;
    win.document.open();
    win.document.write(doc);
    win.document.close();
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {}
    }, 300);
  }

  if (!loaded && !error) {
    return <p className="text-sm text-slate-500">Loading design…</p>;
  }

  if (error && !template) {
    return (
      <div className="space-y-3">
        <Alert tone="error">{error}</Alert>
        <Btn variant="secondary" onClick={() => router.push("/documents")}>
          Back
        </Btn>
      </div>
    );
  }

  const previewHtml = mergeInvoiceHtml(html, sample, shop, paper);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/documents" className="text-xs font-medium text-teal-700 hover:underline">
            ← All documents
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900 sm:text-2xl">Invoice design</h1>
          <p className="text-sm text-slate-500">
            Google Docs–style editor. Insert fields like shop name and items table, then set for print.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Btn variant="secondary" className="flex-1 sm:flex-none" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? "Hide preview" : "Preview"}
          </Btn>
          <Btn variant="secondary" className="flex-1 sm:flex-none" onClick={printPreview}>
            Print sample
          </Btn>
          <Btn variant="secondary" className="flex-1 sm:flex-none" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Btn>
          <Btn className="w-full sm:w-auto" disabled={saving} onClick={() => void setForPrint()}>
            {template?.is_default ? "Print default" : "Set for print"}
          </Btn>
        </div>
      </div>

      {msg ? <Alert tone="success">{msg}</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <Field label="Design name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Paper size">
          <Select value={paper} onChange={(e) => setPaper(e.target.value as InvoicePaper)}>
            <option value="a4">A4 (normal printer)</option>
            <option value="pos80">POS 80mm (thermal)</option>
          </Select>
        </Field>
        <div className="flex items-end">
          {template?.is_default ? (
            <span className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700">
              Active print template for {paper === "a4" ? "A4" : "POS"}
            </span>
          ) : (
            <span className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Not set as print default yet
            </span>
          )}
        </div>
      </div>

      {loaded ? (
        <DocumentEditor contentHtml={html} paper={paper} onChange={setHtml} />
      ) : null}

      {showPreview ? (
        <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 sm:p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Live preview (sample sale)</h2>
          <div className="overflow-x-auto">
            <div
              className={`mx-auto max-w-full bg-white p-4 shadow sm:p-6 ${
                paper === "pos80" ? "w-[80mm] text-[12px]" : "w-full sm:w-[210mm] sm:max-w-[210mm]"
              }`}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function DocumentEditorPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Loading invoice design…</div>}>
      <DocumentEditorContent />
    </Suspense>
  );
}
