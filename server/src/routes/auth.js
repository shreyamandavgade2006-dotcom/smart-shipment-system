import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User, { ROLES } from '../models/User.js';
import { config } from '../config.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { recordAudit } from '../services/audit.js';
import { notify } from '../services/notify.js';

const router = express.Router();

const sign = (user) =>
  jwt.sign({ id: user._id, role: user.role, name: user.name }, config.jwtSecret, { expiresIn: '12h' });

const publicUser = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, role } = req.body || {};
    const errors = [];
    if (!name || name.trim().length < 2) errors.push('Name is required (min 2 characters)');
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push('A valid email is required');
    if (!password || password.length < 6) errors.push('Password must be at least 6 characters');
    if (role && !ROLES.includes(role)) errors.push(`Role must be one of: ${ROLES.join(', ')}`);
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(409).json({ message: 'An account with this email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name: name.trim(), email, password: hashed, role: role || 'Dispatcher' });
    recordAudit({
      actor: { name: user.name, role: user.role, email: user.email, _id: user._id },
      action: 'auth.register',
      entity: { kind: 'User', id: user._id, ref: user.email },
      summary: `New account registered: ${user.name} (${user.email}) as ${user.role}`,
      changes: [{ field: 'role', from: null, to: user.role }],
    });
    notify({
      type: 'user',
      severity: 'info',
      title: `New ${user.role} account registered`,
      message: `${user.name} (${user.email}) joined as ${user.role}.`,
      link: '/users',
      targetRoles: ['Admin'],
      actor: user,
    });
    res.status(201).json({ token: sign(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    res.json({ token: sign(user), user: publicUser(user) });
  })
);

router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => res.json({ user: publicUser(req.user) }))
);

export default router;
