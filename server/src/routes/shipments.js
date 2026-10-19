import express from 'express';
import crypto from 'crypto';
import Shipment, { SHIPMENT_STATUSES } from '../models/Shipment.js';
import Exception from '../models/Exception.js';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { generateRecoveryPlan } from '../services/gemini.js';
import { recordAudit, diffChanges } from '../services/audit.js';
import { notify } from '../services/notify.js';

const router = express.Router();
router.use(protect);

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function genTrackingId() {
  return `SHP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

const openShipmentFilter = () => ({ status: { $nin: ['Delivered', 'Cancelled'] } });

// ---- List with search / filter / pagination -------------------------------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q = '', status, priority, delayed, page = 1, limit = 10, sort = '-createdAt' } = req.query;
    const filter = {};
    if (status && SHIPMENT_STATUSES.includes(status)) filter.status = status;
    if (priority) filter.priority = priority;
    const and = [];
    if (q) {
      const rx = new RegExp(escapeRx(String(q).trim()), 'i');
      and.push({ $or: [{ trackingId: rx }, { 'sender.name': rx }, { 'recipient.name': rx }, { origin: rx }, { destination: rx }] });
    }
    if (delayed === 'true') {
      and.push({
        status: { $nin: ['Delivered', 'Cancelled'] },
        $or: [{ status: 'Delayed' }, { expectedDeliveryDate: { $lt: new Date() } }],
      });
    }
    if (and.length) filter.$and = and;

    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const [items, total] = await Promise.all([
      Shipment.find(filter).select('-timeline -lastAiPlan').sort(sort).skip((pg - 1) * lim).limit(lim),
      Shipment.countDocuments(filter),
    ]);
    res.json({ items, total, page: pg, pages: Math.max(1, Math.ceil(total / lim)) });
  })
);

// ---- Detail (with exceptions) ---------------------------------------------
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
    const exceptions = await Exception.find({ shipment: shipment._id }).sort({ createdAt: -1 });
    res.json({ shipment, exceptions });
  })
);

// ---- Create ----------------------------------------------------------------
router.post(
  '/',
  authorize('Admin', 'Dispatcher', 'Operations'),
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const errors = [];
    if (!b.sender?.name?.trim()) errors.push('Sender name is required');
    if (!b.recipient?.name?.trim()) errors.push('Recipient name is required');
    if (!b.origin?.trim()) errors.push('Origin is required');
    if (!b.destination?.trim()) errors.push('Destination is required');
    if (!b.expectedDeliveryDate || isNaN(new Date(b.expectedDeliveryDate))) errors.push('A valid expected delivery date is required');
    if (b.status && !SHIPMENT_STATUSES.includes(b.status)) errors.push('Invalid status');
    if (b.weight !== undefined && b.weight !== null && b.weight !== '' && (+b.weight < 0 || isNaN(+b.weight))) errors.push('Weight must be a non-negative number');
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    let trackingId = (b.trackingId || '').trim().toUpperCase() || genTrackingId();
    if (b.trackingId && (await Shipment.findOne({ trackingId }))) {
      return res.status(409).json({ message: `Tracking ID ${trackingId} already exists` });
    }

    const shipment = await Shipment.create({
      trackingId,
      sender: b.sender,
      recipient: b.recipient,
      origin: b.origin.trim(),
      destination: b.destination.trim(),
      expectedDeliveryDate: new Date(b.expectedDeliveryDate),
      status: b.status || 'Created',
      priority: b.priority || 'Standard',
      weight: b.weight === '' || b.weight === undefined ? undefined : +b.weight,
      notes: b.notes,
      currentLocation: b.currentLocation || b.origin.trim(),
      assignedTeam: b.assignedTeam || 'Dispatch Team',
      carrier: b.carrier?.name
        ? { name: b.carrier.name, code: (b.carrier.code || 'EXT').toUpperCase(), service: b.carrier.service }
        : undefined,
      trackingSource: 'manual',
      lastLocationUpdateAt: new Date(),
      createdBy: req.user._id,
      timeline: [
        {
          type: 'created',
          message: `Shipment created by ${req.user.name} (${req.user.role})`,
          status: b.status || 'Created',
          actor: req.user.name,
        },
      ],
    });
    recordAudit({
      actor: req.user,
      action: 'shipment.created',
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      summary: `Created shipment ${shipment.trackingId} (${shipment.origin} → ${shipment.destination})`,
      changes: [
        { field: 'status', from: null, to: shipment.status },
        { field: 'origin', from: null, to: shipment.origin },
        { field: 'destination', from: null, to: shipment.destination },
        { field: 'expectedDeliveryDate', from: null, to: shipment.expectedDeliveryDate },
        { field: 'priority', from: null, to: shipment.priority },
        { field: 'sender.name', from: null, to: shipment.sender?.name },
        { field: 'recipient.name', from: null, to: shipment.recipient?.name },
      ],
    });
    res.status(201).json({ shipment });
  })
);

// ---- Update general fields --------------------------------------------------
router.put(
  '/:id',
  authorize('Admin', 'Dispatcher', 'Operations'),
  asyncHandler(async (req, res) => {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
    const before = shipment.toObject();
    const b = req.body || {};
    if (b.expectedDeliveryDate && isNaN(new Date(b.expectedDeliveryDate))) {
      return res.status(400).json({ message: 'A valid expected delivery date is required' });
    }
    const fields = ['origin', 'destination', 'notes', 'priority', 'assignedTeam', 'currentLocation', 'weight'];
    for (const f of fields) if (b[f] !== undefined) shipment[f] = b[f] === '' && f === 'weight' ? undefined : b[f];
    if (b.sender) shipment.sender = { ...shipment.sender.toObject(), ...b.sender };
    if (b.recipient) shipment.recipient = { ...shipment.recipient.toObject(), ...b.recipient };
    if (b.carrier?.name) shipment.carrier = { ...shipment.carrier?.toObject?.() ?? {}, ...b.carrier, code: (b.carrier.code || 'EXT').toUpperCase() };
    if (b.expectedDeliveryDate) shipment.expectedDeliveryDate = new Date(b.expectedDeliveryDate);
    await shipment.save();
    const changes = diffChanges(before, shipment.toObject(), [
      'origin', 'destination', 'notes', 'priority', 'assignedTeam', 'currentLocation', 'weight',
      'expectedDeliveryDate', 'sender.name', 'sender.contact', 'sender.address',
      'recipient.name', 'recipient.contact', 'recipient.address', 'carrier.name', 'carrier.code',
    ]);
    recordAudit({
      actor: req.user,
      action: 'shipment.updated',
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      summary: `Updated shipment ${shipment.trackingId} (${changes.length} change${changes.length === 1 ? '' : 's'}: ${changes.map((c) => c.field).join(', ') || 'none'})`,
      changes,
    });
    res.json({ shipment });
  })
);

// ---- Status update (timeline-aware) ----------------------------------------
router.patch(
  '/:id/status',
  authorize('Admin', 'Dispatcher', 'Operations'),
  asyncHandler(async (req, res) => {
    const { status, note, currentLocation } = req.body || {};
    if (!SHIPMENT_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${SHIPMENT_STATUSES.join(', ')}` });
    }
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

    const prev = shipment.status;
    const before_loc = shipment.currentLocation;
    if (prev === status && !currentLocation) {
      return res.status(400).json({ message: `Shipment is already "${status}"` });
    }
    shipment.status = status;
    if (currentLocation) shipment.currentLocation = currentLocation;
    // Manual updates are labeled as such so tracking-source is always clear.
    shipment.trackingSource = 'manual';
    shipment.lastLocationUpdateAt = new Date();
    shipment.timeline.push({
      type: 'status',
      message:
        prev === status
          ? `Location updated to ${currentLocation}`
          : `Status changed from "${prev}" to "${status}"${note ? ` — ${note}` : ''}`,
      status,
      actor: req.user.name,
    });
    await shipment.save();
    recordAudit({
      actor: req.user,
      action: 'shipment.status_changed',
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      summary:
        prev === status
          ? `Updated ${shipment.trackingId} location → ${currentLocation}`
          : `Changed ${shipment.trackingId} status ${prev} → ${status}${note ? ` (${note})` : ''}`,
      changes: [
        { field: 'status', from: prev, to: status },
        ...(currentLocation && currentLocation !== before_loc ? [{ field: 'currentLocation', from: before_loc, to: currentLocation }] : []),
      ],
      meta: { note },
    });
    // Targeted notifications for status changes that matter to customers/ops.
    if (prev !== status && status === 'Delayed') {
      notify({
        type: 'delay',
        severity: 'warning',
        title: `${shipment.trackingId} marked delayed`,
        message: `${req.user.name} set ${shipment.trackingId} (${shipment.origin} → ${shipment.destination}) to "Delayed"${note ? `: ${note}` : '.'}`,
        link: `/shipments/${shipment._id}`,
        entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
        targetRoles: ['Dispatcher', 'Operations', 'Supervisor', 'Customer Service'],
        actor: req.user,
      });
    } else if (prev !== status && status === 'Delivered') {
      notify({
        type: 'status',
        severity: 'info',
        title: `${shipment.trackingId} delivered`,
        message: `${shipment.trackingId} reached ${shipment.destination}. Recipient: ${shipment.recipient?.name}.`,
        link: `/shipments/${shipment._id}`,
        entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
        targetRoles: ['Customer Service', 'Dispatcher'],
        actor: req.user,
      });
    }
    res.json({ shipment });
  })
);

