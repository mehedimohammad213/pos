import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRoles } from '../middleware/auth';
import * as expenses from '../services/expenseService';

const router = Router();

router.get('/categories', authRequired, async (_req, res, next) => {
  try {
    res.json(await expenses.listExpenseCategories());
  } catch (e) {
    next(e);
  }
});

router.post('/categories', authRequired, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const body = z.object({ name: z.string() }).parse(req.body);
    res.status(201).json(await expenses.createExpenseCategory(body.name));
  } catch (e) {
    next(e);
  }
});

router.get('/', authRequired, async (req, res, next) => {
  try {
    res.json(await expenses.listExpenses(req.query.from as string | undefined, req.query.to as string | undefined));
  } catch (e) {
    next(e);
  }
});

router.post('/', authRequired, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const body = z
      .object({
        category_id: z.string().uuid().optional(),
        amount: z.number().positive(),
        expense_date: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(await expenses.createExpense(body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

export default router;
