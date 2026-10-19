import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';
import { timeAgo } from '../utils/format.js';
import { IconBell, IconRefresh, IconAlert, IconCheck } from './Icons.jsx';

const SEV_COLORS = { critical: '#dc2626', warning: '#d97706', info: '#4f46e5' };
const KIND_COLORS = { critical: '#dc2626', high: '#ea580c', overdue: '#d97706', escalated: '#ea580c', delayed: '#ca8a04', warning: '#64748b' };
const TYPE_ICONS = {
  escalation: '⤴', exception: '⚠', assignment: '➜', resolution: '✔', delay: '⏱', status: '📦', user: '👤', system: 'ℹ',
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ feed: [], stateAlerts: [], unreadCount: 0 });
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notifications');
      setData(data);
    } catch {
      /* badge failure should never break the shell */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 45000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const openItem = async (n) => {
    if (!n.isRead) api.post(`/notifications/${n._id}/read`).then(load).catch(() => {});
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      load();
    } catch {
      /* ignore */
    }
  };

  const badge = (data.unreadCount || 0) + (data.stateAlerts?.length || 0);
  const showEmpty = data.feed.length === 0 && data.stateAlerts.length === 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <IconBell size={17} />
        {badge > 0 && <span className="count-badge">{badge > 9 ? '9+' : badge}</span>}
      </button>
      {open && (
        <div className="popover" style={{ width: 380 }}>
          <div className="popover-head">
            <strong>Notifications</strong>
            <span className="flex" style={{ gap: 2 }}>
              {data.unreadCount > 0 && (
                <button className="btn-ghost btn btn-sm" onClick={markAllRead} title="Mark all as read">
                  <IconCheck size={14} /> <span style={{ fontSize: 12 }}>Read all</span>
                </button>
              )}
              <button className="btn-ghost btn btn-sm" onClick={load} disabled={loading} aria-label="Refresh alerts">
                <IconRefresh size={14} />
              </button>
            </span>
          </div>
          <div className="notif-list">
            {showEmpty && (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                <IconAlert size={20} style={{ marginBottom: 6, color: '#94a3b8' }} />
                <div>All clear — nothing targeted at your role right now.</div>
              </div>
            )}

            {data.feed.length > 0 && (
              <>
                <div className="notif-section">For you{data.unreadCount > 0 ? ` · ${data.unreadCount} new` : ''}</div>
                {data.feed.slice(0, 12).map((n) => (
                  <div
                    key={n._id}
                    className={`notif-item ${n.isRead ? 'read' : 'unread'}`}
                    style={{ cursor: n.link ? 'pointer' : 'default' }}
                    onClick={() => openItem(n)}
                  >
                    <span className="notif-dot" style={{ background: SEV_COLORS[n.severity] || '#64748b' }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="n-title">
                        {TYPE_ICONS[n.type] && <span style={{ marginRight: 5 }}>{TYPE_ICONS[n.type]}</span>}
                        {n.title}
                      </div>
                      <div className="n-msg">{n.message}</div>
                      <div className="n-time">{n.by ? `${n.by} · ` : ''}{timeAgo(n.createdAt)}</div>
                    </div>
                    {!n.isRead && <span className="notif-unread-dot" title="Unread" />}
                  </div>
                ))}
              </>
            )}

            {data.stateAlerts.length > 0 && (
              <>
                <div className="notif-section">Needs attention in your role</div>
                {data.stateAlerts.map((a, i) => (
                  <div
                    key={`state-${i}`}
                    className="notif-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      setOpen(false);
                      navigate(a.link);
                    }}
                  >
                    <span className="notif-dot" style={{ background: KIND_COLORS[a.kind] || '#64748b' }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="n-title">{a.title}</div>
                      <div className="n-msg">{a.message}</div>
                      <div className="n-time">{timeAgo(a.at)}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
