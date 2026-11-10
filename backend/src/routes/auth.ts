import { param } from '../utils/params';
import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requirePermission } from '../middleware/auth';
import * as authService from '../services/authService';

const router = Router();

router.post('/login', async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    res.json(await authService.login(body.email, body.password));
  } catch (e) {
    next(e);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const body = z.object({ refreshToken: z.string() }).parse(req.body);
    res.json(await authService.refresh(body.refreshToken));
  } catch (e) {
    next(e);
  }
});

router.post('/logout', authRequired, async (req, res, next) => {
  try {
    await authService.logout(req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/me', authRequired, async (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', authRequired, requirePermission('manage_users'), async (_req, res, next) => {
  try {
    res.json(await authService.listUsers());
  } catch (e) {
    next(e);
  }
});

router.post('/users', authRequired, requirePermission('manage_users'), async (req, res, next) => {
  try {
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        password: z.string().min(6),
        role: z.enum(['admin', 'manager', 'cashier', 'stock']),
        permissions: z.record(z.string(), z.boolean()).optional(),
      })
      .parse(req.body);
    res.status(201).json(await authService.createUser(body));
  } catch (e) {
    next(e);
  }
});

router.patch('/users/:id', authRequired, requirePermission('manage_users'), async (req, res, next) => {
  try {
    res.json(await authService.updateUser(param(req.params.id), req.body));
  } catch (e) {
    next(e);
  }
});

export default router;
