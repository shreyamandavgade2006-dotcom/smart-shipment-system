import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import NotificationsBell from './NotificationsBell.jsx';
import AssistantWidget from './AssistantWidget.jsx';
import api from '../api.js';
import {
  IconDashboard, IconPackage, IconAlert, IconUsers, IconPin, IconLogout, IconMenu, IconTruck, IconX, IconShield,
} from './Icons.jsx';

const TITLES = [
  [/^\/$/, 'Dashboard'],
  [/^\/shipments/, 'Shipments'],
  [/^\/exceptions/, 'Exception Management'],
  [/^\/users/, 'User & Role Management'],
  [/^\/audit/, 'Audit Logs'],
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    api.get('/health').then((r) => setHealth(r.data)).catch(() => {});
  }, []);

  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] || 'SmartShip';
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const links = [
    { to: '/', label: 'Dashboard', icon: <IconDashboard size={17} />, end: true },
    { to: '/shipments', label: 'Shipments', icon: <IconPackage size={17} /> },
    { to: '/exceptions', label: 'Exceptions', icon: <IconAlert size={17} /> },
    ...(can.manageUsers
      ? [
          { to: '/users', label: 'Users & Roles', icon: <IconUsers size={17} /> },
          { to: '/audit', label: 'Audit Logs', icon: <IconShield size={17} /> },
        ]
      : []),
  ];

  return (
    <div className="app-shell">
      <div className={`mobile-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-badge"><IconTruck size={20} /></div>
          <div>
            <div className="brand-name">SmartShip</div>
            <div className="brand-sub">Shipment Management</div>
          </div>
          <button className="btn-ghost btn btn-sm" style={{ marginLeft: 'auto', display: 'none' }} onClick={() => setOpen(false)}><IconX size={16} /></button>
        </div>
        <nav className="nav">
          <div className="nav-section">Operations</div>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {l.icon} {l.label}
            </NavLink>
          ))}
          <div className="nav-section">Public</div>
          <NavLink to="/track" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <IconPin size={17} /> Track Shipment
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="ai-pill" title={health ? `DB: ${health.db} · AI: ${health.ai}` : 'Checking…'}>
            <span className={`dot ${health?.ai?.startsWith('gemini') ? 'ok' : 'warn'}`} />
            <span>{health ? (health.ai.startsWith('gemini') ? 'Gemini AI connected' : 'AI fallback mode (no key)') : 'Connecting…'}</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu"><IconMenu size={19} /></button>
          <h1>{title}</h1>
          <div className="spacer" />
          <NotificationsBell />
          <div className="user-chip">
            <span className="avatar">{initials}</span>
            <span className="u-meta">
              <div className="u-name">{user?.name}</div>
              <div className="u-role">{user?.role}</div>
            </span>
          </div>
          <button className="icon-btn" title="Sign out" onClick={() => { logout(); navigate('/login'); }}>
            <IconLogout size={16} />
          </button>
        </header>
        <main className="content">
          <Outlet />
        </main>
        <AssistantWidget />
      </div>
    </div>
  );
}
