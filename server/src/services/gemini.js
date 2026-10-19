import { config } from '../config.js';
import { ruleBasedPlan, normalizePlan } from './recovery.js';

function buildPrompt(shipment, exception) {
  const s = shipment || {};
  const e = exception || null;
  return `You are a senior logistics recovery specialist at a freight company. Generate a precise, actionable recovery plan as STRICT JSON (no markdown, no code fences) with EXACTLY these keys:
{
  "summary": "one-sentence executive summary",
  "riskAssessment": "2-4 sentences assessing risk to SLA, cargo, and customer trust",
  "riskLevel": "Low | Moderate | High | Severe",
  "priorityLevel": "P1 - Immediate Response | P2 - Urgent | P3 - Standard | P4 - Monitor",
  "recommendedTeam": "Dispatch Team | Fleet & Maintenance | Documentation Team | Customer Support | Operations | External Carrier",
  "actions": [ {"step": 1, "action": "specific action", "owner": "role or team", "etaHours": 4} ],
  "escalationSuggestion": {"needed": true, "level": "Dispatcher | Supervisor | Senior Management | External Partner", "reason": "why"},
  "customerMessage": "empathetic, professional customer communication draft (60-90 words)",
  "preventiveMeasures": ["measure 1", "measure 2"]
}
Rules: 4-6 actions, realistic etaHours, no invented tracking numbers, JSON only.

SHIPMENT:
- trackingId: ${s.trackingId || 'N/A'}
- route: ${s.origin || '?'} -> ${s.destination || '?'}
- status: ${s.status || '?'}${s.currentLocation ? `, last seen at ${s.currentLocation}` : ''}
- priority: ${s.priority || 'Standard'}
- expectedDelivery: ${s.expectedDeliveryDate ? new Date(s.expectedDeliveryDate).toISOString() : '?'}
- sender: ${s.sender?.name || '?'} / recipient: ${s.recipient?.name || '?'}
${e ? `ACTIVE EXCEPTION:\n- type: ${e.type}\n- severity: ${e.severity}\n- status: ${e.status}\n- description: ${e.description}\n- escalationLevel: ${e.escalationLevel} (0=Dispatcher,1=Supervisor,2=Senior Management,3=External Partner)` : 'No active exception: produce a proactive risk assessment and readiness plan.'}`;
}

/**
 * Generates a recovery plan. NEVER throws — on any failure (missing key,
 * network error, timeout, bad JSON) it returns a rule-based plan so core
 * operations are never interrupted.
 */
export async function generateRecoveryPlan({ shipment, exception }) {
  const baseline = ruleBasedPlan({ shipment, exception });
  const fallback = (reason) => ({ ...baseline, source: `rule-based (${reason})` });

  if (!config.geminiKey) return fallback('Gemini API key not configured');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${encodeURIComponent(config.geminiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(shipment, exception) }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return fallback(`Gemini HTTP ${resp.status}${body ? `: ${body.slice(0, 140)}` : ''}`);
    }
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text.trim()) return fallback('empty Gemini response');

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          /* ignore */
        }
      }
    }
    if (!parsed || typeof parsed !== 'object') return fallback('unparseable Gemini response');

    const plan = normalizePlan(parsed, baseline);
    plan.generatedAt = new Date().toISOString();
    plan.source = `gemini (${config.geminiModel})`;
    return plan;
  } catch (err) {
    return fallback(err.name === 'AbortError' ? 'Gemini request timed out (20s)' : `Gemini error: ${err.message}`);
  }
}
