export const SHIPMENT_STATUSES = [
  'Created', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered', 'Delayed', 'On Hold', 'Cancelled',
];
export const FLOW = ['Created', 'Picked Up', 'In Transit', 'Out for Delivery', 'Delivered'];

export const STATUS_META = {
  'Created': { color: '#475569', bg: '#e2e8f0' },
  'Picked Up': { color: '#0369a1', bg: '#e0f2fe' },
  'In Transit': { color: '#4338ca', bg: '#e0e7ff' },
  'Out for Delivery': { color: '#6d28d9', bg: '#ede9fe' },
  'Delivered': { color: '#15803d', bg: '#dcfce7' },
  'Delayed': { color: '#b45309', bg: '#fef3c7' },
  'On Hold': { color: '#c2410c', bg: '#ffedd5' },
  'Cancelled': { color: '#b91c1c', bg: '#fee2e2' },
};

export const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
export const SEVERITY_META = {
  Low: { color: '#15803d', bg: '#dcfce7' },
  Medium: { color: '#b45309', bg: '#fef3c7' },
  High: { color: '#c2410c', bg: '#ffedd5' },
  Critical: { color: '#b91c1c', bg: '#fee2e2' },
};

export const EXCEPTION_TYPES = [
  'Delivery Delay', 'Vehicle Breakdown', 'Missing Documents', 'Unreachable Recipient',
  'Damaged Shipment', 'Lost Shipment', 'Weather / Natural Cause', 'Other',
];

export const EXCEPTION_STATUSES = ['Open', 'In Progress', 'Escalated', 'Resolved', 'Closed'];
export const EXC_STATUS_META = {
  Open: { color: '#b91c1c', bg: '#fee2e2' },
  'In Progress': { color: '#0369a1', bg: '#e0f2fe' },
  Escalated: { color: '#c2410c', bg: '#ffedd5' },
  Resolved: { color: '#15803d', bg: '#dcfce7' },
  Closed: { color: '#475569', bg: '#e2e8f0' },
};

export const TEAMS = [
  'Dispatch Team', 'Fleet & Maintenance', 'Documentation Team', 'Customer Support', 'Operations', 'External Carrier',
];

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

export const ESCALATION_LEVELS = ['Dispatcher', 'Supervisor', 'Senior Management', 'External Partner'];
export const PRIORITIES = ['Standard', 'Express', 'Critical'];
export const ROLES = ['Admin', 'Dispatcher', 'Operations', 'Customer Service', 'Supervisor'];

export const CARRIERS = [
  { name: 'SmartShip Fleet', code: 'SSFT', service: 'Own fleet — line-haul' },
  { name: 'Delhivery', code: 'DELH', service: 'Express surface' },
  { name: 'BlueDart', code: 'BLDT', service: 'Air express' },
  { name: 'DTDC', code: 'DTDC', service: 'Standard surface' },
  { name: 'XpressBees', code: 'XPBE', service: 'Same-region express' },
  { name: 'SafeExpress', code: 'SFEX', service: 'B2B heavy' },
];

export const SOURCE_LABELS = {
  manual: 'Manual update',
  webhook: 'Carrier webhook (auto)',
  seed: 'Seed / demo data',
};

export const STATUS_COLORS = Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [k, v.color]));
export const SEVERITY_COLORS = Object.fromEntries(Object.entries(SEVERITY_META).map(([k, v]) => [k, v.color]));

export function timeAgo(d) {
  if (!d) return '—';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const days = h / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  return new Date(d).toLocaleDateString('en-IN');
}

export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function toLocalInput(d) {
  if (!d) return '';
  const date = new Date(d);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function hoursLate(d) {
  if (!d) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 36e5));
}
