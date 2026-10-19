import Shipment, { SHIPMENT_STATUSES } from '../models/Shipment.js';
import ExceptionModel, { SEVERITIES, ESCALATION_LEVELS } from '../models/Exception.js';
import { config } from '../config.js';
import { ruleBasedPlan } from './recovery.js';
import { recordAudit } from './audit.js';

const OPEN_STATES = ['Open', 'In Progress', 'Escalated'];

/* ---------------------------------------------------------------------------
 * Live data context — refreshed on EVERY question so answers are always
 * based on accurate, up-to-date shipment and exception data.
 * ------------------------------------------------------------------------- */
export async function buildDataContext(scanTexts = []) {
  const now = new Date();
  const [statusAgg, sevAgg, delayedShipments, criticalExceptions, openByTeamAgg, deliveredOnTime, deliveredTotal, recentActivity, seniorEscalations, totals] =
    await Promise.all([
      Shipment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      ExceptionModel.aggregate([{ $match: { status: { $in: OPEN_STATES } } }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      Shipment.find({ status: { $nin: ['Delivered', 'Cancelled'] }, $or: [{ status: 'Delayed' }, { expectedDeliveryDate: { $lt: now } }] })
        .select('trackingId origin destination status priority expectedDeliveryDate currentLocation')
        .sort({ expectedDeliveryDate: 1 })
        .limit(8)
        .lean(),
      ExceptionModel.find({ severity: { $in: ['High', 'Critical'] }, status: { $in: OPEN_STATES } })
        .select('exceptionId trackingId type severity status assignedTeam escalationLevel description createdAt')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      ExceptionModel.aggregate([{ $match: { status: { $in: OPEN_STATES } } }, { $group: { _id: '$assignedTeam', count: { $sum: 1 } } }]),
      Shipment.countDocuments({ status: 'Delivered', $expr: { $lte: ['$updatedAt', '$expectedDeliveryDate'] } }),
      Shipment.countDocuments({ status: 'Delivered' }),
      Shipment.aggregate([
        { $unwind: '$timeline' },
        { $sort: { 'timeline.at': -1 } },
        { $limit: 8 },
        { $project: { _id: 0, trackingId: 1, type: '$timeline.type', message: '$timeline.message', at: '$timeline.at' } },
      ]),
      ExceptionModel.find({ status: { $in: OPEN_STATES }, escalationLevel: { $gte: 2 } })
        .select('exceptionId trackingId type severity escalationLevel')
        .limit(5)
        .lean(),
      Promise.all([Shipment.countDocuments(), ExceptionModel.countDocuments(), ExceptionModel.countDocuments({ status: { $in: OPEN_STATES } })]),
    ]);

  const byStatus = Object.fromEntries(statusAgg.map((r) => [r._id, r.count]));
  // Fill zeroes for a complete picture
  for (const s of SHIPMENT_STATUSES) byStatus[s] = byStatus[s] || 0;

  // Entity-specific lookups for any IDs mentioned (question + recent history).
  const mentionedShipments = [];
  const mentionedExceptions = [];
  const scan = scanTexts.join(' ').toUpperCase();
  const shipIds = [...new Set([...scan.matchAll(/SHP-[A-Z0-9-]{3,}/g)].map((m) => m[0]))].slice(0, 3);
  const excIds = [...new Set([...scan.matchAll(/EXC-[A-Z0-9-]{3,}/g)].map((m) => m[0]))].slice(0, 3);
  for (const tid of shipIds) {
    const s = await Shipment.findOne({ trackingId: tid }).select('-lastAiPlan').lean();
    if (s) {
      const exceptions = await ExceptionModel.find({ shipment: s._id, status: { $in: OPEN_STATES } })
        .select('exceptionId type severity status assignedTeam escalationLevel')
        .lean();
      mentionedShipments.push({ ...s, timeline: s.timeline.slice(-6), openExceptions: exceptions });
    }
  }
  for (const eid of excIds) {
    const e = await ExceptionModel.findOne({ exceptionId: eid }).populate('shipment', 'trackingId origin destination status expectedDeliveryDate').lean();
    if (e) mentionedExceptions.push(e);
  }

  return {
    generatedAt: now.toISOString(),
    _note: 'All counts/metrics below were computed directly by MongoDB aggregation queries — quote them verbatim, never recompute them yourself.',
    totals: { shipments: totals[0], exceptions: totals[1], openExceptions: totals[2] },
    shipmentsByStatus: byStatus,
    onTimeRate: deliveredTotal ? Math.round((deliveredOnTime / deliveredTotal) * 100) : null,
    deliveredTotal,
    delayedOrOverdue: delayedShipments.map((s) => ({
      trackingId: s.trackingId,
      route: `${s.origin} -> ${s.destination}`,
      status: s.status,
      priority: s.priority,
      expectedDeliveryDate: s.expectedDeliveryDate,
      hoursLate: Math.max(0, Math.round((now - new Date(s.expectedDeliveryDate).getTime()) / 36e5)),
      currentLocation: s.currentLocation,
    })),
    openExceptionsBySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, sevAgg.find((r) => r._id === s)?.count || 0])),
    openExceptionsByTeam: Object.fromEntries(openByTeamAgg.map((r) => [r._id, r.count])),
    criticalOpenExceptions: criticalExceptions.map((e) => ({
      exceptionId: e.exceptionId,
      trackingId: e.trackingId,
      type: e.type,
      severity: e.severity,
      status: e.status,
      team: e.assignedTeam,
      escalationLevel: `${e.escalationLevel} (${ESCALATION_LEVELS[e.escalationLevel]})`,
      reportedAt: e.createdAt,
      summary: e.description.slice(0, 160),
    })),
    seniorEscalations: seniorEscalations.map((e) => ({
      exceptionId: e.exceptionId,
      trackingId: e.trackingId,
      type: e.type,
      level: ESCALATION_LEVELS[e.escalationLevel],
    })),
    recentActivity: recentActivity.map((r) => `${r.trackingId}: ${r.message}`),
    mentionedShipments,
    mentionedExceptions,
  };
}

