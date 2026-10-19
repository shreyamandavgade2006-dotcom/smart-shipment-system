import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import StatusStepper from '../components/Stepper.jsx';
import TimelineFeed from '../components/TimelineFeed.jsx';
import PlanCard from '../components/PlanCard.jsx';
import Modal from '../components/Modal.jsx';
import { StatusBadge, PriorityBadge, SeverityBadge, ExceptionStatusBadge } from '../components/Badge.jsx';
import { Spinner, TableSkeleton, Empty } from '../components/Spinner.jsx';
import { SHIPMENT_STATUSES, EXCEPTION_TYPES, SEVERITIES, TEAMS, TEAM_BY_TYPE, SOURCE_LABELS, fmtDateTime, fmtDate, timeAgo } from '../utils/format.js';
import { IconAlert, IconPackage, IconSparkles, IconTruck } from '../components/Icons.jsx';

export default function ShipmentDetail() {
  const { id } = useParams();
  const { can } = useAuth();
  const toast = useToast();

  const [shipment, setShipment] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusForm, setStatusForm] = useState({ status: '', note: '', currentLocation: '' });
  const [statusBusy, setStatusBusy] = useState(false);

  const [excOpen, setExcOpen] = useState(false);
  const [excForm, setExcForm] = useState({ type: 'Delivery Delay', severity: 'Medium', assignedTeam: 'Dispatch Team', description: '' });
  const [excError, setExcError] = useState('');
  const [excBusy, setExcBusy] = useState(false);

  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [simBusy, setSimBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/shipments/${id}`);
      setShipment(data.shipment);
      setExceptions(data.exceptions);
      setStatusForm({ status: data.shipment.status, note: '', currentLocation: data.shipment.currentLocation || '' });
      setPlan(data.shipment.lastAiPlan || null);
      setError('');
    } catch (err) {
      setError(errMsg(err, 'Could not load this shipment.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async () => {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      await api.patch(`/shipments/${id}/status`, {
        status: statusForm.status,
        note: statusForm.note || undefined,
        currentLocation: statusForm.currentLocation || undefined,
      });
      toast.success(`Status updated to "${statusForm.status}"`);
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Status update failed.'));
    } finally {
      setStatusBusy(false);
    }
  };

  const reportException = async () => {
    setExcError('');
    if (excForm.description.trim().length < 5) {
      setExcError('Please describe the issue (min 5 characters).');
      return;
    }
    if (excBusy) return;
    setExcBusy(true);
    try {
      await api.post('/exceptions', { shipmentId: id, ...excForm, description: excForm.description.trim() });
      toast.success('Exception reported and team assigned');
      setExcOpen(false);
      setExcForm({ type: 'Delivery Delay', severity: 'Medium', assignedTeam: 'Dispatch Team', description: '' });
      load();
    } catch (err) {
      setExcError(errMsg(err, 'Could not report the exception.'));
    } finally {
      setExcBusy(false);
    }
  };

  const simulateCarrier = async () => {
    if (simBusy) return;
    setSimBusy(true);
    try {
      const { data } = await api.post('/integrations/simulate', { trackingId: shipment.trackingId });
      if (data.ok) {
        toast.success(`Carrier webhook accepted — ${shipment.trackingId} now "${data.body.status}" at ${data.body.location}`);
      } else {
        toast.error(`Webhook rejected (HTTP ${data.httpStatus})`);
      }
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Carrier simulation failed.'));
    } finally {
      setSimBusy(false);
    }
  };

  const generatePlan = async () => {
    if (planLoading) return;
    setPlanLoading(true);
    try {
      const { data } = await api.post(`/shipments/${id}/ai-plan`);
      setPlan(data.plan);
      toast.success(data.plan.source.startsWith('gemini') ? 'Gemini AI plan generated' : 'Plan ready (rule-based fallback)');
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Plan generation failed.'));
    } finally {
      setPlanLoading(false);
    }
  };

  if (loading) return <Spinner large />;
  if (error) return <div className="error-banner"><IconAlert size={15} /> {error} <Link to="/shipments" className="btn btn-sm" style={{ marginLeft: 'auto' }}>Back to shipments</Link></div>;
  if (!shipment) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {shipment.trackingId} <StatusBadge status={shipment.status} /> <PriorityBadge priority={shipment.priority} />
          </h2>
          <p>{shipment.origin} → {shipment.destination} · Created {fmtDate(shipment.createdAt)}</p>
        </div>
        <div className="flex wrap">
          <button className="btn btn-warn" onClick={() => setExcOpen(true)}><IconAlert size={15} /> Report exception</button>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <StatusStepper status={shipment.status} expectedDeliveryDate={shipment.expectedDeliveryDate} />
        <div className="divider" />
        <div className="kv-grid">
          <div className="kv"><div className="k">Sender</div><div className="v">{shipment.sender?.name}</div><div className="text-sm text-muted">{shipment.sender?.contact}</div></div>
          <div className="kv"><div className="k">Recipient</div><div className="v">{shipment.recipient?.name}</div><div className="text-sm text-muted">{shipment.recipient?.contact}</div></div>
          <div className="kv"><div className="k">Expected delivery</div><div className="v">{fmtDateTime(shipment.expectedDeliveryDate)}</div></div>
          <div className="kv"><div className="k">Current location</div><div className="v">{shipment.currentLocation || shipment.origin}</div></div>
          <div className="kv"><div className="k">Weight</div><div className="v">{shipment.weight != null ? `${shipment.weight} kg` : '—'}</div></div>
          <div className="kv"><div className="k">Assigned team</div><div className="v">{shipment.assignedTeam}</div></div>
          <div className="kv"><div className="k">Carrier</div><div className="v">{shipment.carrier?.name || 'SmartShip Fleet'} <span className="tag">{shipment.carrier?.code || 'SSFT'}</span></div><div className="text-sm text-muted">{shipment.carrier?.service}</div></div>
          <div className="kv">
            <div className="k">Tracking data</div>
            <div className="v">{SOURCE_LABELS[shipment.trackingSource] || 'Manual update'}</div>
            <div className="text-sm text-muted">Last updated {timeAgo(shipment.lastLocationUpdateAt || shipment.updatedAt)}</div>
          </div>
        </div>
        {shipment.notes && <><div className="divider" /><p className="text-sm text-muted mt0 mb0">Notes: {shipment.notes}</p></>}
      </div>

      <div className="grid two-one" style={{ marginBottom: 16 }}>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-pad" style={{ paddingBottom: 6 }}>
            <h3 className="section-title"><IconAlert size={15} color="#dc2626" /> Exceptions ({exceptions.length})</h3>
          </div>
          {exceptions.length === 0 ? (
            <Empty icon={<IconPackage size={22} />} title="No exceptions reported" sub="This shipment is running clean." />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>ID</th><th>Type</th><th>Severity</th><th>Status</th><th>Team</th><th /></tr></thead>
                <tbody>
                  {exceptions.map((e) => (
                    <tr key={e._id}>
                      <td className="cell-main">{e.exceptionId}</td>
                      <td>{e.type}</td>
                      <td><SeverityBadge severity={e.severity} /></td>
                      <td><ExceptionStatusBadge status={e.status} /></td>
                      <td className="text-sm">{e.assignedTeam}</td>
                      <td style={{ textAlign: 'right' }}><Link className="btn btn-sm" to={`/exceptions/${e._id}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card card-pad" style={{ alignSelf: 'start' }}>
          <h3 className="section-title"><IconTruck size={15} color="#4f46e5" /> Update status</h3>
          {can.manageShipments ? (
            <>
              <div className="field" style={{ marginBottom: 11 }}>
                <label>New status</label>
                <select className="select" value={statusForm.status} onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}>
                  {SHIPMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 11 }}>
                <label>Current location</label>
                <input className="input" placeholder="e.g. Solapur bypass" value={statusForm.currentLocation} onChange={(e) => setStatusForm({ ...statusForm, currentLocation: e.target.value })} />
              </div>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Note (optional)</label>
                <input className="input" placeholder="Reason / remark for this update" value={statusForm.note} onChange={(e) => setStatusForm({ ...statusForm, note: e.target.value })} />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={updateStatus} disabled={statusBusy || statusForm.status === shipment.status}>
                {statusBusy ? 'Updating…' : 'Apply status update'}
              </button>
              {!['Delivered', 'Cancelled'].includes(shipment.status) && (
                <button className="btn" style={{ width: '100%', marginTop: 9 }} onClick={simulateCarrier} disabled={simBusy} title="Push a realistic, HMAC-signed carrier webhook through the integration pipeline">
                  {simBusy ? ( <><span className="spinner" style={{ width: 13, height: 13 }} /> Sending signed webhook…</>) : '📡 Simulate carrier webhook'}
                </button>
              )}
              <p className="hint text-muted" style={{ fontSize: 11.5, marginTop: 9 }}>
                Manual updates are labeled <b>manual</b>; carrier events arrive via the signed webhook ({SOURCE_LABELS.webhook.toLowerCase()}) and are labeled automatically.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Your role ({useAuthLabel()}) has read-only access to shipment status. Dispatchers, Operations and Admins can post updates.</p>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <PlanCard plan={plan} loading={planLoading} onGenerate={generatePlan} title="Gemini AI Risk & Recovery Plan" />
      </div>

      <div className="card card-pad">
        <h3 className="section-title"><IconSparkles size={15} color="#6d28d9" /> Shipment timeline</h3>
        <p className="card-sub">Status changes, exceptions, assignments, escalations and resolutions</p>
        <TimelineFeed events={shipment.timeline} />
      </div>

      <Modal
        open={excOpen}
        onClose={() => setExcOpen(false)}
        title={`Report exception for ${shipment.trackingId}`}
        footer={
          <>
            <button className="btn" onClick={() => setExcOpen(false)}>Cancel</button>
            <button className="btn btn-warn" onClick={reportException} disabled={excBusy}>{excBusy ? 'Reporting…' : 'Report exception'}</button>
          </>
        }
      >
        {excError && <div className="error-banner"><IconAlert size={14} /> {excError}</div>}
        <div className="grid form2">
          <div className="field">
            <label>Exception type <span className="req">*</span></label>
            <select
              className="select"
              value={excForm.type}
              onChange={(e) => setExcForm({ ...excForm, type: e.target.value, assignedTeam: TEAM_BY_TYPE[e.target.value] || 'Operations' })}
            >
              {EXCEPTION_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Severity</label>
            <select className="select" value={excForm.severity} onChange={(e) => setExcForm({ ...excForm, severity: e.target.value })}>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Assigned team</label>
            <select className="select" value={excForm.assignedTeam} onChange={(e) => setExcForm({ ...excForm, assignedTeam: e.target.value })}>
              {TEAMS.map((t) => <option key={t}>{t}</option>)}
            </select>
            <span className="hint">Suggested automatically from the exception type — adjust if needed.</span>
          </div>
        </div>
        <div className="field" style={{ marginTop: 11 }}>
          <label>Description <span className="req">*</span></label>
          <textarea className="textarea" placeholder="What happened? Include location, impact and any reference numbers." value={excForm.description} onChange={(e) => setExcForm({ ...excForm, description: e.target.value })} />
        </div>
      </Modal>
    </>
  );
}

// Small helper kept local to avoid importing role text twice.
function useAuthLabel() {
  try {
    return JSON.parse(localStorage.getItem('smartship_user'))?.role || 'viewer';
  } catch {
    return 'viewer';
  }
}
