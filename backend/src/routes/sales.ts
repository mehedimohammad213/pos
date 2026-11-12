import { param } from '../utils/params';
import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth';
import * as sales from '../services/saleService';
import * as returns from '../services/returnService';

const router = Router();

const lineSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_price: z.number().optional(),
  discount_amount: z.number().optional(),
  serial_ids: z.array(z.string().uuid()).optional(),
});

router.get('/', authRequired, async (req, res, next) => {
  try {
    const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    res.json(
      await sales.listSales({
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        status: req.query.status as string | undefined,
        sale_type: req.query.sale_type as string | undefined,
        q: req.query.q as string | undefined,
        page: page !== undefined || paginate ? (page || 1) : undefined,
        limit: limit !== undefined || paginate ? (limit || 20) : undefined,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.get('/held', authRequired, async (_req, res, next) => {
  try {
    res.json(await sales.listHeldSales());
  } catch (e) {
    next(e);
  }
});

router.get('/returns/list', authRequired, async (req, res, next) => {
  try {
    const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    res.json(await returns.listReturns({
      page: page !== undefined || paginate ? (page || 1) : undefined,
      limit: limit !== undefined || paginate ? (limit || 20) : undefined,
    }));
  } catch (e) {
    next(e);
  }
});

router.get('/exchanges/list', authRequired, async (req, res, next) => {
  try {
    const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    res.json(await returns.listExchanges({
      page: page !== undefined || paginate ? (page || 1) : undefined,
      limit: limit !== undefined || paginate ? (limit || 20) : undefined,
    }));
  } catch (e) {
    next(e);
  }
});

router.post('/returns', authRequired, async (req, res, next) => {
  try {
    const body = z
      .object({
        sale_id: z.string().uuid(),
        reason: z.string().optional(),
        restock: z.boolean().optional(),
        items: z
          .array(
            z.object({
              sale_item_id: z.string().uuid(),
              quantity: z.number().positive(),
              serial_id: z.string().uuid().optional(),
              condition: z.enum(['restock', 'defective']).optional(),
            })
          )
          .min(1),
      })
      .parse(req.body);
    res.status(201).json(await returns.createReturn(body, req.user!));
  } catch (e) {
    next(e);
  }
});

router.post('/exchanges', authRequired, async (req, res, next) => {
  try {
    res.status(201).json(await returns.createExchange(req.body, req.user!));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', authRequired, async (req, res, next) => {
  try {
    res.json(await sales.getSale(param(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/', authRequired, async (req, res, next) => {
  try {
    const body = z
      .object({
        customer_id: z.string().uuid().optional(),
        sale_type: z.enum(['retail', 'wholesale']).default('retail'),
        sale_date: z.string().optional(),
        discount_amount: z.number().optional(),
        notes: z.string().optional(),
        hold: z.boolean().optional(),
        hold_name: z.string().optional(),
        items: z.array(lineSchema).min(1),
        payments: z
          .array(z.object({ method: z.string(), amount: z.number(), reference: z.string().optional() }))
          .optional(),
        installment: z
          .object({
            down_payment: z.number().nonnegative(),
            months: z.number().int().positive(),
            start_date: z.string().optional(),
          })
          .optional(),
      })
      .parse(req.body);
    res.status(201).json(await sales.createSale(body, req.user!));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/recall', authRequired, async (req, res, next) => {
  try {
    res.json(await sales.recallHold(param(req.params.id), req.user!, req.body.payments));
  } catch (e) {
    next(e);
  }
});

router.post('/:id/void', authRequired, async (req, res, next) => {
  try {
    res.json(await sales.voidSale(param(req.params.id), req.user!));
  } catch (e) {
    next(e);
  }
});

export default router;
