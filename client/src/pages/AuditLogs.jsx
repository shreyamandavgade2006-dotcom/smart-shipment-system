import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { TableSkeleton, Empty } from '../components/Spinner.jsx';
import { fmtDateTime } from '../utils/format.js';
import { IconSearch, IconShield, IconAlert } from '../components/Icons.jsx';

const CATEGORY_META = {
  shipment: { color: '#4338ca', bg: '#e0e7ff', label: 'Shipment' },
  exception: { color: '#c2410c', bg: '#ffedd5', label: 'Exception' },
  user: { color: '#6d28d9', bg: '#ede9fe', label: 'User' },
  ai: { color: '#047857', bg: '#d1fae5', label: 'AI Plan' },
  auth: { color: '#475569', bg: '#e2e8f0', label: 'Auth' },
};

const Val = ({ v }) => {
  if (v === null || v === undefined) return <span className="audit-null">∅ empty</span>;
  if (typeof v === 'string' && !isNaN(Date.parse(v)) && /[-T:]/.test(v) && v.length > 8) {
    try {
      return <span>{fmtDateTime(v)}</span>;
    } catch {
      /* fall through */
    }
  }
  return <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>;
};

export default function AuditLogs() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [q, setQ] = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || '');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ categories: [], actions: [] });
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!can.manageUsers) navigate('/', { replace: true });
  }, [can.manageUsers, navigate]);

  const load = useCallback(
    async (opts = {}) => {
      setLoading(true);
      try {
        const { data } = await api.get('/audit', {
          params: {
            q: opts.q ?? q,
            category: opts.category ?? category,
            action: action || undefined,
            from: from || undefined,
            to: to || undefined,
            page: opts.page ?? page,
            limit: 15,
          },
        });
        setData(data);
        setError('');
      } catch (err) {
        setError(errMsg(err, 'Failed to load audit logs.'));
      } finally {
        setLoading(false);
      }
    },
    [q, category, action, from, to, page]
  );

  useEffect(() => {
    api.get('/audit/meta').then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setParams(Object.fromEntries(Object.entries({ q, category }).filter(([, v]) => v)), { replace: true });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, action, from, to, page]);

  const onSearchChange = (v) => {
    setQ(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); load({ q: v, page: 1 }); }, 350);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Audit Logs</h2>
          <p>Append-only activity trail — every important action with who, what changed, and when. Admin-only.</p>
        </div>
        <span className="tag" style={{ fontSize: 12 }}>
          <IconShield size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />{data.total} records · read-only
        </span>
      </div>

      <div className="toolbar">
        <div className="search-box grow">
          <IconSearch size={15} />
          <input className="input" placeholder="Search by summary, ID, user…" value={q} onChange={(e) => onSearchChange(e.target.value)} />
        </div>
        <select className="select" style={{ width: 150 }} value={category} onChange={(e) => { setCategory(e.target.value); setAction(''); setPage(1); }}>
          <option value="">All categories</option>
          {meta.categories.map((c) => <option key={c} value={c}>{CATEGORY_META[c]?.label || c}</option>)}
        </select>
        <select className="select" style={{ width: 210 }} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>
          {meta.actions.filter((a) => !category || a.startsWith(category + '.')).map((a) => <option key={a}>{a}</option>)}
        </select>
        <input className="input" style={{ width: 150 }} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} title="From date" />
        <input className="input" style={{ width: 150 }} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} title="To date" />
      </div>

      {error && <div className="error-banner"><IconAlert size={15} /> {error} <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => load()}>Retry</button></div>}

      <div className="card">
        {loading ? (
          <TableSkeleton rows={8} />
        ) : data.items.length === 0 ? (
          <Empty icon={<IconShield size={22} />} title="No audit records" sub="Activity is recorded automatically as the team works — or adjust your filters." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th style={{ width: 30 }}></th><th>When</th><th>Actor</th><th>Category</th><th>Entity</th><th>What happened</th></tr>
              </thead>
              <tbody>
                {data.items.map((log) => {
                  const cm = CATEGORY_META[log.category] || CATEGORY_META.auth;
                  const open = expanded === log._id;
                  return (
                    <Fragment key={log._id}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(open ? null : log._id)}>
                        <td style={{ color: '#94a3b8', fontSize: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</td>
                        <td style={{ whiteSpace: 'nowrap' }} className="text-sm">{fmtDateTime(log.at)}</td>
                        <td>
                          <div className="cell-main">{log.actor?.name}</div>
                          <div className="cell-sub">{log.actor?.role}</div>
                        </td>
                        <td><span className="badge" style={{ color: cm.color, background: cm.bg }}>{cm.label}</span></td>
                        <td>
                          {log.entity?.ref ? (
                            log.entity.kind === 'Shipment' && log.entity.id && log.action !== 'shipment.deleted' ? (
                              <Link className="row-link" to={`/shipments/${log.entity.id}`} onClick={(e) => e.stopPropagation()}>{log.entity.ref}</Link>
                            ) : (
                              <span className="cell-main">{log.entity.ref}</span>
                            )
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="text-sm" style={{ maxWidth: 420 }}>{log.summary}</td>
                      </tr>
                      {open && (
                        <tr className="audit-detail-row">
                          <td colSpan={6}>
                            <div className="audit-detail">
                              {log.changes?.length > 0 ? (
                                <table className="audit-changes">
                                  <thead><tr><th>Field</th><th>Before</th><th></th><th>After</th></tr></thead>
                                  <tbody>
                                    {log.changes.map((c, i) => (
                                      <tr key={i}>
                                        <td className="ac-field">{c.field}</td>
                                        <td className="ac-from"><Val v={c.from} /></td>
                                        <td className="ac-arrow">→</td>
                                        <td className="ac-to"><Val v={c.to} /></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <span className="text-sm text-muted">No field-level changes recorded.</span>
                              )}
                              {log.meta && Object.keys(log.meta).length > 0 && (
                                <div className="audit-meta">
                                  <div className="ac-field" style={{ marginBottom: 4 }}>metadata</div>
                                  <pre>{JSON.stringify(log.meta, null, 2)}</pre>
                                </div>
                              )}
                              <div className="audit-foot text-sm text-muted">
                                action: <code>{log.action}</code> · record id: <code>{log._id}</code> · immutable
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <span>Page {data.page} of {data.pages} · {data.total} record{data.total === 1 ? '' : 's'}</span>
          <span className="flex">
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <button className="btn btn-sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </span>
        </div>
      </div>
    </>
  );
}
