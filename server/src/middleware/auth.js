import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import User from '../models/User.js';

export async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authorized: no token provided' });
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'Not authorized: user no longer exists' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Not authorized: invalid or expired token' });
  }
}

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({
      message: `Forbidden: role '${req.user?.role}' is not permitted to perform this action`,
    });
  }
  next();
};
