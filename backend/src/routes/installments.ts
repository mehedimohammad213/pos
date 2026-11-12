import { param } from '../utils/params';
import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth';
import * as emi from '../services/installmentService';

const router = Router();

router.get('/', authRequired, async (req, res, next) => {
  try {
    const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    res.json(await emi.listPlans(req.query.status as string | undefined, {
      page: page !== undefined || paginate ? (page || 1) : undefined,
      limit: limit !== undefined || paginate ? (limit || 20) : undefined,
    }));
  } catch (e) {
    next(e);
  }
});

router.get('/overdue', authRequired, async (_req, res, next) => {
  try {
    res.json(await emi.overdueList());
  } catch (e) {
    next(e);
  }
});

router.get('/:id', authRequired, async (req, res, next) => {
  try {
    res.json(await emi.getPlan(param(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/pay', authRequired, async (req, res, next) => {
  try {
    const body = z
      .object({
        due_id: z.string().uuid(),
        amount: z.number().positive(),
        method: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    res.json(await emi.payInstallment(body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

export default router;
