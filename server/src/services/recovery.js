// Rule-based recovery plan generator.
// Acts as the resilient fallback whenever Gemini is unavailable, AND as the
// shape-normalization baseline for AI-generated plans.

export const TEAM_BY_TYPE = {
  'Delivery Delay': 'Dispatch Team',
  'Vehicle Breakdown': 'Fleet & Maintenance',
  'Missing Documents': 'Documentation Team',
  'Unreachable Recipient': 'Customer Support',
  'Damaged Shipment': 'Operations',
  'Lost Shipment': 'Operations',
  'Weather / Natural Cause': 'Dispatch Team',
  Other: 'Operations',
};

const PLAYBOOKS = {
  'Delivery Delay': {
    actions: [
      ['Confirm current vehicle GPS position and obtain a revised ETA from the driver', 'Dispatcher', 2],
      ['Reroute via the fastest alternative corridor and update the route plan', 'Dispatch Team', 4],
      ['Proactively notify the recipient with the revised delivery window', 'Customer Support', 3],
      ['Flag the shipment for priority unloading at the destination hub', 'Operations', 8],
    ],
    preventive: [
      'Add buffer time to this corridor in future route planning',
      'Review carrier on-time performance for this lane',
    ],
  },
  'Vehicle Breakdown': {
    actions: [
      ['Dispatch the nearest replacement vehicle to the breakdown location', 'Fleet & Maintenance', 3],
      ['Arrange secure cargo transfer with chain-of-custody documentation', 'Operations', 5],
      ['Verify cargo condition after transfer (fragile/perishable checks)', 'Operations', 6],
      ['File a maintenance incident report and schedule a full vehicle inspection', 'Fleet & Maintenance', 24],
    ],
    preventive: [
      'Increase preventive maintenance frequency for this fleet segment',
      'Maintain standby vehicle agreements on long-haul corridors',
    ],
  },
  'Missing Documents': {
    actions: [
      ['Request digital copies of the missing documents from the sender', 'Documentation Team', 2],
      ['Pre-clear the shipment with the customs/regulatory desk using soft copies', 'Documentation Team', 6],
      ['Courier original documents to the hold location if hard copies are mandatory', 'Operations', 24],
      ['Update the shipment record with a completed document checklist', 'Documentation Team', 1],
    ],
    preventive: ['Enforce a pre-departure document checklist at the origin hub'],
  },
  'Unreachable Recipient': {
    actions: [
      ['Attempt contact on all channels (phone, SMS, email) at 2-hour intervals', 'Customer Support', 2],
      ['Confirm an alternate contact person or neighbour-delivery authorization', 'Customer Support', 6],
      ['Hold the shipment at the nearest hub and schedule a second delivery attempt', 'Operations', 12],
      ['If unreachable after 48 hours, initiate the return-to-origin procedure', 'Operations', 48],
    ],
    preventive: ['Validate recipient contact details at booking time'],
  },
  'Damaged Shipment': {
    actions: [
      ['Quarantine the damaged goods and photograph condition for the claim file', 'Operations', 2],
      ['Assess salvageability; repack if safe to continue transit', 'Operations', 8],
      ['Initiate the insurance claim with the full evidence package', 'Operations', 24],
      ['Offer the recipient a replacement shipment or partial refund options', 'Customer Support', 12],
    ],
    preventive: [
      'Review packaging standards for this product category',
      'Audit handling procedures at the last transfer point',
    ],
  },
  'Lost Shipment': {
    actions: [
      ['Trace the last scanned checkpoint and conduct a physical search at that hub', 'Operations', 6],
      ['Review CCTV and custody handoffs between checkpoints', 'Operations', 24],
      ['File a police/insurance report if not located within 24 hours', 'Operations', 30],
      ['Communicate the compensation process to sender and recipient', 'Customer Support', 36],
    ],
    preventive: ['Increase scan checkpoint frequency on high-value lanes'],
  },
  'Weather / Natural Cause': {
    actions: [
      ['Monitor official weather advisories for the affected corridor', 'Dispatch Team', 2],
      ['Hold the shipment at a secure facility until conditions improve', 'Operations', 12],
      ['Recalculate the route around the affected zone', 'Dispatch Team', 8],
      ['Inform all stakeholders of the force-majeure delay status', 'Customer Support', 3],
    ],
    preventive: ['Feed corridor weather alerts directly into the dispatch system'],
  },
  Other: {
    actions: [
      ['Assign an owner to investigate and document the root cause', 'Operations', 4],
      ['Contain the immediate operational impact on the shipment', 'Operations', 6],
      ['Update stakeholders with current status and next checkpoint', 'Customer Support', 4],
      ['Review the case in the daily operations stand-up', 'Supervisor', 24],
    ],
    preventive: ['Add this scenario to the operations playbook'],
  },
};

