import express from 'express';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { feedFilter, computeStateAlerts } from '../services/notify.js';

const router = express.Router();
router.use(protect);

// Per-user feed: persisted, role/user-targeted notifications + role-relevant
// current-state alerts. Every role sees only what concerns THEM.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = req.user;
    const base = feedFilter(me);
    const [feed, unreadCount, stateAlerts] = await Promise.all([
      Notification.find(base).sort({ createdAt: -1 }).limit(40).lean(),
      Notification.countDocuments({ ...base, 'readBy.user': { $ne: me._id } }),
      computeStateAlerts(me),
    ]);
    res.json({
      feed: feed.map((n) => ({
        _id: n._id,
        type: n.type,
        severity: n.severity,
        title: n.title,
        message: n.message,
        link: n.link,
        entity: n.entity,
        by: n.actor?.name,
        createdAt: n.createdAt,
        isRead: n.readBy?.some((r) => String(r.user) === String(me._id)) || false,
      })),
      stateAlerts,
      unreadCount,
      generatedAt: new Date(),
    });
  })
);

// Mark a single notification as read (only affects the current user).
router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await Notification.updateOne(
      { _id: req.params.id, 'readBy.user': { $ne: req.user._id } },
      { $push: { readBy: { user: req.user._id, at: new Date() } } }
    );
    res.json({ ok: true });
  })
);

// Mark everything in the user's feed as read.
router.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
      { ...feedFilter(req.user), 'readBy.user': { $ne: req.user._id } },
      { $push: { readBy: { user: req.user._id, at: new Date() } } }
    );
    res.json({ ok: true, modified: result.modifiedCount });
  })
);

export default router;
