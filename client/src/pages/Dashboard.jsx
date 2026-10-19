import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Donut, HBars } from '../components/Charts.jsx';
import { StatusBadge, SeverityBadge, ExceptionStatusBadge } from '../components/Badge.jsx';
import TimelineFeed from '../components/TimelineFeed.jsx';
import { Spinner, TableSkeleton, Empty } from '../components/Spinner.jsx';
import { STATUS_COLORS, SEVERITY_COLORS, timeAgo, fmtDate, hoursLate } from '../utils/format.js';
import { IconPackage, IconTruck, IconCheck, IconAlert, IconClock, IconEscalate } from '../components/Icons.jsx';

const EXC_STATUS_COLORS = { Open: '#dc2626', 'In Progress': '#0284c7', Escalated: '#ea580c', Resolved: '#16a34a', Closed: '#64748b' };

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/dashboard/stats');
      setStats(data);
      setError('');
      setRefreshedAt(new Date());
    } catch (err) {
      setError(errMsg(err, 'Failed to load dashboard statistics.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 30000); // real-time refresh
    return () => clearInterval(t);
  }, []);

  if (loading) return <Spinner large />;
  if (error) return <div className="error-banner"><IconAlert size={15} /> {error} <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => load()}>Retry</button></div>;
  if (!stats) return null;

  const { totals } = stats;
  const cards = [
    { label: 'Total Shipments', value: totals.shipments, icon: <IconPackage size={16} />, tint: 'tint-indigo', foot: 'in database' },
    { label: 'In Motion', value: totals.inTransit, icon: <IconTruck size={16} />, tint: 'tint-sky', foot: 'picked up / transit / out' },
    { label: 'Delivered', value: totals.delivered, icon: <IconCheck size={16} />, tint: 'tint-green', foot: stats.onTimeRate !== null ? `${stats.onTimeRate}% on time` : '—' },
    { label: 'Delayed / Overdue', value: totals.delayedOrOverdue, icon: <IconClock size={16} />, tint: 'tint-amber', foot: 'needs attention' },
    { label: 'Open Exceptions', value: totals.openExceptions, icon: <IconAlert size={16} />, tint: 'tint-red', foot: 'unresolved' },
    { label: 'Critical Active', value: totals.criticalExceptions, icon: <IconEscalate size={16} />, tint: 'tint-violet', foot: 'high + critical' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Operations Dashboard</h2>
          <p>Welcome back, {user?.name?.split(' ')[0] || 'there'} — live network overview{refreshedAt ? ` · updated ${timeAgo(refreshedAt)}` : ''}.</p>
        </div>
        <Link to="/shipments" className="btn btn-primary">+ New shipment</Link>
      </div>

      <div className="grid stats" style={{ marginBottom: 16 }}>
        {cards.map((c) => (
          <div className="card stat-card" key={c.label}>
            <span className={`stat-icon ${c.tint}`}>{c.icon}</span>
            <span className="s-label">{c.label}</span>
            <span className="s-value">{c.value}</span>
            <span className="s-foot">{c.foot}</span>
          </div>
        ))}
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <h3 className="card-title">Shipments by status</h3>
          <p className="card-sub">Live distribution across the delivery lifecycle</p>
          <Donut data={stats.shipmentsByStatus.map((s) => ({ ...s, color: STATUS_COLORS[s.label] }))} centerLabel="shipments" />
        </div>
        <div className="card card-pad">
          <h3 className="card-title">Exceptions by severity</h3>
          <p className="card-sub">All recorded exceptions, coloured by severity</p>
          <HBars data={stats.exceptionsBySeverity} colorFn={(d) => SEVERITY_COLORS[d.label]} />
          <div className="divider" />
          <h3 className="card-title">Exceptions by status</h3>
          <p className="card-sub">Resolution pipeline progress</p>
          <HBars data={stats.exceptionsByStatus} colorFn={(d) => EXC_STATUS_COLORS[d.label]} />
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 8 }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconClock size={15} color="#d97706" /> Delayed &amp; overdue shipments</h3>
          </div>
          {stats.delayedShipments.length === 0 ? (
            <Empty icon={<IconCheck size={22} />} title="On schedule" sub="No delayed or overdue shipments right now." />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Tracking</th><th>Route</th><th>Expected</th><th>Status</th></tr></thead>
                <tbody>
                  {stats.delayedShipments.map((s) => {
                    const late = hoursLate(s.expectedDeliveryDate);
                    return (
                      <tr key={s._id} className="row-overdue">
                        <td><Link className="row-link" to={`/shipments/${s._id}`}>{s.trackingId}</Link></td>
                        <td>{s.origin} → {s.destination}</td>
                        <td>
                          <div>{fmtDate(s.expectedDeliveryDate)}</div>
                          {late > 0 && <div className="cell-sub" style={{ color: '#b45309', fontWeight: 700 }}>{late}h late</div>}
                        </td>
                        <td><StatusBadge status={s.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-pad" style={{ paddingBottom: 8 }}>
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconAlert size={15} color="#dc2626" /> Critical exceptions</h3>
          </div>
          {stats.criticalExceptions.length === 0 ? (
            <Empty icon={<IconCheck size={22} />} title="No critical exceptions" sub="High and critical severity exceptions will appear here." />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Exception</th><th>Type</th><th>Severity</th><th>Status</th></tr></thead>
                <tbody>
                  {stats.criticalExceptions.map((e) => (
                    <tr key={e._id}>
                      <td>
                        <Link className="row-link" to={`/exceptions/${e._id}`}>{e.exceptionId}</Link>
                        <div className="cell-sub">{e.trackingId}</div>
                      </td>
                      <td>{e.type}</td>
                      <td><SeverityBadge severity={e.severity} /></td>
                      <td><ExceptionStatusBadge status={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <h3 className="card-title">Recent activity</h3>
        <p className="card-sub">Latest events across all shipments (auto-refreshes every 30s)</p>
        <TimelineFeed
          events={stats.recentActivity.map((r) => ({ ...r.event, message: `[${r.trackingId}] ${r.event.message}` }))}
          compact
        />
      </div>
    </>
  );
}
