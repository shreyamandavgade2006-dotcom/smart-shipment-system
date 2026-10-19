import { STATUS_META, SEVERITY_META, EXC_STATUS_META } from '../utils/format.js';

function metaOf(map, key, fallbackColor = '#475569', fallbackBg = '#e2e8f0') {
  return map[key] || { color: fallbackColor, bg: fallbackBg };
}

export function StatusBadge({ status }) {
  const m = metaOf(STATUS_META, status);
  return <span className="badge" style={{ color: m.color, background: m.bg }}><span className="bdot" />{status}</span>;
}

export function SeverityBadge({ severity }) {
  const m = metaOf(SEVERITY_META, severity);
  return <span className="badge" style={{ color: m.color, background: m.bg }}><span className="bdot" />{severity}</span>;
}

export function ExceptionStatusBadge({ status }) {
  const m = metaOf(EXC_STATUS_META, status);
  return <span className="badge" style={{ color: m.color, background: m.bg }}><span className="bdot" />{status}</span>;
}

export function PriorityBadge({ priority }) {
  const colors = { Standard: ['#475569', '#e2e8f0'], Express: ['#0369a1', '#e0f2fe'], Critical: ['#b91c1c', '#fee2e2'] };
  const [c, bg] = colors[priority] || colors.Standard;
  return <span className="badge" style={{ color: c, background: bg }}>{priority}</span>;
}
