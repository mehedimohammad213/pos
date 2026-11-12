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
    const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    res.json(await expenses.listExpenses(
      req.query.from as string | undefined,
      req.query.to as string | undefined,
      {
        page: page !== undefined || paginate ? (page || 1) : undefined,
        limit: limit !== undefined || paginate ? (limit || 20) : undefined,
      }
    ));
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
