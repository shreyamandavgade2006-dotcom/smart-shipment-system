import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import { StatusBadge, PriorityBadge } from '../components/Badge.jsx';
import { TableSkeleton, Empty } from '../components/Spinner.jsx';
import { SHIPMENT_STATUSES, PRIORITIES, CARRIERS, fmtDate, hoursLate, toLocalInput } from '../utils/format.js';
import { IconSearch, IconPlus, IconPackage, IconPencil, IconTrash, IconAlert } from '../components/Icons.jsx';

const EMPTY_FORM = {
  trackingId: '', senderName: '', senderContact: '', senderAddress: '',
  recipientName: '', recipientContact: '', recipientAddress: '',
  origin: '', destination: '', expectedDeliveryDate: '', priority: 'Standard', weight: '', notes: '', carrierCode: 'SSFT',
};

function toPayload(f) {
  const carrier = CARRIERS.find((c) => c.code === f.carrierCode) || CARRIERS[0];
  return {
    trackingId: f.trackingId.trim() || undefined,
    sender: { name: f.senderName.trim(), contact: f.senderContact.trim(), address: f.senderAddress.trim() },
    recipient: { name: f.recipientName.trim(), contact: f.recipientContact.trim(), address: f.recipientAddress.trim() },
    origin: f.origin, destination: f.destination,
    expectedDeliveryDate: f.expectedDeliveryDate,
    priority: f.priority,
    weight: f.weight === '' ? undefined : +f.weight,
    notes: f.notes,
    carrier,
  };
}

