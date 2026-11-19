import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRoles } from '../middleware/auth';
import * as invoiceTemplateService from '../services/invoiceTemplateService';

const router = Router();

const paperSchema = z.enum(['a4', 'pos80']);

const templateBody = z.object({
  name: z.string().min(1).max(120),
  paper: paperSchema,
  content_html: z.string().max(500_000),
  content_json: z.unknown().optional(),
  is_default: z.boolean().optional(),
});

const templateUpdateBody = templateBody.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: 'At least one field is required' }
);

router.get('/templates', authRequired, async (_req, res, next) => {
  try {
    res.json(await invoiceTemplateService.listTemplates());
  } catch (e) {
    next(e);
  }
});

router.get('/templates/default', authRequired, async (req, res, next) => {
  try {
    const paper = req.query.paper
      ? paperSchema.parse(String(req.query.paper))
      : undefined;
    res.json(await invoiceTemplateService.getDefaultTemplate(paper));
  } catch (e) {
    next(e);
  }
});

router.get('/templates/:id', authRequired, async (req, res, next) => {
  try {
    res.json(await invoiceTemplateService.getTemplate(String(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/templates', authRequired, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const body = templateBody.parse(req.body);
    res.status(201).json(await invoiceTemplateService.createTemplate(body));
  } catch (e) {
    next(e);
  }
});

router.put('/templates/:id', authRequired, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const body = templateUpdateBody.parse(req.body);
    res.json(await invoiceTemplateService.updateTemplate(String(req.params.id), body));
  } catch (e) {
    next(e);
  }
});

router.post(
  '/templates/:id/set-default',
  authRequired,
  requireRoles('admin', 'manager'),
  async (req, res, next) => {
    try {
      res.json(await invoiceTemplateService.setDefaultTemplate(String(req.params.id)));
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  '/templates/:id',
  authRequired,
  requireRoles('admin', 'manager'),
  async (req, res, next) => {
    try {
      res.json(await invoiceTemplateService.deleteTemplate(String(req.params.id)));
    } catch (e) {
      next(e);
    }
  }
);

export default router;
