import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { runDelaySweep, RULES } from '../services/rules.js';
import { config } from '../config.js';

const router = express.Router();
router.use(protect);

// Business-rule definitions + scheduler state.
router.get(
  '/',
  authorize('Admin', 'Supervisor', 'Operations'),
  asyncHandler(async (req, res) => {
    res.json({
      rules: RULES,
      scheduler: { enabled: config.rulesSweepEnabled, intervalMinutes: config.rulesSweepIntervalMin },
    });
  })
);

// Run the delay sweep immediately.
router.post(
  '/sweep',
  authorize('Admin', 'Supervisor', 'Operations'),
  asyncHandler(async (req, res) => {
    const result = await runDelaySweep({ actor: req.user });
    res.json(result);
  })
);

export default router;
