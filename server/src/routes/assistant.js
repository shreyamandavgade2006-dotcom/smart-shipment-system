import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { answerQuestion } from '../services/assistant.js';

const router = express.Router();
router.use(protect); // any authenticated role may use the assistant

router.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'A message is required' });
    }
    if (message.length > 1000) {
      return res.status(400).json({ message: 'Message too long (max 1000 characters)' });
    }
    const cleanHistory = Array.isArray(history)
      ? history
          .slice(-10)
          .filter((m) => m && typeof m.text === 'string' && ['user', 'assistant'].includes(m.role))
          .map((m) => ({ role: m.role, text: String(m.text).slice(0, 1000) }))
      : [];

    const result = await answerQuestion({ question: message.trim(), history: cleanHistory, user: req.user });
    res.json(result);
  })
);

export default router;
