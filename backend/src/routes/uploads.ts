import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { authRequired, requireRoles } from '../middleware/auth';
import { AppError } from '../utils/errors';

const router = Router();

const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext) ? ext : '.bin';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new AppError('Only image files are allowed', 400));
      return;
    }
    cb(null, true);
  },
});

router.post('/', authRequired, requireRoles('admin', 'manager', 'stock'), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return next(new AppError(err.message, 400));
      }
      return next(err);
    }
    try {
      if (!req.file) throw new AppError('No file uploaded', 400);
      const url = `/uploads/${req.file.filename}`;
      res.status(201).json({ url, filename: req.file.filename, size: req.file.size });
    } catch (e) {
      next(e);
    }
  });
});

export default router;
export { uploadsDir };
