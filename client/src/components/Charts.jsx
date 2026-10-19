// Lightweight dependency-free SVG charts.

export function Donut({ data, size = 168, thickness = 24, centerLabel = 'Total' }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="chart-row">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Status distribution chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={thickness} />
        {total > 0 &&
          data.filter((d) => d.value > 0).map((d) => {
            const len = (d.value / total) * C;
            const el = (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(0, len - 1.5)} ${C - len + 1.5}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
        <text x="50%" y="47%" textAnchor="middle" fontSize="26" fontWeight="800" fill="#0f172a">{total}</text>
        <text x="50%" y="60%" textAnchor="middle" fontSize="11.5" fill="#64748b">{centerLabel}</text>
      </svg>
      <div className="legend" style={{ flex: 1 }}>
        {data.map((d) => (
          <div className="lg" key={d.label}>
            <span className="sw" style={{ background: d.color }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
            <span className="val">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBars({ data, color = '#4f46e5', colorFn }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      {data.map((d, i) => (
        <div className="hbar-row" key={d.label}>
          <span className="lbl" title={d.label}>{d.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: colorFn ? colorFn(d, i) : color }} />
          </div>
          <span className="num">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