const SEVERITY_META = {
  Critical: {
    riskLevel: 'Severe',
    priorityLevel: 'P1 - Immediate Response',
    slaHours: 4,
    escalation: { needed: true, level: 'Senior Management', reason: 'Critical severity requires senior-management oversight and authority to unlock emergency resources.' },
  },
  High: {
    riskLevel: 'High',
    priorityLevel: 'P2 - Urgent',
    slaHours: 8,
    escalation: { needed: true, level: 'Supervisor', reason: 'High severity should be supervised until resolution to keep SLA under control.' },
  },
  Medium: {
    riskLevel: 'Moderate',
    priorityLevel: 'P3 - Standard',
    slaHours: 24,
    escalation: { needed: false, level: 'Supervisor', reason: 'Escalate to Supervisor if not resolved within 24 hours.' },
  },
  Low: {
    riskLevel: 'Low',
    priorityLevel: 'P4 - Monitor',
    slaHours: 48,
    escalation: { needed: false, level: 'Supervisor', reason: 'Monitor; escalate only if conditions worsen.' },
  },
};

function hoursOverdue(shipment) {
  if (!shipment?.expectedDeliveryDate) return 0;
  const diff = Date.now() - new Date(shipment.expectedDeliveryDate).getTime();
  return Math.max(0, Math.round(diff / 36e5));
}

export function ruleBasedPlan({ shipment, exception }) {
  const type = exception?.type || 'Other';
  const severity = exception?.severity || 'Medium';
  const playbook = PLAYBOOKS[type] || PLAYBOOKS.Other;
  const meta = SEVERITY_META[severity] || SEVERITY_META.Medium;
  const team = TEAM_BY_TYPE[type] || 'Operations';
  const overdue = hoursOverdue(shipment);

  const title = exception
    ? `${type} on ${shipment?.trackingId || 'shipment'}`
    : `Proactive risk review for ${shipment?.trackingId || 'shipment'}`;

  const riskAssessment = [
    `Shipment ${shipment?.trackingId || ''} (${shipment?.origin || '?'} → ${shipment?.destination || '?'})`,
    `is currently "${shipment?.status || 'Unknown'}"${shipment?.currentLocation ? ` near ${shipment.currentLocation}` : ''}.`,
    exception ? `A "${type}" exception of ${severity} severity is ${String(exception.status || 'Open').toLowerCase()}.` : 'No active exception is recorded; this is a preventive review.',
    overdue > 0 ? `The expected delivery date has already passed by ~${overdue}h, compounding customer-experience and SLA risk.` : 'The delivery commitment is currently within the planned window.',
    `Overall risk is assessed as ${meta.riskLevel}; target containment within ${meta.slaHours} hours.`,
  ].join(' ');

  const eta = shipment?.expectedDeliveryDate
    ? new Date(
        Math.max(
          new Date(shipment.expectedDeliveryDate).getTime() + overdue * 36e5,
          Date.now() + 24 * 36e5
        )
      ).toDateString()
    : 'the revised schedule';

  const customerMessage = exception
    ? `Dear ${shipment?.recipient?.name || 'Customer'}, we want to personally update you about your shipment ${shipment?.trackingId || ''}. ${type === 'Delivery Delay' ? `Due to an operational delay, your delivery is now expected by ${eta}.` : `We identified an issue (${type.toLowerCase()}) and our ${team} is actively resolving it.`} Your shipment is safe and being handled with priority. We sincerely apologize for the inconvenience and will notify you at every milestone. — SmartShip Customer Care`
    : `Dear ${shipment?.recipient?.name || 'Customer'}, your shipment ${shipment?.trackingId || ''} is progressing as planned (${shipment?.origin || ''} → ${shipment?.destination || ''}) and is currently "${shipment?.status || 'in processing'}". Expected delivery: ${shipment?.expectedDeliveryDate ? new Date(shipment.expectedDeliveryDate).toDateString() : 'on schedule'}. We will keep you informed at every step. — SmartShip Customer Care`;

  return {
    summary: `${title}: ${
      severity === 'Critical'
        ? 'all-stop containment and executive visibility required.'
        : severity === 'High'
          ? 'urgent corrective action with supervisor oversight recommended.'
          : 'controlled, playbook-driven recovery recommended.'
    }`,
    riskAssessment,
    riskLevel: meta.riskLevel,
    priorityLevel: meta.priorityLevel,
    recommendedTeam: exception?.assignedTeam || team,
    actions: playbook.actions.map(([action, owner, etaHours], i) => ({ step: i + 1, action, owner, etaHours })),
    escalationSuggestion: meta.escalation,
    customerMessage,
    preventiveMeasures: playbook.preventive,
    generatedAt: new Date().toISOString(),
    source: 'rule-based',
    validation: {
      checked: ['recommendedTeam', 'escalationLevel', 'riskLevel', 'priorityLevel', 'etaHours range'],
      adjustments: [],
      valuesAreApproved: true,
      note: 'Generated from the approved rule-based playbooks. Values are advisory until confirmed by an authorized user.',
    },
  };
}

