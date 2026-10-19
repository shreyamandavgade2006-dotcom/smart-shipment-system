import express from 'express';
import crypto from 'crypto';
import ExceptionModel, {
  EXCEPTION_TYPES,
  SEVERITIES,
  EXCEPTION_STATUSES,
  ESCALATION_LEVELS,
  TEAMS,
} from '../models/Exception.js';
import Shipment from '../models/Shipment.js';
import { protect, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { generateRecoveryPlan } from '../services/gemini.js';
import { TEAM_BY_TYPE } from '../services/recovery.js';
import { recordAudit } from '../services/audit.js';
import { notify, TEAM_ROLES, ESCALATION_TARGET_ROLES } from '../services/notify.js';

const router = express.Router();
router.use(protect);

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const genExceptionId = () => `EXC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const OPEN_STATES = ['Open', 'In Progress', 'Escalated'];

// ---- List -------------------------------------------------------------------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { q = '', severity, status, type, team, unresolved, critical, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (severity && SEVERITIES.includes(severity)) filter.severity = severity;
    if (type && EXCEPTION_TYPES.includes(type)) filter.type = type;
    if (team && TEAMS.includes(team)) filter.assignedTeam = team;
    if (status && EXCEPTION_STATUSES.includes(status)) filter.status = status;
    if (unresolved === 'true') filter.status = { $in: OPEN_STATES };
    if (critical === 'true') {
      filter.severity = { $in: ['High', 'Critical'] };
      filter.status = { $in: OPEN_STATES };
    }
    if (q) {
      const rx = new RegExp(escapeRx(String(q).trim()), 'i');
      filter.$or = [{ exceptionId: rx }, { trackingId: rx }, { description: rx }, { type: rx }];
    }
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const [items, total] = await Promise.all([
      ExceptionModel.find(filter).sort({ createdAt: -1 }).skip((pg - 1) * lim).limit(lim),
      ExceptionModel.countDocuments(filter),
    ]);
    res.json({ items, total, page: pg, pages: Math.max(1, Math.ceil(total / lim)) });
  })
);

// ---- Detail -----------------------------------------------------------------
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const exception = await ExceptionModel.findById(req.params.id).populate(
      'shipment',
      'trackingId origin destination status priority expectedDeliveryDate sender recipient currentLocation'
    );
    if (!exception) return res.status(404).json({ message: 'Exception not found' });
    res.json({ exception });
  })
);

// ---- Create (any authenticated staff role can report) ------------------------
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { trackingId, shipmentId, type, description, severity, assignedTeam } = req.body || {};
    const errors = [];
    if (!type || !EXCEPTION_TYPES.includes(type)) errors.push(`Type must be one of: ${EXCEPTION_TYPES.join(', ')}`);
    if (!description || description.trim().length < 5) errors.push('Description is required (min 5 characters)');
    if (severity && !SEVERITIES.includes(severity)) errors.push(`Severity must be one of: ${SEVERITIES.join(', ')}`);
    if (assignedTeam && !TEAMS.includes(assignedTeam)) errors.push(`Team must be one of: ${TEAMS.join(', ')}`);
    if (!trackingId && !shipmentId) errors.push('A tracking ID (or shipment) is required');
    if (errors.length) return res.status(400).json({ message: errors.join('; ') });

    const shipment = shipmentId
      ? await Shipment.findById(shipmentId)
      : await Shipment.findOne({ trackingId: String(trackingId).trim().toUpperCase() });
    if (!shipment) {
      return res.status(404).json({ message: `Shipment not found${trackingId ? ` for tracking ID "${trackingId}"` : ''}` });
    }

    const team = assignedTeam || TEAM_BY_TYPE[type] || 'Operations';
    const exception = await ExceptionModel.create({
      exceptionId: genExceptionId(),
      shipment: shipment._id,
      trackingId: shipment.trackingId,
      type,
      description: description.trim(),
      severity: severity || 'Medium',
      assignedTeam: team,
      reportedBy: `${req.user.name} (${req.user.role})`,
    });

    shipment.timeline.push({
      type: 'exception',
      message: `Exception ${exception.exceptionId} reported: ${type} (${exception.severity} severity) — assigned to ${team}`,
      actor: req.user.name,
      meta: { exceptionId: exception.exceptionId },
    });
    // Operational side-effect: a delivery delay marks the shipment delayed.
    if (type === 'Delivery Delay' && !['Delivered', 'Cancelled'].includes(shipment.status) && shipment.status !== 'Delayed') {
      shipment.status = 'Delayed';
      shipment.timeline.push({ type: 'status', message: 'Status automatically set to "Delayed" due to reported delivery delay', status: 'Delayed', actor: 'System' });
    }
    await shipment.save();
    recordAudit({
      actor: req.user,
      action: 'exception.created',
      entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
      summary: `Reported ${type} exception ${exception.exceptionId} on ${shipment.trackingId} (${exception.severity} severity, assigned to ${team})`,
      changes: [
        { field: 'status', from: null, to: 'Open' },
        { field: 'type', from: null, to: type },
        { field: 'severity', from: null, to: exception.severity },
        { field: 'assignedTeam', from: null, to: team },
        ...(shipment.status === 'Delayed' && type === 'Delivery Delay' ? [{ field: 'shipment.status', from: null, to: 'Delayed (auto)' }] : []),
      ],
      meta: { trackingId: shipment.trackingId },
    });
    const isSevere = ['High', 'Critical'].includes(exception.severity);
    notify({
      type: 'exception',
      severity: exception.severity === 'Critical' ? 'critical' : isSevere ? 'warning' : 'info',
      title: `New ${exception.severity.toLowerCase()} exception on ${shipment.trackingId}`,
      message: `${type} reported by ${req.user.name} — ${exception.exceptionId}, assigned to ${team}`,
      link: `/exceptions/${exception._id}`,
      entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
      targetRoles: [...new Set([...(TEAM_ROLES[team] || ['Operations']), ...(isSevere ? ['Supervisor', 'Admin'] : [])])],
      actor: req.user,
    });
    res.status(201).json({ exception });
  })
);

// ---- Update severity / team / status (moderation) ----------------------------
router.patch(
  '/:id',
  authorize('Supervisor', 'Admin', 'Operations'),
  asyncHandler(async (req, res) => {
    const { severity, assignedTeam, status, description } = req.body || {};
    if (severity && !SEVERITIES.includes(severity)) return res.status(400).json({ message: 'Invalid severity' });
    if (assignedTeam && !TEAMS.includes(assignedTeam)) return res.status(400).json({ message: 'Invalid team' });
    if (status && !EXCEPTION_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });

    const exception = await ExceptionModel.findById(req.params.id);
    if (!exception) return res.status(404).json({ message: 'Exception not found' });

    const changes = [];
    const auditChanges = [];
    if (severity && severity !== exception.severity) {
      changes.push(`severity ${exception.severity} → ${severity}`);
      auditChanges.push({ field: 'severity', from: exception.severity, to: severity });
      exception.severity = severity;
    }
    if (assignedTeam && assignedTeam !== exception.assignedTeam) {
      changes.push(`reassigned ${exception.assignedTeam} → ${assignedTeam}`);
      auditChanges.push({ field: 'assignedTeam', from: exception.assignedTeam, to: assignedTeam });
      exception.assignedTeam = assignedTeam;
      const shipment = await Shipment.findById(exception.shipment);
      if (shipment) {
        shipment.timeline.push({
          type: 'assignment',
          message: `Exception ${exception.exceptionId} reassigned to ${assignedTeam} by ${req.user.name}`,
          actor: req.user.name,
        });
        await shipment.save();
      }
    }
    if (status && status !== exception.status) {
      changes.push(`status ${exception.status} → ${status}`);
      auditChanges.push({ field: 'status', from: exception.status, to: status });
      exception.status = status;
      if (status === 'Resolved' && !exception.resolution?.at) {
        exception.resolution = { notes: 'Marked resolved', by: req.user.name, at: new Date() };
      }
    }
    if (description && description.trim().length >= 5) exception.description = description.trim();
    if (!changes.length && !description) return res.status(400).json({ message: 'No changes supplied' });

    await exception.save();
    recordAudit({
      actor: req.user,
      action: 'exception.updated',
      entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
      summary: `Moderated exception ${exception.exceptionId} (${exception.trackingId}): ${changes.join('; ') || 'description edited'}`,
      changes: auditChanges,
      meta: { trackingId: exception.trackingId },
    });
    // Targeted notifications for moderation changes.
    const teamChange = auditChanges.find((c) => c.field === 'assignedTeam');
    if (teamChange) {
      notify({
        type: 'assignment',
        severity: 'info',
        title: `${exception.exceptionId} assigned to your area`,
        message: `${req.user.name} reassigned ${exception.exceptionId} (${exception.trackingId}, ${exception.type}) to ${teamChange.to}`,
        link: `/exceptions/${exception._id}`,
        entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
        targetRoles: [...new Set([...(TEAM_ROLES[teamChange.to] || ['Operations']), 'Supervisor'])],
        actor: req.user,
      });
    }
    const sevChange = auditChanges.find((c) => c.field === 'severity');
    if (sevChange && ['High', 'Critical'].includes(sevChange.to)) {
      notify({
        type: 'exception',
        severity: sevChange.to === 'Critical' ? 'critical' : 'warning',
        title: `${exception.exceptionId} severity raised to ${sevChange.to}`,
        message: `${req.user.name} raised ${exception.exceptionId} (${exception.trackingId}) from ${sevChange.from} to ${sevChange.to}`,
        link: `/exceptions/${exception._id}`,
        entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
        targetRoles: ['Supervisor', 'Admin', 'Operations'],
        actor: req.user,
      });
    }
    res.json({ exception, message: changes.join('; ') || 'Updated' });
  })
);

// ---- Escalate ------------------------------------------------------------------
router.post(
  '/:id/escalate',
  authorize('Dispatcher', 'Supervisor', 'Admin'),
  asyncHandler(async (req, res) => {
    const { reason } = req.body || {};
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ message: 'An escalation reason is required (min 5 characters)' });
    }
    const exception = await ExceptionModel.findById(req.params.id);
    if (!exception) return res.status(404).json({ message: 'Exception not found' });
    if (['Resolved', 'Closed'].includes(exception.status)) {
      return res.status(400).json({ message: 'Cannot escalate a resolved/closed exception' });
    }
    if (exception.escalationLevel >= ESCALATION_LEVELS.length - 1) {
      return res.status(400).json({ message: `Already at maximum escalation level (${ESCALATION_LEVELS.at(-1)})` });
    }

    const fromLevel = ESCALATION_LEVELS[exception.escalationLevel];
    exception.escalationLevel += 1;
    const toLevel = ESCALATION_LEVELS[exception.escalationLevel];
    exception.status = 'Escalated';
    exception.escalations.push({ fromLevel, toLevel, reason: reason.trim(), by: `${req.user.name} (${req.user.role})` });
    await exception.save();

    const shipment = await Shipment.findById(exception.shipment);
    if (shipment) {
      shipment.timeline.push({
        type: 'escalation',
        message: `Exception ${exception.exceptionId} escalated ${fromLevel} → ${toLevel}: ${reason.trim()}`,
        actor: req.user.name,
        meta: { exceptionId: exception.exceptionId, toLevel },
      });
      await shipment.save();
    }
    recordAudit({
      actor: req.user,
      action: 'exception.escalated',
      entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
      summary: `Escalated ${exception.exceptionId} (${exception.trackingId}) ${fromLevel} → ${toLevel}`,
      changes: [
        { field: 'escalationLevel', from: fromLevel, to: toLevel },
        { field: 'status', from: 'Open/In Progress', to: 'Escalated' },
      ],
      meta: { reason: reason.trim(), trackingId: exception.trackingId },
    });
    // The key role-targeted notification: whoever just took ownership
    // (toLevel) gets notified — everyone else does not.
    notify({
      type: 'escalation',
      severity: toLevel === 'Supervisor' ? 'warning' : 'critical',
      title: `Escalated to ${toLevel}: ${exception.exceptionId}`,
      message: `${req.user.name} escalated ${exception.type} on ${exception.trackingId} (${exception.exceptionId}, ${exception.severity}). Reason: ${reason.trim()}`,
      link: `/exceptions/${exception._id}`,
      entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
      targetRoles: ESCALATION_TARGET_ROLES[toLevel] || ['Supervisor', 'Admin'],
      actor: req.user,
    });
    res.json({ exception, message: `Escalated from ${fromLevel} to ${toLevel}` });
  })
);

// ---- Resolve ---------------------------------------------------------------------
router.post(
  '/:id/resolve',
  authorize('Supervisor', 'Operations', 'Admin'),
  asyncHandler(async (req, res) => {
    const { notes } = req.body || {};
    if (!notes || notes.trim().length < 5) {
      return res.status(400).json({ message: 'Resolution notes are required (min 5 characters)' });
    }
    const exception = await ExceptionModel.findById(req.params.id);
    if (!exception) return res.status(404).json({ message: 'Exception not found' });
    if (['Resolved', 'Closed'].includes(exception.status)) {
      return res.status(400).json({ message: 'Exception is already resolved' });
    }
    const prevStatus = exception.status;
    exception.status = 'Resolved';
    exception.resolution = { notes: notes.trim(), by: `${req.user.name} (${req.user.role})`, at: new Date() };
    await exception.save();
    let recovered = false;

    const shipment = await Shipment.findById(exception.shipment);
    if (shipment) {
      shipment.timeline.push({
        type: 'resolution',
        message: `Exception ${exception.exceptionId} resolved by ${req.user.name}: ${notes.trim()}`,
        actor: req.user.name,
        meta: { exceptionId: exception.exceptionId },
      });
      // Auto-recover a "Delayed" shipment once no open exceptions remain.
      const remaining = await ExceptionModel.countDocuments({
        shipment: shipment._id,
        _id: { $ne: exception._id },
        status: { $in: OPEN_STATES },
      });
      if (shipment.status === 'Delayed' && remaining === 0) {
        shipment.status = 'In Transit';
        recovered = true;
        shipment.timeline.push({
          type: 'status',
          message: 'All exceptions resolved — shipment automatically returned to "In Transit"',
          status: 'In Transit',
          actor: 'System',
        });
      }
      await shipment.save();
    }
    recordAudit({
      actor: req.user,
      action: 'exception.resolved',
      entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
      summary: `Resolved ${exception.exceptionId} (${exception.trackingId}, ${exception.type})`,
      changes: [{ field: 'status', from: prevStatus, to: 'Resolved' }],
      meta: { resolutionNotes: notes.trim(), trackingId: exception.trackingId, shipmentRecovered: recovered },
    });
    notify({
      type: 'resolution',
      severity: 'info',
      title: `${exception.exceptionId} resolved`,
      message: `${req.user.name} resolved ${exception.type} on ${exception.trackingId}.${recovered ? ' Shipment is back in transit.' : ''} ${notes.trim().slice(0, 120)}`,
      link: `/exceptions/${exception._id}`,
      entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
      targetRoles: [...new Set(['Dispatcher', 'Customer Service', 'Supervisor', ...(['High', 'Critical'].includes(exception.severity) ? ['Admin'] : [])])],
      actor: req.user,
    });
    res.json({ exception, message: 'Exception resolved' });
  })
);

// ---- AI recovery plan -------------------------------------------------------------
router.post(
  '/:id/ai-plan',
  asyncHandler(async (req, res) => {
    const exception = await ExceptionModel.findById(req.params.id);
    if (!exception) return res.status(404).json({ message: 'Exception not found' });
    const shipment = await Shipment.findById(exception.shipment);
    const plan = await generateRecoveryPlan({ shipment, exception });
    exception.aiPlan = plan;
    await exception.save();
    if (shipment) {
      shipment.timeline.push({
        type: 'ai',
        message: `AI recovery plan generated for ${exception.exceptionId} (${plan.source})`,
        actor: req.user.name,
      });
      await shipment.save();
    }
    recordAudit({
      actor: req.user,
      action: 'ai.plan_generated',
      entity: { kind: 'Exception', id: exception._id, ref: exception.exceptionId },
      summary: `Generated AI recovery plan for exception ${exception.exceptionId} (${exception.trackingId}) via ${plan.source}`,
      meta: { source: plan.source, riskLevel: plan.riskLevel, priorityLevel: plan.priorityLevel, recommendedTeam: plan.recommendedTeam, trackingId: exception.trackingId },
    });
    res.json({ plan });
  })
);

export default router;
