import Notification from '../models/Notification.js';
import Shipment from '../models/Shipment.js';
import ExceptionModel, { ESCALATION_LEVELS } from '../models/Exception.js';
import { deliverNotification } from './delivery.js';

/* Role maps — where each kind of alert belongs. */
export const TEAM_ROLES = {
  'Dispatch Team': ['Dispatcher'],
  'Customer Support': ['Customer Service'],
  'Fleet & Maintenance': ['Operations'],
  'Documentation Team': ['Operations'],
  Operations: ['Operations'],
  'External Carrier': ['Operations'],
};

// Who gets notified when an exception is escalated TO that level.
export const ESCALATION_TARGET_ROLES = {
  Supervisor: ['Supervisor', 'Admin'],
  'Senior Management': ['Admin'],
  'External Partner': ['Admin', 'Operations'],
};

// Role relevance for state-based (computed) alerts.
export const STATE_ALERT_ROLES = {
  critical: ['Supervisor', 'Admin', 'Operations'],
  high: ['Supervisor', 'Admin', 'Operations'],
  overdue: ['Dispatcher', 'Operations', 'Supervisor'],
  escalated: ['Admin'],
  delayed: ['Dispatcher', 'Operations', 'Supervisor', 'Customer Service'],
};

/**
 * Create a persisted, targeted notification. NEVER throws — notifications
 * must not break core workflows.
 */
export async function notify({ type, severity = 'info', title, message, link, entity = {}, targetRoles = [], targetUser, actor }) {
  try {
    const doc = await Notification.create({
      type,
      severity,
      title,
      message,
      link,
      entity,
      targetRoles: targetUser ? [] : targetRoles,
      targetUser,
      actor: actor ? { id: actor._id || actor.id, name: actor.name, role: actor.role } : undefined,
    });
    // External delivery with failure handling (in-app always delivered).
    await deliverNotification(doc);
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

/** Query builder: everything addressed to this user's role or to them directly. */
export function feedFilter(user) {
  return {
    $and: [
      { $or: [{ targetUser: user._id }, { targetRoles: user.role }, { targetRoles: { $size: 0 } }] },
      // Hide notifications about actions the user performed themselves
      // (unless it was explicitly directed at them).
      { $or: [{ 'actor.id': { $ne: user._id } }, { 'actor.id': { $exists: false } }, { targetUser: user._id }] },
    ],
  };
}

/**
 * Current-state warnings (late/critical/escalated work right now), filtered by
 * role relevance so each role only sees what concerns them.
 */
export async function computeStateAlerts(user) {
  const now = new Date();
  const [overdue, delayed, critical, escalated] = await Promise.all([
    Shipment.find({ status: { $nin: ['Delivered', 'Cancelled', 'Delayed'] }, expectedDeliveryDate: { $lt: now } })
      .select('trackingId destination expectedDeliveryDate status')
      .sort({ expectedDeliveryDate: 1 })
      .limit(8),
    Shipment.find({ status: 'Delayed' }).select('trackingId destination expectedDeliveryDate status').limit(8),
    ExceptionModel.find({ severity: { $in: ['Critical', 'High'] }, status: { $in: ['Open', 'In Progress', 'Escalated'] } })
      .sort({ createdAt: -1 })
      .limit(8),
    ExceptionModel.find({ status: { $in: ['Open', 'In Progress', 'Escalated'] }, escalationLevel: { $gte: 2 } })
      .sort({ updatedAt: -1 })
      .limit(8),
  ]);

  const role = user.role;
  const want = (kind) => (STATE_ALERT_ROLES[kind] || []).includes(role);

  const alerts = [];
  if (want('critical')) {
    for (const e of critical) {
      alerts.push({
        kind: e.severity === 'Critical' ? 'critical' : 'high',
        title: `${e.severity} exception ${e.exceptionId}`,
        message: `${e.type} on ${e.trackingId} — ${e.status}, assigned to ${e.assignedTeam}`,
        link: `/exceptions/${e._id}`,
        at: e.createdAt,
      });
    }
  }
  if (want('overdue')) {
    for (const s of overdue) {
      alerts.push({
        kind: 'overdue',
        title: `${s.trackingId} is overdue`,
        message: `Expected ${new Date(s.expectedDeliveryDate).toLocaleString('en-IN')} — currently "${s.status}"`,
        link: `/shipments/${s._id}`,
        at: s.expectedDeliveryDate,
      });
    }
  }
  if (want('escalated')) {
    for (const e of escalated) {
      alerts.push({
        kind: 'escalated',
        title: `${e.exceptionId} at ${ESCALATION_LEVELS[e.escalationLevel]} level`,
        message: `${e.type} on ${e.trackingId} — needs ${ESCALATION_LEVELS[e.escalationLevel]} attention`,
        link: `/exceptions/${e._id}`,
        at: e.updatedAt,
      });
    }
  }
  if (want('delayed')) {
    for (const s of delayed) {
      alerts.push({
        kind: 'delayed',
        title: `${s.trackingId} marked delayed`,
        message: `Heading to ${s.destination} — originally expected ${new Date(s.expectedDeliveryDate).toLocaleDateString('en-IN')}`,
        link: `/shipments/${s._id}`,
        at: s.expectedDeliveryDate,
      });
    }
  }

  const ORDER = { critical: 0, high: 1, overdue: 2, escalated: 3, delayed: 4 };
  return alerts.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || new Date(b.at) - new Date(a.at)).slice(0, 12);
}
