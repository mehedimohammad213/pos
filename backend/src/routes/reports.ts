import { Router } from 'express';
import { authRequired, requirePermission } from '../middleware/auth';
import * as reports from '../services/reportService';
import { query } from '../db/pool';

const router = Router();

router.get('/dashboard', authRequired, async (req, res, next) => {
  try {
    res.json(await reports.dashboardSummary(req.query.date as string | undefined));
  } catch (e) {
    next(e);
  }
});

router.get('/sales', authRequired, async (req, res, next) => {
  try {
    const from = (req.query.from as string) || new Date().toISOString().slice(0, 10);
    const to = (req.query.to as string) || from;
    const groupBy = (req.query.group_by as 'product' | 'category' | 'brand' | 'cashier') || 'product';
    const rows = await reports.salesReport(from, to, groupBy);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.send(reports.toCsv(rows as Record<string, unknown>[]));
      return;
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.get('/profit', authRequired, requirePermission('see_cost'), async (req, res, next) => {
  try {
    const from = (req.query.from as string) || new Date().toISOString().slice(0, 10);
    const to = (req.query.to as string) || from;
    res.json(await reports.profitReport(from, to));
  } catch (e) {
    next(e);
  }
});

router.get('/stock-valuation', authRequired, requirePermission('see_cost'), async (_req, res, next) => {
  try {
    res.json(await reports.stockValuation());
  } catch (e) {
    next(e);
  }
});

router.get('/exchanges', authRequired, async (req, res, next) => {
  try {
    const from = (req.query.from as string) || new Date().toISOString().slice(0, 10);
    const to = (req.query.to as string) || from;
    res.json(await reports.exchangesSummary(from, to));
  } catch (e) {
    next(e);
  }
});

router.get('/audit', authRequired, requirePermission('manage_users'), async (req, res, next) => {
  try {
    const r = await query(
      `SELECT a.*, u.name AS user_name FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 200`
    );
    res.json(r.rows);
  } catch (e) {
    next(e);
  }
});

export default router;
