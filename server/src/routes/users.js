import express from 'express';
import User, { ROLES } from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { recordAudit } from '../services/audit.js';
import { notify } from '../services/notify.js';

const router = express.Router();
router.use(protect, authorize('Admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const users = await User.find().select('-password').sort({ createdAt: 1 });
    res.json({ users, roles: ROLES });
  })
);

router.patch(
  '/:id/role',
  asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!ROLES.includes(role)) return res.status(400).json({ message: `Role must be one of: ${ROLES.join(', ')}` });
    if (String(req.user._id) === req.params.id) {
      return res.status(400).json({ message: 'You cannot change your own role' });
    }
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    const prevRole = user.role;
    user.role = role;
    await user.save();
    recordAudit({
      actor: req.user,
      action: 'user.role_changed',
      entity: { kind: 'User', id: user._id, ref: user.email },
      summary: `Changed role of ${user.name} (${user.email}) ${prevRole} → ${role}`,
      changes: [{ field: 'role', from: prevRole, to: role }],
    });
    // Direct, user-targeted notification to the affected account + admins.
    await notify({
      type: 'user',
      severity: 'info',
      title: 'Your role has been changed',
      message: `${req.user.name} changed your role from ${prevRole} to ${role}. Your permissions update on your next sign-in.`,
      link: '/',
      targetUser: user._id,
      actor: req.user,
    });
    notify({
      type: 'user',
      severity: 'info',
      title: `Role changed: ${user.name}`,
      message: `${req.user.name} changed ${user.name}'s role from ${prevRole} to ${role}.`,
      link: '/users',
      targetRoles: ['Admin'],
      actor: req.user,
    });
    res.json({ user, message: `${user.name} is now ${role}` });
  })
);

export default router;
