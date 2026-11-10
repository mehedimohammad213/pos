import { Router } from 'express';
import { authRequired, requireRoles } from '../middleware/auth';
import * as shopService from '../services/shopService';

const router = Router();

router.get('/', authRequired, async (_req, res, next) => {
  try {
    res.json(await shopService.getShopSettings());
  } catch (e) {
    next(e);
  }
});

router.put('/', authRequired, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    res.json(await shopService.updateShopSettings(req.body));
  } catch (e) {
    next(e);
  }
});

export default router;
