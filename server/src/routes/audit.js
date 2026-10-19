import express from 'express';
import AuditLog from '../models/AuditLog.js';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();

// Audit Logs are ADMIN-ONLY, and this router deliberately exposes NO create,
// update or delete endpoints — records are append-only and tamper-proof
// from the application layer.
router.use(protect, authorize('Admin'));

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q = '', category, action, from, to, page = 1, limit = 15 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (action) filter.action = action;
    if (from || to) {
      filter.at = {};
      if (from && !isNaN(new Date(from))) filter.at.$gte = new Date(from);
      if (to && !isNaN(new Date(to))) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        filter.at.$lte = end;
      }
    }
    if (q) {
      const rx = new RegExp(escapeRx(String(q).trim()), 'i');
      filter.$or = [{ summary: rx }, { 'entity.ref': rx }, { 'actor.name': rx }, { action: rx }];
    }
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 15));
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ at: -1 }).skip((pg - 1) * lim).limit(lim),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items, total, page: pg, pages: Math.max(1, Math.ceil(total / lim)) });
  })
);

router.get(
  '/meta',
  asyncHandler(async (req, res) => {
    const [categories, actions] = await Promise.all([
      AuditLog.distinct('category'),
      AuditLog.distinct('action'),
    ]);
    res.json({ categories: categories.sort(), actions: actions.sort() });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const log = await AuditLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: 'Audit record not found' });
    res.json({ log });
  })
);

export default router;
