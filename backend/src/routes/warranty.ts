import { param } from '../utils/params';
import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRoles } from '../middleware/auth';
import * as returns from '../services/returnService';

const router = Router();

router.get('/', authRequired, async (_req, res, next) => {
  try {
    res.json(await returns.listWarrantyClaims());
  } catch (e) {
    next(e);
  }
});

router.post('/', authRequired, async (req, res, next) => {
  try {
    const body = z
      .object({
        serial_id: z.string().uuid(),
        issue_description: z.string().min(1),
        sale_id: z.string().uuid().optional(),
        customer_id: z.string().uuid().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(await returns.createWarrantyClaim(body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/resolve', authRequired, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const body = z
      .object({
        resolution: z.enum(['repair', 'replace', 'reject']),
        status: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    res.json(await returns.resolveWarrantyClaim(param(req.params.id), body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

export default router;
