import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { errMsg } from '../api.js';
import { IconTruck, IconAlert, IconPackage, IconSparkles } from '../components/Icons.jsx';
import { Link, useNavigate, Navigate } from 'react-router-dom';

const DEMO = [
  { role: 'Admin', email: 'admin@smartship.io', password: 'Admin@123' },
  { role: 'Dispatcher', email: 'dispatcher@smartship.io', password: 'Dispatch@123' },
  { role: 'Operations', email: 'ops@smartship.io', password: 'Ops@1234' },
  { role: 'Customer Service', email: 'service@smartship.io', password: 'Service@123' },
  { role: 'Supervisor', email: 'supervisor@smartship.io', password: 'Super@123' },
];

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

if (user) {
  return <Navigate to="/" replace />;
}

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    if (!form.email || !form.password) {
      setError('Email and password are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login(form.email.trim(), form.password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errMsg(err, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-badge"><IconTruck size={20} /></div>
          <div className="brand-name" style={{ fontSize: 19 }}>SmartShip</div>
        </div>
        <h1>Ship smarter.<br />Recover faster.</h1>
        <p className="lead">
          End-to-end shipment management with real-time exception handling,
          team escalation workflows and Gemini AI-powered recovery planning.
        </p>
        <div className="auth-feats">
          <div className="auth-feat">
            <div className="f-ic"><IconPackage size={17} /></div>
            <div><b>Live shipment tracking</b><span>Status timelines, overdue detection and instant search across your fleet.</span></div>
          </div>
          <div className="auth-feat">
            <div className="f-ic"><IconAlert size={17} /></div>
            <div><b>Exception &amp; escalation control</b><span>Severity-based assignment from Dispatcher up to External Partners.</span></div>
          </div>
          <div className="auth-feat">
            <div className="f-ic"><IconSparkles size={17} /></div>
            <div><b>AI recovery plans</b><span>Risk assessments, action playbooks and customer communication drafts.</span></div>
          </div>
        </div>
      </div>

      <div className="auth-form-side">
        <form className="auth-card" onSubmit={submit} noValidate>
          <h2>Welcome back</h2>
          <p className="sub">Sign in to your operations console.</p>
          {error && <div className="error-banner"><IconAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error}</div>}
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Email address <span className="req">*</span></label>
            <input
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="field" style={{ marginBottom: 20 }}>
            <label>Password <span className="req">*</span></label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: 11 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-sm text-muted" style={{ textAlign: 'center', margin: '16px 0 0' }}>
            New operator? <Link to="/register" className="row-link">Create an account</Link> · <Link to="/track" className="row-link">Track a shipment</Link>
          </p>
          <div className="demo-creds">
            <p>Demo accounts — click to autofill</p>
            <div className="demo-grid">
              {DEMO.map((d) => (
                <button key={d.role} type="button" className="demo-chip" onClick={() => { setForm({ email: d.email, password: d.password }); setError(''); }}>
                  {d.role}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
