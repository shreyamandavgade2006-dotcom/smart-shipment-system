import crypto from 'crypto';
import { config } from '../config.js';
import Shipment, { FLOW_STATUSES } from '../models/Shipment.js';
import { recordAudit } from './audit.js';
import { notify } from './notify.js';

export const CARRIERS = [
  { name: 'SmartShip Fleet', code: 'SSFT', service: 'Own fleet — line-haul' },
  { name: 'Delhivery', code: 'DELH', service: 'Express surface' },
  { name: 'BlueDart', code: 'BLDT', service: 'Air express' },
  { name: 'DTDC', code: 'DTDC', service: 'Standard surface' },
  { name: 'XpressBees', code: 'XPBE', service: 'Same-region express' },
  { name: 'SafeExpress', code: 'SFEX', service: 'B2B heavy' },
];

/* Map any carrier/provider status word onto our internal lifecycle. */
const STATUS_SYNONYMS = {
  created: 'Created', booked: 'Created', manifested: 'Created',
  'picked up': 'Picked Up', picked_up: 'Picked Up', pickupdone: 'Picked Up',
  'in transit': 'In Transit', in_transit: 'In Transit', transit: 'In Transit', departed: 'In Transit', arrived: 'In Transit',
  'out for delivery': 'Out for Delivery', out_for_delivery: 'Out for Delivery', ofd: 'Out for Delivery',
  delivered: 'Delivered', pod: 'Delivered',
  delayed: 'Delayed', delay: 'Delayed', held_up: 'Delayed', exception: 'Delayed', onhold: 'On Hold', 'on hold': 'On Hold',
  cancelled: 'Cancelled', canceled: 'Cancelled', rto: 'Cancelled',
};

export function normalizeCarrierStatus(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toLowerCase().replace(/-/g, ' ');
  return FLOW_STATUSES.includes(raw) || ['Delayed', 'On Hold', 'Cancelled'].includes(raw)
    ? raw
    : STATUS_SYNONYMS[key] || null;
}

