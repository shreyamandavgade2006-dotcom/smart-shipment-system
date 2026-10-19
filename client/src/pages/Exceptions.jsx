import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import { SeverityBadge, ExceptionStatusBadge } from '../components/Badge.jsx';
import { TableSkeleton, Empty } from '../components/Spinner.jsx';
import { EXCEPTION_TYPES, EXCEPTION_STATUSES, SEVERITIES, TEAMS, TEAM_BY_TYPE, ESCALATION_LEVELS, timeAgo } from '../utils/format.js';
import { IconSearch, IconPlus, IconAlert } from '../components/Icons.jsx';

export default function Exceptions() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState(params.get('q') || '');
  const [severity, setSeverity] = useState(params.get('severity') || '');
  const [status, setStatus] = useState(params.get('status') || '');
  const [unresolvedOnly, setUnresolvedOnly] = useState(params.get('unresolved') === 'true');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ trackingId: '', type: 'Delivery Delay', severity: 'Medium', assignedTeam: 'Dispatch Team', description: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const { data } = await api.get('/exceptions', {
        params: {
          q: opts.q ?? q, severity: opts.severity ?? severity, status: opts.status ?? status,
          unresolved: (opts.unresolved ?? unresolvedOnly) ? 'true' : undefined,
          page: opts.page ?? page, limit: 10,
        },
      });
      setData(data);
      setError('');
    } catch (err) {
      setError(errMsg(err, 'Failed to load exceptions.'));
    } finally {
      setLoading(false);
    }
  }, [q, severity, status, unresolvedOnly, page]);

  useEffect(() => {
    setParams(Object.fromEntries(Object.entries({ q, severity, status, unresolved: unresolvedOnly ? 'true' : '' }).filter(([, v]) => v)), { replace: true });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, status, unresolvedOnly, page]);

  const onSearchChange = (v) => {
    setQ(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); load({ q: v, page: 1 }); }, 350);
  };

  const create = async () => {
    setFormError('');
    if (!form.trackingId.trim()) return setFormError('Tracking ID is required.');
    if (form.description.trim().length < 5) return setFormError('Please describe the issue (min 5 characters).');
    if (saving) return;
    setSaving(true);
    try {
      const { data } = await api.post('/exceptions', { ...form, trackingId: form.trackingId.trim(), description: form.description.trim() });
      toast.success(`Exception ${data.exception.exceptionId} reported`);
      setModalOpen(false);
      setForm({ trackingId: '', type: 'Delivery Delay', severity: 'Medium', assignedTeam: 'Dispatch Team', description: '' });
      load();
    } catch (err) {
      setFormError(errMsg(err, 'Could not report the exception.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Exception Management</h2>
          <p>{data.total} exception{data.total === 1 ? '' : 's'} — report, triage, escalate and resolve operational issues.</p>
        </div>
        <button className="btn btn-warn" onClick={() => setModalOpen(true)}><IconPlus size={15} /> Report exception</button>
      </div>

      <div className="toolbar">
        <div className="search-box grow">
          <IconSearch size={15} />
          <input className="input" placeholder="Search exception ID, tracking ID, description…" value={q} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <select className="select" style={{ width: 140 }} value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="select" style={{ width: 150 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {EXCEPTION_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className={`chip-toggle ${unresolvedOnly ? 'on' : ''}`} onClick={() => { setUnresolvedOnly((v) => !v); setPage(1); }}>
          <IconAlert size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Unresolved only
        </button>
      </div>

      {error && <div className="error-banner"><IconAlert size={15} /> {error} <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => load()}>Retry</button></div>}

      <div className="card">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : data.items.length === 0 ? (
          <Empty icon={<IconAlert size={22} />} title="No exceptions found" sub="Adjust filters, or report a new exception." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Exception</th><th>Tracking</th><th>Type</th><th>Severity</th><th>Status</th><th>Team</th><th>Level</th><th>Age</th><th /></tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/exceptions/${e._id}`)}>
                    <td className="cell-main">{e.exceptionId}</td>
                    <td className="cell-main">{e.trackingId}</td>
                    <td>{e.type}</td>
                    <td><SeverityBadge severity={e.severity} /></td>
                    <td><ExceptionStatusBadge status={e.status} /></td>
                    <td className="text-sm">{e.assignedTeam}</td>
                    <td><span className="tag">{ESCALATION_LEVELS[e.escalationLevel]}</span></td>
                    <td className="text-sm text-muted">{timeAgo(e.createdAt)}</td>
                    <td style={{ textAlign: 'right' }} onClick={(ev) => ev.stopPropagation()}>
                      <Link className="btn btn-sm" to={`/exceptions/${e._id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <span>Page {data.page} of {data.pages} · {data.total} result{data.total === 1 ? '' : 's'}</span>
          <span className="flex">
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <button className="btn btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </span>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Report a new exception"
        footer={
          <>
            <button className="btn" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-warn" onClick={create} disabled={saving}>{saving ? 'Reporting…' : 'Report exception'}</button>
          </>
        }
      >
        {formError && <div className="error-banner"><IconAlert size={14} /> {formError}</div>}
        <div className="grid form2">
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Shipment tracking ID <span className="req">*</span></label>
            <input className="input" placeholder="e.g. SHP-MH104D" value={form.trackingId} onChange={(e) => setForm({ ...form, trackingId: e.target.value })} />
          </div>
          <div className="field">
            <label>Type <span className="req">*</span></label>
            <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, assignedTeam: TEAM_BY_TYPE[e.target.value] || 'Operations' })}>
              {EXCEPTION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Severity</label>
            <select className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Assigned team</label>
            <select className="select" value={form.assignedTeam} onChange={(e) => setForm({ ...form, assignedTeam: e.target.value })}>
              {TEAMS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="field" style={{ marginTop: 11 }}>
          <label>Description <span className="req">*</span></label>
          <textarea className="textarea" placeholder="Describe the operational issue with as much context as possible." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}