// ---- Delete (Admin) ----------------------------------------------------------
router.delete(
  '/:id',
  authorize('Admin'),
  asyncHandler(async (req, res) => {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
    const exceptions = await Exception.find({ shipment: shipment._id }).lean();
    await Exception.deleteMany({ shipment: shipment._id });
    await shipment.deleteOne();
    recordAudit({
      actor: req.user,
      action: 'shipment.deleted',
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      summary: `Deleted shipment ${shipment.trackingId} (${shipment.origin} → ${shipment.destination}) and ${exceptions.length} related exception(s)`,
      meta: {
        snapshot: {
          status: shipment.status,
          origin: shipment.origin,
          destination: shipment.destination,
          expectedDeliveryDate: shipment.expectedDeliveryDate,
          priority: shipment.priority,
          sender: shipment.sender?.name,
          recipient: shipment.recipient?.name,
        },
        deletedExceptions: exceptions.map((e) => e.exceptionId),
      },
    });
    res.json({ message: `Shipment ${shipment.trackingId} and its exceptions were deleted` });
  })
);

// ---- AI risk / recovery plan for a shipment (no exception required) ---------
router.post(
  '/:id/ai-plan',
  asyncHandler(async (req, res) => {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
    const plan = await generateRecoveryPlan({ shipment, exception: null });
    shipment.lastAiPlan = plan;
    shipment.timeline.push({
      type: 'ai',
      message: `AI recovery plan generated (${plan.source})`,
      actor: req.user.name,
    });
    await shipment.save();
    recordAudit({
      actor: req.user,
      action: 'ai.plan_generated',
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      summary: `Generated AI recovery plan for shipment ${shipment.trackingId} (${plan.source})`,
      meta: { source: plan.source, riskLevel: plan.riskLevel, priorityLevel: plan.priorityLevel, recommendedTeam: plan.recommendedTeam },
    });
    res.json({ plan });
  })
);

export default router;
