import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errMsg } from '../api.js';
import { ROLES } from '../utils/format.js';
import { IconAlert } from '../components/Icons.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'Dispatcher' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = 'Name must be at least 2 characters';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address';
    if (form.password.length < 6) e.password = 'Password must be at least 6 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate() || loading) return;
    setServerError('');
    setLoading(true);
    try {
      await register(form);
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(errMsg(err, 'Registration failed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <h1 style={{ marginTop: 60 }}>Join the operations network.</h1>
        <p className="lead">Create an account with the role that matches your responsibility in the shipment lifecycle.</p>
      </div>
      <div className="auth-form-side">
        <form className="auth-card" onSubmit={submit} noValidate>
          <h2>Create account</h2>
          <p className="sub">All roles are available in this demo deployment.</p>
          {serverError && <div className="error-banner"><IconAlert size={15} style={{ flexShrink: 0 }} /> {serverError}</div>}
          <div className="field" style={{ marginBottom: 13 }}>
            <label>Full name <span className="req">*</span></label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Asha Pawar" />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field" style={{ marginBottom: 13 }}>
            <label>Email <span className="req">*</span></label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>
          <div className="field" style={{ marginBottom: 13 }}>
            <label>Password <span className="req">*</span></label>
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min. 6 characters" />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>
          <div className="field" style={{ marginBottom: 22 }}>
            <label>Role</label>
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: 11 }}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
          <p className="text-sm text-muted" style={{ textAlign: 'center', margin: '16px 0 0' }}>
            Already registered? <Link to="/login" className="row-link">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
