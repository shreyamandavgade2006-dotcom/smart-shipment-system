import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { TableSkeleton, Empty } from '../components/Spinner.jsx';
import { fmtDate } from '../utils/format.js';
import { IconUsers, IconAlert } from '../components/Icons.jsx';

const ROLE_BG = {
  Admin: ['#3730a3', '#e0e7ff'],
  Dispatcher: ['#0369a1', '#e0f2fe'],
  Operations: ['#15803d', '#dcfce7'],
  'Customer Service': ['#b45309', '#fef3c7'],
  Supervisor: ['#6d28d9', '#ede9fe'],
};

export default function Users() {
  const { user: me, can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
      setUsers(data.users);
      setRoles(data.roles);
      setError('');
    } catch (err) {
      setError(errMsg(err, 'Failed to load users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!can.manageUsers) navigate('/', { replace: true });
    else load();
  }, [can.manageUsers, load, navigate]);

  const changeRole = async (u, role) => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.patch(`/users/${u._id}/role`, { role });
      toast.success(data.message);
      load();
    } catch (err) {
      toast.error(errMsg(err, 'Role change failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Users &amp; Roles</h2>
          <p>Manage operator accounts and role-based permissions (Admin only).</p>
        </div>
      </div>

      {error && <div className="error-banner"><IconAlert size={15} /> {error}</div>}

      <div className="card">
        {loading ? (
          <TableSkeleton rows={5} />
        ) : users.length === 0 ? (
          <Empty icon={<IconUsers size={22} />} title="No users" sub="Register the first operator account." />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Change role</th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const [c, bg] = ROLE_BG[u.role] || ['#475569', '#e2e8f0'];
                  return (
                    <tr key={u._id}>
                      <td>
                        <div className="flex">
                          <span className="avatar" style={{ width: 30, height: 30, fontSize: 11.5 }}>{u.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
                          <span className="cell-main">{u.name}{u._id === me?.id ? ' (you)' : ''}</span>
                        </div>
                      </td>
                      <td className="text-sm">{u.email}</td>
                      <td><span className="badge" style={{ color: c, background: bg }}>{u.role}</span></td>
                      <td className="text-sm text-muted">{fmtDate(u.createdAt)}</td>
                      <td>
                        <select className="select" style={{ width: 170, padding: '7px 10px', fontSize: 13 }} disabled={busy || u._id === me?.id} value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                          {roles.map((r) => <option key={r}>{r}</option>)}
                        </select>
                        {u._id === me?.id && <div className="cell-sub">cannot change own role</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
