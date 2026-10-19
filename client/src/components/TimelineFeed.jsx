import { timeAgo } from '../utils/format.js';
import { IconPackage, IconTruck, IconAlert, IconTeam, IconEscalate, IconResolve, IconSparkles, IconPencil } from './Icons.jsx';

const TYPE_META = {
  created: { icon: <IconPackage size={11} />, color: '#475569', border: '#cbd5e1' },
  status: { icon: <IconTruck size={11} />, color: '#4338ca', border: '#818cf8' },
  exception: { icon: <IconAlert size={11} />, color: '#b91c1c', border: '#fca5a5' },
  assignment: { icon: <IconTeam size={11} />, color: '#0369a1', border: '#7dd3fc' },
  escalation: { icon: <IconEscalate size={11} />, color: '#c2410c', border: '#fdba74' },
  resolution: { icon: <IconResolve size={11} />, color: '#15803d', border: '#86efac' },
  note: { icon: <IconPencil size={11} />, color: '#475569', border: '#cbd5e1' },
  ai: { icon: <IconSparkles size={11} />, color: '#6d28d9', border: '#c4b5fd' },
};

export default function TimelineFeed({ events = [], compact = false }) {
  const sorted = [...events].sort((a, b) => new Date(b.at) - new Date(a.at));
  const shown = compact ? sorted.slice(0, 8) : sorted;
  return (
    <div className="timeline">
      {shown.map((e, i) => {
        const m = TYPE_META[e.type] || TYPE_META.note;
        return (
          <div className="tl-item" key={e._id || i}>
            <span className="tl-icon" style={{ color: m.color, borderColor: m.border }}>{m.icon}</span>
            <div className="tl-msg">{e.message}</div>
            <div className="tl-meta">
              {e.actor && <>{e.actor} · </>}{timeAgo(e.at)}
            </div>
          </div>
        );
      })}
      {shown.length === 0 && <div className="text-muted text-sm">No activity recorded yet.</div>}
    </div>
  );
}
