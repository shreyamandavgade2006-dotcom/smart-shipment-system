import express from 'express';
import Shipment from '../models/Shipment.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();

// Public, unauthenticated tracking — limited, customer-safe projection only.
router.get(
  '/:trackingId',
  asyncHandler(async (req, res) => {
    const trackingId = String(req.params.trackingId || '').trim().toUpperCase();
    if (!trackingId) return res.status(400).json({ message: 'Tracking ID is required' });
    const shipment = await Shipment.findOne({ trackingId });
    if (!shipment) return res.status(404).json({ message: `No shipment found for tracking ID "${trackingId}"` });

    res.json({
      trackingId: shipment.trackingId,
      status: shipment.status,
      origin: shipment.origin,
      destination: shipment.destination,
      currentLocation: shipment.currentLocation,
      expectedDeliveryDate: shipment.expectedDeliveryDate,
      carrier: shipment.carrier,
      trackingSource: shipment.trackingSource,
      lastLocationUpdateAt: shipment.lastLocationUpdateAt || shipment.updatedAt,
      timeline: shipment.timeline
        .filter((e) => ['created', 'status', 'resolution'].includes(e.type))
        .map((e) => ({ type: e.type, message: e.message, status: e.status, at: e.at, actor: e.actor }))
        .sort((a, b) => new Date(b.at) - new Date(a.at)),
    });
  })
);

export default router;