/* ---------------------------------------------------------------------------
 * Gemini answer
 * ------------------------------------------------------------------------- */
async function answerWithGemini({ question, history, ctx, user }) {
  const system = `You are "SmartShip Assistant", an expert AI logistics analyst inside a shipment management system.
STRICT RULES:
- Answer ONLY using the DATA section below. It is freshly retrieved from MongoDB. The totals, onTimeRate, per-status and per-severity counts were computed by database aggregation queries — QUOTE THEM VERBATIM. Never add/subtract/recompute numbers (e.g., never sum arrays yourself). Never invent shipments, IDs, people, carriers or numbers.
- Data scope: the viewer's role is ${user.role}. You may ONLY discuss data present in the DATA section — exactly what this role is authorized to read. Audit logs and user/role administration are Admin-only: if asked about them and the viewer is not Admin, explain that and suggest an alternative.
- The assistant is READ-ONLY and advisory: never claim or imply that you updated, deleted, escalated, resolved or otherwise changed any record. Frame next steps as suggestions an authorized user can perform in the UI.
- Be concise and operational: short paragraphs, bullet lists for enumerations, **bold** for tracking IDs, exception IDs, key numbers and statuses.
- When discussing a delayed or critical item, always give one practical next step.
Return STRICT JSON: {"answer": "markdown-ish answer text", "followUps": ["short follow-up question 1", "follow-up 2", "follow-up 3"]}`;

  const hist = (history || [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${encodeURIComponent(config.geminiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${system}\n\nDATA (live snapshot):\n${JSON.stringify(ctx)}\n\nCONVERSATION SO FAR:\n${hist || '(new conversation)'}\n\nUSER QUESTION:\n${question}` }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    if (resp.status === 429) throw new Error('Gemini rate limit reached (HTTP 429) — using fallback');
    if (resp.status >= 500) throw new Error(`Gemini service unavailable (HTTP ${resp.status}) — using fallback`);
    throw new Error(`Gemini HTTP ${resp.status}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }
  if (!parsed?.answer) throw new Error('unparseable Gemini response');
  return {
    answer: String(parsed.answer),
    followUps: Array.isArray(parsed.followUps) ? parsed.followUps.slice(0, 3).map(String) : [],
  };
}

/* ---------------------------------------------------------------------------
 * Rule-based fallback — intent-detected, data-accurate answers.
 * ------------------------------------------------------------------------- */
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function shipmentBrief(s) {
  const late = Math.max(0, Math.round((Date.now() - new Date(s.expectedDeliveryDate).getTime()) / 36e5));
  const isLate = !['Delivered', 'Cancelled'].includes(s.status) && late > 0;
  const lines = [
    `**${s.trackingId}** — ${s.origin} → ${s.destination}`,
    `- Status: **${s.status}**${s.currentLocation ? ` (last seen: ${s.currentLocation})` : ''}`,
    `- Priority: ${s.priority} · Expected: ${fmtDate(s.expectedDeliveryDate)}${isLate ? ` — **${late}h overdue**` : ''}`,
    `- Sender: ${s.sender?.name} → Recipient: ${s.recipient?.name}`,
  ];
  if (s.openExceptions?.length) {
    lines.push(`- Open exceptions: ${s.openExceptions.map((e) => `**${e.exceptionId}** (${e.type}, ${e.severity})`).join(', ')}`);
  } else {
    lines.push('- No open exceptions — running clean.');
  }
  if (s.timeline?.length) lines.push(`- Latest: ${s.timeline[s.timeline.length - 1].message}`);
  return lines.join('\n');
}

function answerWithRules({ question, history, ctx, user }) {
  const q = question.toLowerCase();
  const has = (...words) => words.some((w) => q.includes(w));
  const isAdmin = user?.role === 'Admin';

  // 0) Role-scope gate — assistant data mirrors API permissions exactly.
  if (has('audit', 'who changed', 'user role', 'permissions', 'user management', 'list users', 'activity history')) {
    if (!isAdmin) {
      return {
        answer: `That information is outside what your **${user?.role}** role is allowed to read in SmartShip (audit history and user/role administration are **Admin-only**).\n\nAsk an Admin, or try something within your scope: "which shipments are delayed", "daily operations report", or a tracking ID summary.`,
        followUps: ['Which shipments are delayed?', 'Daily operations report', 'Any critical exceptions?'],
      };
    }
    return {
      answer: 'As Admin you can review the complete, append-only trail on the **Audit Logs page** (sidebar → Audit Logs): who did what, before/after values, role changes and every AI recommendation. Users & roles are managed under **Users & Roles**.',
      followUps: ['Daily operations report', 'Which shipments are delayed?'],
    };
  }

  // 1) Specific shipment / exception lookups (most precise intents first)
  if (ctx.mentionedShipments.length && !has('delayed', 'overdue', 'late', 'all')) {
    const parts = ctx.mentionedShipments.map(shipmentBrief);
    const s = ctx.mentionedShipments[0];
    if (has('risk', 'assess')) {
      const plan = ruleBasedPlan({ shipment: s, exception: s.openExceptions?.[0] || null });
      parts.push(`\n**Risk assessment (${plan.riskLevel}):**\n${plan.riskAssessment}`);
    }
    return {
      answer: parts.join('\n\n'),
      followUps: [`What are the risks for ${s.trackingId}?`, 'Show me the daily operations report', 'Any critical exceptions right now?'],
    };
  }
  if (ctx.mentionedExceptions.length) {
    const e = ctx.mentionedExceptions[0];
    const plan = ruleBasedPlan({ shipment: e.shipment, exception: e });
    return {
      answer: [
        `**${e.exceptionId}** — ${e.type} on **${e.trackingId}**`,
        `- Severity: **${e.severity}** · Status: **${e.status}**`,
        `- Team: ${e.assignedTeam} · Level: ${ESCALATION_LEVELS[e.escalationLevel]}`,
        `- Reported by ${e.reportedBy} at ${fmtDate(e.createdAt)}`,
        `- Details: ${e.description}`,
        `\n**Recommended next step:** ${plan.actions[0].action} (owner: ${plan.actions[0].owner}, ~${plan.actions[0].etaHours}h).`,
      ].join('\n'),
      followUps: [`What's the recovery plan for ${e.trackingId}?`, 'Any other critical exceptions?', 'Daily operations report'],
    };
  }

  // 2) Delayed / overdue
  if (has('delay', 'overdue', 'late', 'behind')) {
    if (!ctx.delayedOrOverdue.length) {
      return { answer: 'Good news — **no shipments are delayed or overdue right now.** Everything is on schedule.', followUps: ['Daily operations report', 'Delivery performance stats', 'Any critical exceptions?'] };
    }
    const list = ctx.delayedOrOverdue
      .map((s) => `- **${s.trackingId}** (${s.route}) — ${s.status}, **${s.hoursLate}h late**, expected ${fmtDate(s.expectedDeliveryDate)}`)
      .join('\n');
    return {
      answer: `There ${ctx.delayedOrOverdue.length === 1 ? 'is' : 'are'} **${ctx.delayedOrOverdue.length} delayed/overdue shipment${ctx.delayedOrOverdue.length === 1 ? '' : 's'}**:\n${list}\n\n**Next step:** Start with **${ctx.delayedOrOverdue[0].trackingId}** (most overdue) — open it and generate an AI recovery plan.`,
      followUps: [`Summarize ${ctx.delayedOrOverdue[0].trackingId}`, `What's the recovery plan for ${ctx.delayedOrOverdue[0].trackingId}?`, 'Any critical exceptions?'],
    };
  }

  // 3) Critical / high exceptions
  if (has('critical', 'exception', 'issue', 'problem', 'escalat')) {
    if (!ctx.criticalOpenExceptions.length) {
      return { answer: '**No unresolved High or Critical exceptions** at the moment. The network is clean.', followUps: ['Daily operations report', 'Which shipments are delayed?', 'Delivery performance stats'] };
    }
    const list = ctx.criticalOpenExceptions
      .map((e) => `- **${e.exceptionId}** (${e.trackingId}) — ${e.type}, **${e.severity}**, ${e.status}, team: ${e.team}, level: ${e.escalationLevel}`)
      .join('\n');
    const senior = ctx.seniorEscalations.length
      ? `\n\n**⚠ Needs leadership attention:** ${ctx.seniorEscalations.map((e) => `**${e.exceptionId}** at ${e.level}`).join(', ')}.`
      : '';
    return {
      answer: `There are **${ctx.criticalOpenExceptions.length} high/critical open exceptions**:\n${list}${senior}\n\n**Next step:** Triage **${ctx.criticalOpenExceptions[0].exceptionId}** first (most recent high-severity case).`,
      followUps: [`Tell me about ${ctx.criticalOpenExceptions[0].exceptionId}`, 'Show delayed shipments', 'Daily operations report'],
    };
  }

  // 4) Performance / stats
  if (has('performance', 'stats', 'statistic', 'on-time', 'ontime', 'kpi', 'metric', 'number')) {
    const s = ctx.shipmentsByStatus;
    return {
      answer: [
        '**Delivery performance snapshot**',
        `- Total shipments: **${ctx.totals.shipments}**`,
        `- Delivered: **${s['Delivered']}**${ctx.onTimeRate !== null ? ` — on-time rate **${ctx.onTimeRate}%**` : ''}`,
        `- In motion: **${s['Picked Up'] + s['In Transit'] + s['Out for Delivery']}** (picked up ${s['Picked Up']}, in transit ${s['In Transit']}, out for delivery ${s['Out for Delivery']})`,
        `- Delayed: **${s['Delayed']}** · On hold: **${s['On Hold']}** · Cancelled: ${s['Cancelled']}`,
        `- Open exceptions: **${ctx.totals.openExceptions}** (Critical ${ctx.openExceptionsBySeverity['Critical']}, High ${ctx.openExceptionsBySeverity['High']}, Medium ${ctx.openExceptionsBySeverity['Medium']}, Low ${ctx.openExceptionsBySeverity['Low']})`,
      ].join('\n'),
      followUps: ['Which shipments are delayed?', 'Daily operations report', 'Any critical exceptions?'],
    };
  }

  // 5) Daily report / briefing / summary
  if (has('report', 'daily', 'brief', 'summary', 'overview', 'digest', 'standup', 'stand-up')) {
    const s = ctx.shipmentsByStatus;
    const late = ctx.delayedOrOverdue.length;
    return {
      answer: [
        `**📋 Daily Operations Report — ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}**`,
        `\n**Network:** ${ctx.totals.shipments} shipments — ${s['In Transit'] + s['Out for Delivery'] + s['Picked Up']} in motion, ${s['Delivered']} delivered${ctx.onTimeRate !== null ? ` (on-time ${ctx.onTimeRate}%)` : ''}.`,
        `\n**Attention needed (${late}):**`,
        late
          ? ctx.delayedOrOverdue.slice(0, 4).map((x) => `- **${x.trackingId}** (${x.route}) — ${x.hoursLate}h late, ${x.status}`).join('\n')
          : '- None 🎉',
        `\n**Exceptions:** ${ctx.totals.openExceptions} open (Critical ${ctx.openExceptionsBySeverity['Critical']}, High ${ctx.openExceptionsBySeverity['High']}).` +
          (ctx.seniorEscalations.length ? ` **${ctx.seniorEscalations.length} escalated to Senior Management+ — needs leadership sign-off today.**` : ''),
        `\n**Recent activity:**`,
        ...ctx.recentActivity.slice(0, 3).map((a) => `- ${a}`),
      ].join('\n'),
      followUps: ['Which shipments are delayed?', 'Any critical exceptions?', 'Delivery performance stats'],
    };
  }

  // 6) Recovery recommendations (generic — target the riskiest open item)
  if (has('recover', 'recommend', 'fix', 'action plan', 'mitigat')) {
    if (!ctx.criticalOpenExceptions.length) {
      return { answer: 'There are no high/critical open exceptions needing recovery right now. Ask me about a specific tracking ID for a proactive risk review.', followUps: ['Daily operations report', 'Delivery performance stats'] };
    }
    const top = ctx.criticalOpenExceptions[0];
    const plan = ruleBasedPlan({ shipment: { trackingId: top.trackingId }, exception: top });
    return {
      answer: [
        `**Recovery recommendation for ${top.exceptionId} (${top.trackingId} — ${top.type}, ${top.severity}):**`,
        plan.summary,
        '\n**Actions:**',
        ...plan.actions.slice(0, 4).map((a) => `${a.step}. ${a.action} — *${a.owner}, ~${a.etaHours}h*`),
        plan.escalationSuggestion.needed ? `\n**Escalation:** ${plan.escalationSuggestion.level} — ${plan.escalationSuggestion.reason}` : '',
      ].join('\n'),
      followUps: [`Tell me about ${top.exceptionId}`, `Summarize ${top.trackingId}`, 'Show all critical exceptions'],
    };
  }

  // 7) Help
  if (has('help', 'what can you', 'who are you', 'how do you')) {
    return {
      answer: 'I\'m the **SmartShip Assistant** — I answer questions using **live shipment and exception data**. Try:\n- "Which shipments are delayed or overdue?"\n- "Any critical exceptions?"\n- "Daily operations report"\n- "Summarize **SHP-MH109I**" (any tracking ID)\n- "Tell me about **EXC-D90001**" (any exception ID)\n- "Delivery performance stats"\n- "What\'s the recovery plan for SHP-MH109I?"',
      followUps: ['Daily operations report', 'Which shipments are delayed?', 'Delivery performance stats'],
    };
  }

  // 8) Default: helpful digest
  const s = ctx.shipmentsByStatus;
  return {
    answer: `Here's the current state of the network: **${ctx.totals.shipments} shipments** (${s['In Transit'] + s['Out for Delivery'] + s['Picked Up']} in motion), **${ctx.delayedOrOverdue.length} delayed/overdue**, and **${ctx.totals.openExceptions} open exceptions** (${ctx.openExceptionsBySeverity['Critical']} critical).\n\nAsk me something specific — a tracking ID like **SHP-MH109I**, "delayed shipments", "daily report", or "critical exceptions".`,
    followUps: ['Which shipments are delayed?', 'Daily operations report', 'Any critical exceptions?'],
  };
}

/* ---------------------------------------------------------------------------
 * Output validation — never trust the model blindly:
 * 1) every SHP-/EXC- ID cited must exist in the retrieved context;
 * 2) the assistant is read-only — strip/flag any claim of having acted;
 * 3) clamp lengths for a clean UI.
 * ------------------------------------------------------------------------- */
function validIdsFrom(ctx) {
  const ids = new Set();
  const add = (x) => x && ids.add(String(x).toUpperCase());
  ctx.delayedOrOverdue.forEach((s) => add(s.trackingId));
  ctx.criticalOpenExceptions.forEach((e) => { add(e.exceptionId); add(e.trackingId); });
  ctx.seniorEscalations.forEach((e) => { add(e.exceptionId); add(e.trackingId); });
  ctx.mentionedShipments.forEach((s) => { add(s.trackingId); (s.openExceptions || []).forEach((e) => add(e.exceptionId)); });
  ctx.mentionedExceptions.forEach((e) => { add(e.exceptionId); add(e.trackingId); });
  return ids;
}

function validateAnswer(out, ctx) {
  let answer = String(out.answer || '').slice(0, 4000);
  const valid = validIdsFrom(ctx);
  // Flag / neutralize hallucinated IDs.
  answer = answer.replace(/\b(SHP|EXC)-[A-Z0-9-]{3,}\b/gi, (m) => (valid.has(m.toUpperCase()) ? m : `~~${m}~~ (not found in current data)`));
  // The assistant is advisory-only.
  if (/\b(I(?:'ve| have)?\s+(updated|deleted|changed|marked|escalated|resolved|assigned|created))\b/i.test(answer)) {
    answer += '\n\n*Correction: I am read-only — I cannot modify records. The steps above are suggestions for an authorized user to apply in the UI.*';
  }
  const followUps = (out.followUps || []).map((f) => String(f).slice(0, 90)).filter(Boolean).slice(0, 3);
  return { answer, followUps };
}

/* ---------------------------------------------------------------------------
 * Main entry — never throws; Gemini with transparent rule-based fallback.
 * Every answer records WHICH engine produced it (Gemini vs fallback) in the
 * audit trail.
 * ------------------------------------------------------------------------- */
export async function answerQuestion({ question, history = [], user }) {
  const scan = [question, ...history.slice(-4).map((m) => m.text || '')];
  const ctx = await buildDataContext(scan, user);
  let out;
  let source;
  if (config.geminiKey) {
    try {
      const ai = await answerWithGemini({ question, history, ctx, user });
      out = validateAnswer(ai, ctx);
      source = `gemini (${config.geminiModel})`;
    } catch (err) {
      out = validateAnswer(answerWithRules({ question, history, ctx, user }), ctx);
      source = `rule-based (${err.name === 'AbortError' ? 'Gemini request timed out (18s)' : err.message})`;
    }
  } else {
    out = validateAnswer(answerWithRules({ question, history, ctx, user }), ctx);
    source = 'rule-based (Gemini API key not configured)';
  }
  recordAudit({
    actor: user,
    action: 'ai.assistant_answered',
    entity: { kind: 'Assistant', ref: user.email },
    summary: `Assistant answered "${question.slice(0, 80)}" via ${source}`,
    meta: { source, question: question.slice(0, 300), viewerRole: user.role, ruleBasedOnly: source.startsWith('rule-based') },
  });
  return { ...out, source };
}
