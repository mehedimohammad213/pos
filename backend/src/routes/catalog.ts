import { param } from '../utils/params';
import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRoles } from '../middleware/auth';
import * as catalog from '../services/catalogService';

const router = Router();

router.get('/categories', authRequired, async (_req, res, next) => {
  try {
    res.json(await catalog.listCategories());
  } catch (e) {
    next(e);
  }
});

router.post('/categories', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    const body = z.object({ name: z.string(), description: z.string().optional() }).parse(req.body);
    res.status(201).json(await catalog.createCategory(body.name, body.description));
  } catch (e) {
    next(e);
  }
});

router.get('/brands', authRequired, async (_req, res, next) => {
  try {
    res.json(await catalog.listBrands());
  } catch (e) {
    next(e);
  }
});

router.post('/brands', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    const body = z.object({ name: z.string() }).parse(req.body);
    res.status(201).json(await catalog.createBrand(body.name));
  } catch (e) {
    next(e);
  }
});

router.get('/products', authRequired, async (req, res, next) => {
  try {
    res.json(
      await catalog.listProducts({
        q: req.query.q as string | undefined,
        category_id: req.query.category_id as string | undefined,
        brand_id: req.query.brand_id as string | undefined,
        low_stock: req.query.low_stock === '1',
        include_inactive: req.query.include_inactive === '1',
      })
    );
  } catch (e) {
    next(e);
  }
});

router.get('/products/barcode/:code', authRequired, async (req, res, next) => {
  try {
    res.json(await catalog.getProductByBarcode(param(req.params.code)));
  } catch (e) {
    next(e);
  }
});

router.get('/products/:id', authRequired, async (req, res, next) => {
  try {
    res.json(await catalog.getProduct(param(req.params.id)));
  } catch (e) {
    next(e);
  }
});

router.post('/products', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    res.status(201).json(await catalog.createProduct(req.body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.patch('/products/:id', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    res.json(await catalog.updateProduct(param(req.params.id), req.body, req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.post('/products/import', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    const body = z
      .object({
        rows: z.array(z.record(z.string(), z.unknown())),
        options: z
          .object({
            updateExisting: z.boolean().optional(),
            autoCreateCategories: z.boolean().optional(),
            autoCreateBrands: z.boolean().optional(),
            autoGenerateSku: z.boolean().optional(),
            autoGenerateBarcode: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(req.body);
    res.json(await catalog.importProductsBulk(body.rows, body.options, req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.post('/stock/adjust', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    const body = z
      .object({
        product_id: z.string().uuid(),
        quantity_change: z.number(),
        reason: z.string().min(1),
        notes: z.string().optional(),
      })
      .parse(req.body);
    res.json(
      await catalog.adjustStock(body.product_id, body.quantity_change, body.reason, body.notes, req.user!.id)
    );
  } catch (e) {
    next(e);
  }
});

router.get('/serials', authRequired, async (req, res, next) => {
  try {
    res.json(
      await catalog.listSerials({
        product_id: req.query.product_id as string | undefined,
        status: req.query.status as string | undefined,
        q: req.query.q as string | undefined,
      })
    );
  } catch (e) {
    next(e);
  }
});

router.post('/serials', authRequired, requireRoles('admin', 'manager', 'stock'), async (req, res, next) => {
  try {
    const body = z
      .object({ product_id: z.string().uuid(), serial_numbers: z.array(z.string().min(1)).min(1) })
      .parse(req.body);
    res.status(201).json(await catalog.addSerials(body.product_id, body.serial_numbers, req.user!.id));
  } catch (e) {
    next(e);
  }
});

router.get('/low-stock', authRequired, async (_req, res, next) => {
  try {
    res.json(await catalog.lowStockDemandList());
  } catch (e) {
    next(e);
  }
});

export default router;
