import { query } from '../db/pool';
import { AppError, assertFound } from '../utils/errors';

export type InvoicePaper = 'a4' | 'pos80';

export type InvoiceTemplateInput = {
  name: string;
  paper: InvoicePaper;
  content_html: string;
  content_json?: unknown;
  is_default?: boolean;
};

export async function listTemplates() {
  const result = await query(
    `SELECT id, name, paper, content_html, content_json, is_default, created_at, updated_at
     FROM invoice_templates
     ORDER BY is_default DESC, updated_at DESC`
  );
  return result.rows;
}

export async function getTemplate(id: string) {
  const result = await query(
    `SELECT id, name, paper, content_html, content_json, is_default, created_at, updated_at
     FROM invoice_templates WHERE id = $1`,
    [id]
  );
  return assertFound(result.rows[0], 'Template not found');
}

export async function getDefaultTemplate(paper?: InvoicePaper) {
  if (paper) {
    const result = await query(
      `SELECT id, name, paper, content_html, content_json, is_default, created_at, updated_at
       FROM invoice_templates WHERE paper = $1 AND is_default = TRUE LIMIT 1`,
      [paper]
    );
    return result.rows[0] || null;
  }
  const result = await query(
    `SELECT id, name, paper, content_html, content_json, is_default, created_at, updated_at
     FROM invoice_templates WHERE is_default = TRUE
     ORDER BY CASE paper WHEN 'a4' THEN 0 ELSE 1 END
     LIMIT 1`
  );
  return result.rows[0] || null;
}

async function clearDefaultForPaper(paper: InvoicePaper, exceptId?: string) {
  if (exceptId) {
    await query(
      `UPDATE invoice_templates SET is_default = FALSE, updated_at = NOW()
       WHERE paper = $1 AND is_default = TRUE AND id <> $2`,
      [paper, exceptId]
    );
    return;
  }
  await query(
    `UPDATE invoice_templates SET is_default = FALSE, updated_at = NOW()
     WHERE paper = $1 AND is_default = TRUE`,
    [paper]
  );
}

export async function createTemplate(input: InvoiceTemplateInput) {
  if (input.is_default) {
    await clearDefaultForPaper(input.paper);
  }
  const result = await query(
    `INSERT INTO invoice_templates (name, paper, content_html, content_json, is_default)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id, name, paper, content_html, content_json, is_default, created_at, updated_at`,
    [
      input.name,
      input.paper,
      input.content_html,
      JSON.stringify(input.content_json ?? {}),
      Boolean(input.is_default),
    ]
  );
  return result.rows[0];
}

export async function updateTemplate(id: string, input: Partial<InvoiceTemplateInput>) {
  const existing = await getTemplate(id);
  const paper = (input.paper || existing.paper) as InvoicePaper;
  const isDefault = input.is_default !== undefined ? Boolean(input.is_default) : existing.is_default;

  if (isDefault) {
    await clearDefaultForPaper(paper, id);
  }

  const result = await query(
    `UPDATE invoice_templates SET
       name = COALESCE($2, name),
       paper = COALESCE($3, paper),
       content_html = COALESCE($4, content_html),
       content_json = COALESCE($5::jsonb, content_json),
       is_default = $6,
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, paper, content_html, content_json, is_default, created_at, updated_at`,
    [
      id,
      input.name ?? null,
      input.paper ?? null,
      input.content_html ?? null,
      input.content_json !== undefined ? JSON.stringify(input.content_json) : null,
      isDefault,
    ]
  );
  return assertFound(result.rows[0], 'Template not found');
}

export async function setDefaultTemplate(id: string) {
  const existing = await getTemplate(id);
  await clearDefaultForPaper(existing.paper as InvoicePaper, id);
  const result = await query(
    `UPDATE invoice_templates SET is_default = TRUE, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, paper, content_html, content_json, is_default, created_at, updated_at`,
    [id]
  );
  return assertFound(result.rows[0], 'Template not found');
}

export async function deleteTemplate(id: string) {
  const existing = await getTemplate(id);
  const count = await query(`SELECT COUNT(*)::int AS c FROM invoice_templates WHERE paper = $1`, [
    existing.paper,
  ]);
  if (count.rows[0]?.c <= 1) {
    throw new AppError('Cannot delete the last template for this paper size', 400);
  }
  if (existing.is_default) {
    throw new AppError('Set another template as default before deleting this one', 400);
  }
  await query(`DELETE FROM invoice_templates WHERE id = $1`, [id]);
  return { ok: true };
}
