import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import shopRoutes from './routes/shop';
import catalogRoutes from './routes/catalog';
import purchaseRoutes from './routes/purchases';
import customerRoutes from './routes/customers';
import salesRoutes from './routes/sales';
import installmentRoutes from './routes/installments';
import warrantyRoutes from './routes/warranty';
import expenseRoutes from './routes/expenses';
import reportRoutes from './routes/reports';
import shiftRoutes from './routes/shifts';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'hardware-pos-api', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/catalog', catalogRoutes);
  app.use('/api/purchases', purchaseRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/installments', installmentRoutes);
  app.use('/api/warranty', warrantyRoutes);
  app.use('/api/expenses', expenseRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/shifts', shiftRoutes);

  app.use(errorHandler);
  return app;
}