export default function Shipments() {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState(params.get('status') || '');
  const [delayedOnly, setDelayedOnly] = useState(params.get('delayed') === 'true');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // shipment being edited
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const debounceRef = useRef(null);

  const load = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const { data } = await api.get('/shipments', {
        params: {
          q: opts.q ?? q, status: opts.status ?? status,
          delayed: (opts.delayed ?? delayedOnly) ? 'true' : undefined,
          page: opts.page ?? page, limit: 10,
        },
      });
      setData(data);
      setError('');
    } catch (err) {
      setError(errMsg(err, 'Failed to load shipments.'));
    } finally {
      setLoading(false);
    }
  }, [q, status, delayedOnly, page]);

  useEffect(() => {
    setParams(Object.fromEntries(Object.entries({ q, status, delayed: delayedOnly ? 'true' : '' }).filter(([, v]) => v)), { replace: true });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, delayedOnly, page]);

  const onSearchChange = (v) => {
    setQ(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); load({ q: v, page: 1 }); }, 350);
  };

  const validate = (f) => {
    const e = {};
    if (!f.senderName.trim()) e.senderName = 'Sender name is required';
    if (!f.recipientName.trim()) e.recipientName = 'Recipient name is required';
    if (!f.origin.trim()) e.origin = 'Origin is required';
    if (!f.destination.trim()) e.destination = 'Destination is required';
    if (!f.expectedDeliveryDate) e.expectedDeliveryDate = 'Expected delivery date is required';
    if (f.weight !== '' && (isNaN(+f.weight) || +f.weight < 0)) e.weight = 'Weight must be a positive number';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setFormErrors({}); setModalOpen(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      trackingId: s.trackingId,
      senderName: s.sender?.name || '', senderContact: s.sender?.contact || '', senderAddress: s.sender?.address || '',
      recipientName: s.recipient?.name || '', recipientContact: s.recipient?.contact || '', recipientAddress: s.recipient?.address || '',
      origin: s.origin, destination: s.destination,
      expectedDeliveryDate: toLocalInput(s.expectedDeliveryDate),
      priority: s.priority, weight: s.weight ?? '', notes: s.notes || '',
      carrierCode: s.carrier?.code || 'SSFT',
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const save = async () => {
    if (!validate(form) || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/shipments/${editing._id}`, toPayload(form));
        toast.success(`Shipment ${editing.trackingId} updated`);
      } else {
        const { data } = await api.post('/shipments', toPayload(form));
        toast.success(`Shipment ${data.shipment.trackingId} created`);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Could not save shipment.'));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (deletingBusy) return;
    setDeletingBusy(true);
    try {
      await api.delete(`/shipments/${deleting._id}`);
      toast.success(`Shipment ${deleting.trackingId} deleted`);
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Delete failed.'));
    } finally {
      setDeletingBusy(false);
    }
  };

  const fld = (key, label, opts = {}) => (
    <div className="field" style={opts.full ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label} {opts.required && <span className="req">*</span>}</label>
      {opts.textarea ? (
        <textarea className="textarea" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={opts.placeholder} />
      ) : (
        <input className="input" type={opts.type || 'text'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={opts.placeholder} disabled={opts.disabled} />
      )}
      {formErrors[key] && <span className="field-error">{formErrors[key]}</span>}
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Shipments</h2>
          <p>{data.total} shipment{data.total === 1 ? '' : 's'} in the system — search, filter, create and manage.</p>
        </div>
        {can.manageShipments && (
          <button className="btn btn-primary" onClick={openCreate}><IconPlus size={15} /> New shipment</button>
        )}
      </div>

      <div className="toolbar">
        <div className="search-box grow">
          <IconSearch size={15} />
          <input className="input" placeholder="Search tracking ID, sender, recipient, city…" value={q} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <select className="select" style={{ width: 180 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {SHIPMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <button className={`chip-toggle ${delayedOnly ? 'on' : ''}`} onClick={() => { setDelayedOnly((v) => !v); setPage(1); }}>
          <IconAlert size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Delayed / overdue
        </button>
      </div>

      {error && <div className="error-banner"><IconAlert size={15} /> {error} <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => load()}>Retry</button></div>}

      <div className="card">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : data.items.length === 0 ? (
          <Empty icon={<IconPackage size={22} />} title="No shipments found" sub="Adjust your search or filters, or create a new shipment." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Tracking ID</th><th>Route</th><th>Recipient</th><th>Expected</th><th>Priority</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {data.items.map((s) => {
                  const late = !['Delivered', 'Cancelled'].includes(s.status) && hoursLate(s.expectedDeliveryDate) > 0;
                  return (
                    <tr key={s._id} className={late ? 'row-overdue' : ''} style={{ cursor: 'pointer' }} onClick={() => navigate(`/shipments/${s._id}`)}>
                      <td>
                        <span className="cell-main">{s.trackingId}</span>
                        {late && <div className="cell-sub" style={{ color: '#b45309', fontWeight: 700 }}>{hoursLate(s.expectedDeliveryDate)}h overdue</div>}
                      </td>
                      <td>{s.origin} → {s.destination}</td>
                      <td>
                        <div>{s.recipient?.name}</div>
                        <div className="cell-sub">{s.recipient?.contact || ''}</div>
                      </td>
                      <td>{fmtDate(s.expectedDeliveryDate)}</td>
                      <td><PriorityBadge priority={s.priority} /></td>
                      <td><StatusBadge status={s.status} /></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        <Link className="btn btn-sm" to={`/shipments/${s._id}`}>View</Link>{' '}
                        {can.manageShipments && <button className="btn btn-sm" onClick={() => openEdit(s)} aria-label="Edit"><IconPencil size={13} /></button>}{' '}
                        {can.deleteShipments && <button className="btn btn-sm btn-danger" onClick={() => setDeleting(s)} aria-label="Delete"><IconTrash size={13} /></button>}
                      </td>
                    </tr>
                  );
                })}
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
        title={editing ? `Edit shipment ${editing.trackingId}` : 'Create new shipment'}
        wide
        footer={
          <>
            <button className="btn" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create shipment'}</button>
          </>
        }
      >
        <div className="grid form2">
          {fld('senderName', 'Sender name', { required: true, placeholder: 'Acme Industries Ltd' })}
          {fld('senderContact', 'Sender contact', { placeholder: '+91 98XXX XXXXX' })}
          {fld('senderAddress', 'Sender address', { full: true, placeholder: 'Street, area, city' })}
          {fld('recipientName', 'Recipient name', { required: true, placeholder: 'Priya Nair' })}
          {fld('recipientContact', 'Recipient contact', { placeholder: '+91 98XXX XXXXX' })}
          {fld('recipientAddress', 'Recipient address', { full: true, placeholder: 'Street, area, city' })}
          {fld('origin', 'Origin hub / city', { required: true, placeholder: 'Mumbai Hub' })}
          {fld('destination', 'Destination hub / city', { required: true, placeholder: 'Delhi NCR Hub' })}
          {fld('expectedDeliveryDate', 'Expected delivery', { required: true, type: 'datetime-local' })}
          <div className="field">
            <label>Priority</label>
            <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Carrier</label>
            <select className="select" value={form.carrierCode} onChange={(e) => setForm({ ...form, carrierCode: e.target.value })}>
              {CARRIERS.map((c) => <option key={c.code} value={c.code}>{c.name} — {c.service}</option>)}
            </select>
            <span className="hint">Carrier webhook updates will label themselves automatically.</span>
          </div>
          {fld('weight', 'Weight (kg)', { type: 'number', placeholder: 'e.g. 120' })}
          {fld('trackingId', editing ? 'Tracking ID (locked)' : 'Tracking ID (optional — auto-generated)', { placeholder: 'SHP-XXXXXX', disabled: !!editing })}
          {fld('notes', 'Notes', { full: true, textarea: true, placeholder: 'Handling instructions, contents…' })}
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete shipment"
        footer={
          <>
            <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={doDelete} disabled={deletingBusy}>{deletingBusy ? 'Deleting…' : 'Delete permanently'}</button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          Delete shipment <b>{deleting?.trackingId}</b> ({deleting?.origin} → {deleting?.destination})?
          All its exceptions and timeline history will be permanently removed. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
