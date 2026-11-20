"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { InvoicePaper } from "@/lib/types";
import { MERGE_FIELDS } from "@/lib/invoiceMerge";

const FONT_SIZES = ["10px", "11px", "12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];
const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: '"Courier New", Courier, monospace' },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
];

function ToolbarBtn({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm disabled:opacity-40 ${
        active ? "bg-slate-200 text-slate-900" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px bg-slate-200" />;
}

function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-2 py-1.5 shadow-sm">
      <select
        className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
        value={editor.getAttributes("textStyle").fontFamily || ""}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(value).run();
        }}
        title="Font"
      >
        <option value="">Font</option>
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <select
        className="h-8 rounded border border-slate-200 bg-white px-2 text-xs"
        value={editor.getAttributes("textStyle").fontSize || ""}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) editor.chain().focus().unsetFontSize().run();
          else editor.chain().focus().setFontSize(value).run();
        }}
        title="Font size"
      >
        <option value="">Size</option>
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size.replace("px", "")}
          </option>
        ))}
      </select>

      <ToolbarDivider />

      <ToolbarBtn
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </ToolbarBtn>
      <ToolbarBtn
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarBtn>
      <ToolbarBtn
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarBtn>
      <ToolbarBtn
        title="Strike"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="line-through">S</span>
      </ToolbarBtn>

      <ToolbarDivider />

      <label className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs text-slate-600 hover:bg-slate-100" title="Text color">
        <span>A</span>
        <input
          type="color"
          className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          value={editor.getAttributes("textStyle").color || "#0f172a"}
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
      </label>

      <ToolbarDivider />

      <ToolbarBtn
        title="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        ⬅
      </ToolbarBtn>
      <ToolbarBtn
        title="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        ↔
      </ToolbarBtn>
      <ToolbarBtn
        title="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        ➡
      </ToolbarBtn>
      <ToolbarBtn
        title="Justify"
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        ≡
      </ToolbarBtn>

      <ToolbarDivider />

      <ToolbarBtn
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarBtn>
      <ToolbarBtn
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarBtn>
      <ToolbarBtn
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        ••
      </ToolbarBtn>
      <ToolbarBtn
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1.
      </ToolbarBtn>

      <ToolbarDivider />

      <ToolbarBtn
        title="Insert table"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        ▦
      </ToolbarBtn>
      <ToolbarBtn
        title="Add row"
        disabled={!editor.can().addRowAfter()}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        +row
      </ToolbarBtn>
      <ToolbarBtn
        title="Add column"
        disabled={!editor.can().addColumnAfter()}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        +col
      </ToolbarBtn>
      <ToolbarBtn
        title="Delete table"
        disabled={!editor.can().deleteTable()}
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        ✕tbl
      </ToolbarBtn>

      <ToolbarDivider />

      <ToolbarBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}>
        ↺
      </ToolbarBtn>
      <ToolbarBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}>
        ↻
      </ToolbarBtn>

      <ToolbarDivider />

      <select
        className="h-8 max-w-[180px] rounded border border-teal-200 bg-teal-50 px-2 text-xs text-teal-800"
        defaultValue=""
        onChange={(e) => {
          const key = e.target.value;
          e.target.value = "";
          if (!key) return;
          editor
            .chain()
            .focus()
            .insertContent(`<span style="background:#ccfbf1;color:#0f766e;padding:0 3px;border-radius:3px;">{{${key}}}</span> `)
            .run();
        }}
        title="Insert merge field"
      >
        <option value="">Insert field…</option>
        {MERGE_FIELDS.map((field) => (
          <option key={field.key} value={field.key}>
            {field.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DocumentEditor({
  contentHtml,
  paper,
  onChange,
}: {
  contentHtml: string;
  paper: InvoicePaper;
  onChange: (html: string) => void;
}) {
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        underline: false,
      }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: "Design your invoice here…" }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    []
  );

  const seededRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions,
    content: contentHtml || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "doc-editor-content outline-none min-h-full",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor || seededRef.current || !contentHtml) return;
    editor.commands.setContent(contentHtml, { emitUpdate: false });
    seededRef.current = true;
  }, [contentHtml, editor]);

  const sheetClass =
    paper === "pos80"
      ? "w-[80mm] max-w-full min-h-[140mm] px-3 py-4 text-[12px]"
      : "w-full max-w-[210mm] min-h-[297mm] px-4 py-6 text-[14px] sm:w-[210mm] sm:px-12 sm:py-10";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
      {editor ? <EditorToolbar editor={editor} /> : null}
      <div className="max-h-[min(72vh,100dvh-12rem)] overflow-auto overscroll-contain bg-[#e8eaed] px-2 py-4 sm:px-4 sm:py-6">
        <p className="mb-3 text-center text-xs text-slate-500 sm:hidden">Swipe sideways to scroll the full page</p>
        <div
          className={`mx-auto bg-white shadow-[0_1px_3px_rgba(60,64,67,.3),0_4px_8px_3px_rgba(60,64,67,.15)] ${sheetClass}`}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
