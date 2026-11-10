import { param } from '../utils/params';
import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth';
import * as customers from '../services/customerService';
import * as credit from '../services/creditService';

const router = Router();

router.get('/', authRequired, async (req, res, next) => {
  try {
    res.json(await customers.listCustomers(req.query.q as string | undefined));
  } catch (e) {
    next(e);
  }
});

router.get('/by-phone/:phone', authRequired, async (req, res, next) => {
  try {
    const c = await customers.findByPhone(param(req.params.phone));
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    res.json(c);
  } catch (e) {
    next(e);
  }
});

router.get('/due-aging', authRequired, async (_req, res, next) => {
  try {
    res.json(await credit.dueAging());
  } catch (e) {
    next(e);
  }
});

router.get('/:id', authRequired, async (req, res, next) => {
  try {
    res.json(await customers.getCustomer(param(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.get('/:id/history', authRequired, async (req, res, next) => {
  try {
    res.json(await customers.customerHistory(param(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.get('/:id/ledger', authRequired, async (req, res, next) => {
  try {
    res.json(await credit.customerLedger(param(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/', authRequired, async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        phone: z.string().min(8),
        address: z.string().optional(),
        nid: z.string().optional(),
        credit_limit: z.number().optional(),
      })
      .parse(req.body);
    res.status(201).json(await customers.createCustomer(body));
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', authRequired, async (req, res, next) => {
  try {
    res.json(await customers.updateCustomer(param(req.params.id), req.body));
  } catch (e) {
    next(e);
  }
});

router.post('/collect-due', authRequired, async (req, res, next) => {
  try {
    const body = z
      .object({
        customer_id: z.string().uuid(),
        amount: z.number().positive(),
        method: z.string().optional(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        allocations: z.array(z.object({ sale_id: z.string().uuid(), amount: z.number().positive() })).optional(),
      })
      .parse(req.body);
    res.json(await credit.collectDue(body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

export default router;
