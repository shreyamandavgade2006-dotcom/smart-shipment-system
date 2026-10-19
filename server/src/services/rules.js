/**
 * Business-rules engine. Rule DM-01: any shipment whose ETA has passed while
 * in an active transport status is auto-flagged "Delayed" — forming consistent,
 * explainable delayed-delivery alerts across the whole network.
 */
import Shipment from '../models/Shipment.js';
import { recordAudit } from './audit.js';
import { notify } from './notify.js';
import { config } from '../config.js';

const RULE_ID = 'DM-01';
const ACTIVE_STATUSES = ['Picked Up', 'In Transit', 'Out for Delivery'];
// 'On Hold' is deliberately untouched: a hold is an intentional operational state.

export const RULES = [
  {
    id: RULE_ID,
    name: 'Overdue auto-delay',
    description: `Shipments in [${ACTIVE_STATUSES.join(', ')}] past their expected delivery date are flagged "Delayed", timeline-logged, audited and alerted to Dispatcher/Operations/Supervisor/Customer Service.`,
  },
];

export async function runDelaySweep({ actor = null } = {}) {
  const now = new Date();
  const overdue = await Shipment.find({ status: { $in: ACTIVE_STATUSES }, expectedDeliveryDate: { $lt: now } });
  const flagged = [];
  for (const shipment of overdue) {
    const hoursLate = Math.round((now - shipment.expectedDeliveryDate.getTime()) / 36e5);
    const prev = shipment.status;
    shipment.status = 'Delayed';
    shipment.timeline.push({
      type: 'status',
      message: `Automatically flagged "Delayed" by rule ${RULE_ID} (ETA passed ~${hoursLate}h ago)`,
      status: 'Delayed',
      actor: `System · rule ${RULE_ID}`,
      meta: { rule: RULE_ID, previousStatus: prev },
    });
    await shipment.save();
    flagged.push({ trackingId: shipment.trackingId, previousStatus: prev, hoursLate });
    recordAudit({
      actor: actor || { name: `System · rule ${RULE_ID}`, role: 'System' },
      action: 'shipment.status_changed',
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      summary: `Rule ${RULE_ID} flagged ${shipment.trackingId} ${prev} → Delayed (ETA overdue ~${hoursLate}h)`,
      changes: [{ field: 'status', from: prev, to: 'Delayed' }],
      meta: { rule: RULE_ID, hoursLate, triggeredBy: actor ? `${actor.name} (manual sweep)` : 'scheduled sweep' },
    });
    notify({
      type: 'delay',
      severity: hoursLate >= 24 ? 'critical' : 'warning',
      title: `Rule ${RULE_ID}: ${shipment.trackingId} auto-flagged delayed`,
      message: `${shipment.trackingId} (${shipment.origin} → ${shipment.destination}) was "${prev}" and is ~${hoursLate}h past its ETA — marked Delayed automatically.`,
      link: `/shipments/${shipment._id}`,
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      targetRoles: ['Dispatcher', 'Operations', 'Supervisor', 'Customer Service'],
      actor: actor || undefined,
    });
  }
  return { rule: RULE_ID, checkedAt: now, flaggedCount: flagged.length, flagged };
}

export function startRulesScheduler() {
  if (!config.rulesSweepEnabled) {
    console.log(`[rules] DM-01 scheduler disabled (RULES_SWEEP=off)`);
    return null;
  }
  // first sweep shortly after startup, then on the configured interval
  const first = setTimeout(() => runDelaySweep().then((r) => r.flaggedCount && console.log(`[rules] DM-01 flagged ${r.flaggedCount} shipment(s)`)).catch(() => {}), 15000);
  const every = setInterval(() => runDelaySweep().then((r) => r.flaggedCount && console.log(`[rules] DM-01 flagged ${r.flaggedCount} shipment(s)`)).catch(() => {}), config.rulesSweepIntervalMin * 60000);
  first.unref?.();
  every.unref?.();
  console.log(`[rules] DM-01 auto-delay sweep active every ${config.rulesSweepIntervalMin} min`);
  return every;
}