const VALID_TEAMS = ['Dispatch Team', 'Fleet & Maintenance', 'Documentation Team', 'Customer Support', 'Operations', 'External Carrier'];
const VALID_LEVELS = ['Dispatcher', 'Supervisor', 'Senior Management', 'External Partner'];
const VALID_RISKS = ['Low', 'Moderate', 'High', 'Severe'];
const VALID_PRIORITIES = ['P1 - Immediate Response', 'P2 - Urgent', 'P3 - Standard', 'P4 - Monitor'];

/**
 * Merge an AI-generated plan onto the baseline so the response ALWAYS has
 * every required field, AND validate model output against approved domain
 * values. Invalid model values are clamped to the rule-based baseline and the
 * adjustment is recorded in plan.validation so the UI can show exactly what
 * was corrected and keep a clear line between AI suggestions and approved values.
 */
export function normalizePlan(ai, baseline) {
  const out = { ...baseline };
  const adjustments = [];

  if (ai && typeof ai === 'object') {
    for (const key of ['summary', 'riskAssessment', 'customerMessage']) {
      if (typeof ai[key] === 'string' && ai[key].trim()) out[key] = ai[key].trim().slice(0, 2000);
    }

    // riskLevel
    if (typeof ai.riskLevel === 'string' && VALID_RISKS.includes(ai.riskLevel)) out.riskLevel = ai.riskLevel;
    else if (ai.riskLevel) adjustments.push(`riskLevel "${ai.riskLevel}" not in approved set → kept baseline "${out.riskLevel}"`);

    // priorityLevel
    if (typeof ai.priorityLevel === 'string') {
      const match = VALID_PRIORITIES.find((p) => p.toLowerCase().startsWith(ai.priorityLevel.trim().slice(0, 2).toLowerCase())) ||
        VALID_PRIORITIES.find((p) => p === ai.priorityLevel);
      if (match) out.priorityLevel = match;
      else adjustments.push(`priorityLevel "${ai.priorityLevel}" not recognized → kept baseline "${out.priorityLevel}"`);
    }

    // recommendedTeam (must be a real team)
    if (typeof ai.recommendedTeam === 'string') {
      const t = VALID_TEAMS.find((x) => x.toLowerCase() === ai.recommendedTeam.trim().toLowerCase());
      if (t) out.recommendedTeam = t;
      else adjustments.push(`recommendedTeam "${ai.recommendedTeam}" is not an approved team → kept baseline "${out.recommendedTeam}"`);
    }

    // actions
    if (Array.isArray(ai.actions) && ai.actions.length) {
      out.actions = ai.actions.slice(0, 8).map((a, i) => ({
        step: i + 1,
        action: String(a?.action || a?.description || 'Follow-up action').slice(0, 300),
        owner: String(a?.owner || 'Operations').slice(0, 60),
        etaHours: Math.min(168, Math.max(1, Number.isFinite(+a?.etaHours) ? +a.etaHours : 24)),
      }));
    }

    // preventive measures
    if (Array.isArray(ai.preventiveMeasures) && ai.preventiveMeasures.length) {
      out.preventiveMeasures = ai.preventiveMeasures.slice(0, 6).map((m) => String(m).slice(0, 200));
    }

    // escalationSuggestion.level (must be a real level)
    if (ai.escalationSuggestion && typeof ai.escalationSuggestion === 'object') {
      let level = baseline.escalationSuggestion.level;
      if (typeof ai.escalationSuggestion.level === 'string') {
        const l = VALID_LEVELS.find((x) => x.toLowerCase() === ai.escalationSuggestion.level.trim().toLowerCase());
        if (l) level = l;
        else if (ai.escalationSuggestion.level) adjustments.push(`escalation level "${ai.escalationSuggestion.level}" not recognized → kept baseline "${level}"`);
      }
      out.escalationSuggestion = {
        needed: !!ai.escalationSuggestion.needed,
        level,
        reason: String(ai.escalationSuggestion.reason || baseline.escalationSuggestion.reason).slice(0, 400),
      };
    }
  }

  out.validation = {
    checked: ['recommendedTeam', 'escalationLevel', 'riskLevel', 'priorityLevel', 'etaHours range'],
    adjustments,
    valuesAreApproved: adjustments.length === 0,
    note: 'AI output is advisory only. Values are validated against the approved teams, escalation levels, priority classes and risk levels before display. No recovery action is executed automatically.',
  };
  return out;
}
