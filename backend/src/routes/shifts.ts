import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRoles } from '../middleware/auth';
import * as shifts from '../services/shiftService';

const router = Router();

router.get('/current', authRequired, async (req, res, next) => {
  try {
    res.json(await shifts.getOpenShift(req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.get('/', authRequired, requireRoles('admin', 'manager'), async (_req, res, next) => {
  try {
    res.json(await shifts.listShifts());
  } catch (e) {
    next(e);
  }
});

router.post('/open', authRequired, async (req, res, next) => {
  try {
    const body = z.object({ opening_cash: z.number().nonnegative() }).parse(req.body);
    res.status(201).json(await shifts.openShift(req.user!.id, body.opening_cash));
  } catch (e) {
    next(e);
  }
});

router.post('/close', authRequired, async (req, res, next) => {
  try {
    const body = z.object({ closing_cash: z.number().nonnegative(), notes: z.string().optional() }).parse(req.body);
    res.json(await shifts.closeShift(req.user!.id, body.closing_cash, body.notes));
  } catch (e) {
    next(e);
  }
});

export default router;
