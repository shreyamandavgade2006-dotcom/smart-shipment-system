import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import Shipment from '../models/Shipment.js';
import {
  verifySignature,
  processCarrierUpdate,
  simulateCarrierEvent,
  carrierProviderInfo,
} from '../services/carrier.js';
import { config } from '../config.js';

const router = express.Router();

/**
 * Inbound carrier webhook — NO JWT (carriers authenticate with an HMAC
 * signature over the raw body). Mounted with express.raw so the exact bytes
 * can be verified. In production, register this URL with your carrier:
 *   POST /api/integrations/carrier-webhook
 *   Header: x-carrier-signature: sha256=<hmac-sha256 of body with CARRIER_WEBHOOK_SECRET>
 */
router.post(
  '/carrier-webhook',
  asyncHandler(async (req, res) => {
    const raw = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.headers['x-carrier-signature'];
    if (!verifySignature(raw, signature, config.carrierWebhookSecret)) {
      return res.status(401).json({ message: 'Invalid carrier webhook signature' });
    }
    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ message: 'Malformed JSON body' });
    }
    const result = await processCarrierUpdate(payload, payload.carrier || 'carrier');
    if (result.status >= 400 && result.status !== 404) return res.status(result.status).json(result.body);
    // 404s are still ACKed so carriers stop retrying permanently-bad IDs
    return res.status(result.status).json(result.body);
  })
);

/**
 * Simulator — because no external carrier account is available in this
 * environment, staff can push a realistic, HMAC-SIGNED carrier event through
 * the very same webhook pipeline. Proves signature verification, status
 * mapping, source labeling, timeline, audit and notifications end-to-end.
 */
router.post(
  '/simulate',
  protect,
  authorize('Admin', 'Dispatcher', 'Operations'),
  asyncHandler(async (req, res) => {
    const { trackingId } = req.body || {};
    if (!trackingId) return res.status(400).json({ message: 'trackingId is required' });
    const shipment = await Shipment.findOne({ trackingId: String(trackingId).trim().toUpperCase() });
    if (!shipment) return res.status(404).json({ message: `Shipment not found: ${trackingId}` });
    if (['Delivered', 'Cancelled'].includes(shipment.status)) {
      return res.status(400).json({ message: `Shipment is "${shipment.status}" — no further carrier events apply` });
    }
    const result = await simulateCarrierEvent(shipment, req.user);
    res.json({ simulated: true, ...result });
  })
);

router.get(
  '/carrier',
  protect,
  asyncHandler(async (req, res) => res.json(carrierProviderInfo()))
);

export default router;
