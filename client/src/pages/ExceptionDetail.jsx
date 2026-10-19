import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import PlanCard from '../components/PlanCard.jsx';
import { SeverityBadge, ExceptionStatusBadge, StatusBadge } from '../components/Badge.jsx';
import { Spinner } from '../components/Spinner.jsx';
import { SEVERITIES, TEAMS, EXCEPTION_STATUSES, ESCALATION_LEVELS, fmtDateTime, timeAgo } from '../utils/format.js';
import { IconAlert, IconEscalate, IconResolve, IconCheck, IconSparkles } from '../components/Icons.jsx';

const OPEN_STATES = ['Open', 'In Progress', 'Escalated'];

export default function ExceptionDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();

  const [exception, setException] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modBusy, setModBusy] = useState(false);

  const [escOpen, setEscOpen] = useState(false);
  const [escReason, setEscReason] = useState('');
  const [escError, setEscError] = useState('');
  const [escBusy, setEscBusy] = useState(false);

  const [resOpen, setResOpen] = useState(false);
  const [resNotes, setResNotes] = useState('');
  const [resError, setResError] = useState('');
  const [resBusy, setResBusy] = useState(false);

  const [planLoading, setPlanLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/exceptions/${id}`);
      setException(data.exception);
      setError('');
    } catch (err) {
      setError(errMsg(err, 'Could not load this exception.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const moderate = async (changes, successMsg) => {
    if (modBusy) return;
    setModBusy(true);
    try {
      await api.patch(`/exceptions/${id}`, changes);
      toast.success(successMsg);
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Update failed.'));
    } finally {
      setModBusy(false);
    }
  };

  const escalate = async () => {
    setEscError('');
    if (escReason.trim().length < 5) return setEscError('Please give a reason for the escalation (min 5 characters).');
    if (escBusy) return;
    setEscBusy(true);
    try {
      const { data } = await api.post(`/exceptions/${id}/escalate`, { reason: escReason.trim() });
      toast.success(data.message);
      setEscOpen(false);
      setEscReason('');
      load();
    } catch (err) {
      setEscError(errMsg(err, 'Escalation failed.'));
    } finally {
      setEscBusy(false);
    }
  };

  const resolve = async () => {
    setResError('');
    if (resNotes.trim().length < 5) return setResError('Please add resolution notes (min 5 characters).');
    if (resBusy) return;
    setResBusy(true);
    try {
      await api.post(`/exceptions/${id}/resolve`, { notes: resNotes.trim() });
      toast.success('Exception resolved');
      setResOpen(false);
      setResNotes('');
      load();
    } catch (err) {
      setResError(errMsg(err, 'Resolve failed.'));
    } finally {
      setResBusy(false);
    }
  };

  const generatePlan = async () => {
    if (planLoading) return;
    setPlanLoading(true);
    try {
      const { data } = await api.post(`/exceptions/${id}/ai-plan`);
      setException((e) => ({ ...e, aiPlan: data.plan }));
      toast.success(data.plan.source.startsWith('gemini') ? 'Gemini AI plan generated' : 'Plan ready (rule-based fallback)');
    } catch (err) {
      toast.error(errMsg(err, 'Plan generation failed.'));
    } finally {
      setPlanLoading(false);
    }
  };

  if (loading) return <Spinner large />;
  if (error) return <div className="error-banner"><IconAlert size={15} /> {error} <Link to="/exceptions" className="btn btn-sm" style={{ marginLeft: 'auto' }}>Back to exceptions</Link></div>;
  if (!exception) return null;

  const s = exception.shipment || {};
  const isOpen = OPEN_STATES.includes(exception.status);
  const atMaxLevel = exception.escalationLevel >= ESCALATION_LEVELS.length - 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {exception.exceptionId}
            <SeverityBadge severity={exception.severity} />
            <ExceptionStatusBadge status={exception.status} />
          </h2>
          <p>{exception.type} · reported by {exception.reportedBy} · {timeAgo(exception.createdAt)}</p>
        </div>
        <div className="flex wrap">
          {can.escalate && isOpen && !atMaxLevel && (
            <button className="btn btn-warn" onClick={() => setEscOpen(true)}><IconEscalate size={15} /> Escalate to {ESCALATION_LEVELS[exception.escalationLevel + 1]}</button>
          )}
          {can.resolve && isOpen && (
            <button className="btn btn-ok" onClick={() => setResOpen(true)}><IconResolve size={15} /> Resolve</button>
          )}
        </div>
      </div>

      <div className="grid two-one" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <h3 className="section-title"><IconAlert size={15} color="#dc2626" /> Issue details</h3>
          <p className="text-sm" style={{ lineHeight: 1.7, margin: '0 0 14px' }}>{exception.description}</p>
          <div className="divider" />
          <div className="kv-grid">
            <div className="kv">
              <div className="k">Shipment</div>
              <div className="v">
                {s._id ? <Link className="row-link" to={`/shipments/${s._id}`}>{exception.trackingId}</Link> : exception.trackingId}
              </div>
              {s.origin && <div className="text-sm text-muted">{s.origin} → {s.destination}</div>}
            </div>
            <div className="kv"><div className="k">Shipment status</div><div className="v">{s.status ? <StatusBadge status={s.status} /> : '—'}</div></div>
            <div className="kv"><div className="k">Expected delivery</div><div className="v">{s.expectedDeliveryDate ? fmtDateTime(s.expectedDeliveryDate) : '—'}</div></div>
            <div className="kv"><div className="k">Reported</div><div className="v">{fmtDateTime(exception.createdAt)}</div></div>
          </div>

          {can.moderateExceptions && (
            <>
              <div className="divider" />
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
                <div className="field">
                  <label>Severity</label>
                  <select className="select" disabled={modBusy} value={exception.severity} onChange={(e) => moderate({ severity: e.target.value }, `Severity set to ${e.target.value}`)}>
                    {SEVERITIES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Assigned team</label>
                  <select className="select" disabled={modBusy} value={exception.assignedTeam} onChange={(e) => moderate({ assignedTeam: e.target.value }, `Reassigned to ${e.target.value}`)}>
                    {TEAMS.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Status</label>
                  <select className="select" disabled={modBusy} value={exception.status} onChange={(e) => moderate({ status: e.target.value }, `Status set to ${e.target.value}`)}>
                    {EXCEPTION_STATUSES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </div>
              </div>
              <p className="hint text-muted text-sm" style={{ margin: '8px 0 0' }}>Supervisors, Operations and Admins can triage severity, team and status.</p>
            </>
          )}

          {exception.resolution?.at && (
            <>
              <div className="divider" />
              <div className="state-banner" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', margin: 0 }}>
                <IconCheck size={15} /> <span>Resolved by {exception.resolution.by} · {fmtDateTime(exception.resolution.at)} — {exception.resolution.notes}</span>
              </div>
            </>
          )}
        </div>

        <div className="card card-pad" style={{ alignSelf: 'start' }}>
          <h3 className="section-title"><IconEscalate size={15} color="#c2410c" /> Escalation</h3>
          <div className="ladder" style={{ marginBottom: 14 }}>
            {ESCALATION_LEVELS.map((lvl, i) => (
              <div className="ladder-step" key={lvl}>
                {i > 0 && <span className="ladder-arrow" />}
                <span className={`ladder-node ${i === exception.escalationLevel ? 'active' : i < exception.escalationLevel ? 'passed' : ''}`}>
                  {i < exception.escalationLevel && <IconCheck size={11} />} {lvl}
                </span>
              </div>
            ))}
          </div>
          {exception.escalations.length === 0 ? (
            <p className="text-sm text-muted">No escalations yet — handled at Dispatcher level.</p>
          ) : (
            <div className="timeline" style={{ marginTop: 4 }}>
              {[...exception.escalations].reverse().map((esc, i) => (
                <div className="tl-item" key={i}>
                  <span className="tl-icon" style={{ color: '#c2410c', borderColor: '#fdba74' }}><IconEscalate size={11} /></span>
                  <div className="tl-msg">{esc.fromLevel} → <b>{esc.toLevel}</b></div>
                  <div className="tl-meta">{esc.reason}</div>
                  <div className="tl-meta">{esc.by} · {timeAgo(esc.at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <PlanCard
        plan={exception.aiPlan}
        loading={planLoading}
        onGenerate={generatePlan}
        onApplyTeam={can.moderateExceptions ? (team) => moderate({ assignedTeam: team }, `Team set to ${team} from AI recommendation`) : null}
      />

      <Modal
        open={escOpen}
        onClose={() => setEscOpen(false)}
        title={`Escalate to ${ESCALATION_LEVELS[Math.min(exception.escalationLevel + 1, 3)]}`}
        footer={
          <>
            <button className="btn" onClick={() => setEscOpen(false)}>Cancel</button>
            <button className="btn btn-warn" onClick={escalate} disabled={escBusy}>{escBusy ? 'Escalating…' : 'Confirm escalation'}</button>
          </>
        }
      >
        {escError && <div className="error-banner"><IconAlert size={14} /> {escError}</div>}
        <div className="info-banner" style={{ marginBottom: 13 }}>
          This will move <b>{exception.exceptionId}</b> from <b>{ESCALATION_LEVELS[exception.escalationLevel]}</b> to{' '}
          <b>{ESCALATION_LEVELS[exception.escalationLevel + 1]}</b> and mark it as &quot;Escalated&quot;. The event is recorded on the shipment timeline.
        </div>
        <div className="field">
          <label>Escalation reason <span className="req">*</span></label>
          <textarea className="textarea" placeholder="Why does this need higher authority? (SLA risk, budget authority, partner involvement…)" value={escReason} onChange={(e) => setEscReason(e.target.value)} />
        </div>
      </Modal>

      <Modal
        open={resOpen}
        onClose={() => setResOpen(false)}
        title={`Resolve ${exception.exceptionId}`}
        footer={
          <>
            <button className="btn" onClick={() => setResOpen(false)}>Cancel</button>
            <button className="btn btn-ok" onClick={resolve} disabled={resBusy}>{resBusy ? 'Resolving…' : 'Mark resolved'}</button>
          </>
        }
      >
        {resError && <div className="error-banner"><IconAlert size={14} /> {resError}</div>}
        <div className="field">
          <label>Resolution notes <span className="req">*</span></label>
          <textarea className="textarea" placeholder="What was done? Final outcome for the audit trail." value={resNotes} onChange={(e) => setResNotes(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
