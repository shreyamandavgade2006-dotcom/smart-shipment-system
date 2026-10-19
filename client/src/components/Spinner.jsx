export function Spinner({ large = false }) {
  return (
    <div className="center-spinner">
      <div className={`spinner ${large ? 'lg' : ''}`} />
    </div>
  );
}

export function Empty({ icon, title = 'Nothing here yet', sub }) {
  return (
    <div className="empty">
      <div className="e-icon">{icon}</div>
      <div className="e-title">{title}</div>
      {sub && <div className="e-sub">{sub}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 42, opacity: 1 - i * 0.13 }} />
      ))}
    </div>
  );
}