export function signPayload(rawBody, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifySignature(rawBody, signature, secret) {
  if (!signature) return false;
  try {
    const expected = signPayload(rawBody, secret);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export const carrierProviderInfo = () => ({
  provider: config.carrierApiUrl ? 'external' : 'simulator',
  webhookPath: '/api/integrations/carrier-webhook',
  secretConfigured: !!config.carrierWebhookSecret,
  supportedCarriers: CARRIERS,
});

/**
 * Shared carrier-update pipeline used by the signed webhook AND the simulator.
 * Returns { status, body } like an HTTP response. Updates the shipment,
 * labels the data source ('webhook'), appends timeline, audits, notifies.
 */
export async function processCarrierUpdate(payload, provider = 'carrier') {
  const { trackingId, carrier, carrierCode, status, location, note, eventTime } = payload || {};
  if (!trackingId) return { status: 400, body: { message: 'trackingId is required' } };
  const normStatus = normalizeCarrierStatus(status);
  if (status && !normStatus) {
    return { status: 400, body: { message: `Unrecognized carrier status "${status}". Use our statuses or common synonyms (in_transit, out_for_delivery, ofd, delivered, delayed…)` } };
  }
  const shipment = await Shipment.findOne({ trackingId: String(trackingId).trim().toUpperCase() });
  if (!shipment) return { status: 404, body: { message: `Unknown trackingId "${trackingId}" — not a SmartShip shipment` } };

  const prevStatus = shipment.status;
  const carrierName = carrier || shipment.carrier?.name || provider;
  if (carrier || carrierCode) shipment.carrier = { name: carrierName, code: (carrierCode || shipment.carrier?.code || 'EXT').toUpperCase(), service: shipment.carrier?.service };
  if (location) shipment.currentLocation = String(location).slice(0, 120);
  if (normStatus && normStatus !== prevStatus) shipment.status = normStatus;
  shipment.trackingSource = 'webhook';
  shipment.lastLocationUpdateAt = eventTime && !isNaN(new Date(eventTime)) ? new Date(eventTime) : new Date();
  if (shipment.lastLocationUpdateAt > new Date(Date.now() + 3600000)) shipment.lastLocationUpdateAt = new Date();

  const msg = normStatus && normStatus !== prevStatus
    ? `Carrier update (${carrierName}): status ${prevStatus} → ${normStatus}${location ? ` at ${location}` : ''}`
    : `Carrier update (${carrierName}): location ping at ${location || shipment.currentLocation || 'hub'}`;
  shipment.timeline.push({
    type: 'status',
    message: note ? `${msg} — ${String(note).slice(0, 160)}` : msg,
    status: normStatus || prevStatus,
    actor: `Carrier webhook (${carrierName})`,
    meta: { source: 'webhook', provider: carrierName },
  });
  await shipment.save();

  recordAudit({
    actor: { name: `Carrier webhook (${carrierName})`, role: 'System' },
    action: 'shipment.tracking_updated',
    entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
    summary: msg,
    changes: [
      ...(normStatus && normStatus !== prevStatus ? [{ field: 'status', from: prevStatus, to: normStatus }] : []),
      ...(location ? [{ field: 'currentLocation', to: location }] : []),
      { field: 'trackingSource', from: shipment.trackingSource === 'webhook' ? 'webhook' : 'manual/seed', to: 'webhook' },
    ],
    meta: { provider: carrierName, eventTime: shipment.lastLocationUpdateAt },
  });

  if (normStatus === 'Delayed' && prevStatus !== 'Delayed') {
    notify({
      type: 'delay', severity: 'warning',
      title: `${shipment.trackingId} reported delayed by carrier`,
      message: `${carrierName} flagged ${shipment.trackingId} (${shipment.origin} → ${shipment.destination}) as delayed${location ? ` near ${location}` : ''}.`,
      link: `/shipments/${shipment._id}`,
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      targetRoles: ['Dispatcher', 'Operations', 'Supervisor', 'Customer Service'],
    });
  }
  return { status: 200, body: { ok: true, trackingId: shipment.trackingId, status: shipment.status, location: shipment.currentLocation, source: 'webhook' } };
}

/**
 * Simulator: builds a realistic carrier payload for the shipment's next
 * lifecycle step (or a location ping), HMAC-signs it, and pushes it through
 * the REAL webhook endpoint — proving the signed integration end-to-end.
 */
export async function simulateCarrierEvent(shipment, actor) {
  const carrier = CARRIERS.find((c) => c.code === (shipment.carrier?.code || 'SSFT')) || CARRIERS[0];
  const flow = FLOW_STATUSES;
  const idx = flow.indexOf(shipment.status);
  const nextStatus = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;

  const hubChain = [shipment.origin, 'Regional sorting hub', `${shipment.destination.split(' ')[0]} corridor`, shipment.destination];
  const location = hubChain[Math.min(hubChain.length - 1, Math.max(0, idx + 1))];

  const payload = {
    trackingId: shipment.trackingId,
    carrier: carrier.name,
    carrierCode: carrier.code,
    status: nextStatus || undefined,
    location,
    note: nextStatus ? `Line-haul scan at ${location}` : 'GPS heartbeat',
    eventTime: new Date().toISOString(),
  };
  const raw = JSON.stringify(payload);
  const signature = signPayload(raw, config.carrierWebhookSecret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(`http://127.0.0.1:${config.port}/api/integrations/carrier-webhook`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-carrier-signature': signature },
      body: raw,
    });
    const body = await resp.json().catch(() => ({}));
    recordAudit({
      actor,
      action: 'shipment.tracking_updated',
      entity: { kind: 'Shipment', id: shipment._id, ref: shipment.trackingId },
      summary: `Simulated carrier webhook for ${shipment.trackingId} (${carrier.name}) — signature ${resp.ok ? 'accepted' : 'rejected'}`,
      meta: { simulated: true, httpStatus: resp.status },
    });
    return { ok: resp.ok, httpStatus: resp.status, body };
  } finally {
    clearTimeout(timer);
  }
}
