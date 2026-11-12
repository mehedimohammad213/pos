import { param } from '../utils/params';
import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRoles } from '../middleware/auth';
import * as purchase from '../services/purchaseService';

const router = Router();

router.get('/suppliers', authRequired, async (req, res, next) => {
  try {
    const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    res.json(await purchase.listSuppliers({
      q: req.query.q as string | undefined,
      page: page !== undefined || paginate ? (page || 1) : undefined,
      limit: limit !== undefined || paginate ? (limit || 20) : undefined,
    }));
  } catch (e) {
    next(e);
  }
});

router.post('/suppliers', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    res.status(201).json(await purchase.createSupplier(req.body));
  } catch (e) {
    next(e);
  }
});

router.patch('/suppliers/:id', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    res.json(await purchase.updateSupplier(param(req.params.id), req.body));
  } catch (e) {
    next(e);
  }
});

router.post('/suppliers/pay', authRequired, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const body = z
      .object({
        supplier_id: z.string().uuid(),
        amount: z.number().positive(),
        purchase_id: z.string().uuid().optional(),
        method: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    res.json(await purchase.paySupplier(body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.get('/demands', authRequired, async (req, res, next) => {
  try {
    const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    res.json(await purchase.listDemands(req.query.status as string | undefined, {
      page: page !== undefined || paginate ? (page || 1) : undefined,
      limit: limit !== undefined || paginate ? (limit || 20) : undefined,
    }));
  } catch (e) {
    next(e);
  }
});

router.get('/demands/:id', authRequired, async (req, res, next) => {
  try {
    res.json(await purchase.getDemand(param(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/demands', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    const body = z
      .object({
        demand_date: z.string().optional(),
        preferred_supplier_id: z.string().uuid().optional(),
        notes: z.string().optional(),
        items: z
          .array(
            z.object({
              product_id: z.string().uuid(),
              requested_qty: z.number().positive(),
              last_cost: z.number().optional(),
            })
          )
          .min(1),
      })
      .parse(req.body);
    res.status(201).json(await purchase.createDemand(body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.patch('/demands/:id/status', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    const body = z.object({ status: z.string() }).parse(req.body);
    res.json(await purchase.updateDemandStatus(param(req.params.id), body.status, req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.get('/', authRequired, async (req, res, next) => {
  try {
    const page = req.query.page !== undefined ? Number(req.query.page) : undefined;
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const paginate = req.query.paginate === '1' || req.query.paginate === 'true';
    res.json(await purchase.listPurchases({
      supplier_id: req.query.supplier_id as string | undefined,
      page: page !== undefined || paginate ? (page || 1) : undefined,
      limit: limit !== undefined || paginate ? (limit || 20) : undefined,
    }));
  } catch (e) {
    next(e);
  }
});

router.get('/:id', authRequired, async (req, res, next) => {
  try {
    res.json(await purchase.getPurchase(param(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    const body = z
      .object({
        supplier_id: z.string().uuid().optional(),
        demand_id: z.string().uuid().optional(),
        invoice_no: z.string().optional(),
        purchase_date: z.string().optional(),
        notes: z.string().optional(),
        paid_amount: z.number().optional(),
        items: z
          .array(
            z.object({
              product_id: z.string().uuid(),
              quantity: z.number().positive(),
              unit_cost: z.number().nonnegative(),
              serials: z.array(z.string()).optional(),
            })
          )
          .min(1),
      })
      .parse(req.body);
    res.status(201).json(await purchase.createPurchase(body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

export default router;
