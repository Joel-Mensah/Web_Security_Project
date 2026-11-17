// src/pages/UserManagementPage.jsx
import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, Search, RefreshCw, ChevronLeft, ChevronRight, Loader2, Mail,
  CheckCircle, LockKeyhole, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import UserTable from '../components/UserTable';

function getRequestErrorMessage(err, fallback) {
  const response = err?.response;
  const data = response?.data;
  if (data?.message) return data.message;

  const validationErrors = data?.errors;
  if (Array.isArray(validationErrors) && validationErrors.length) {
    return validationErrors
      .map(({ path, param, msg }) => `${path || param || 'Input'}: ${msg}`)
      .join('; ');
  }

  if (response) return `${fallback} (HTTP ${response.status})`;
  return `${fallback}. Check your connection and try again.`;
}

function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', email: '', role: 'inputer' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  const { hasRole } = useAuth();

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await client.post('/users', form);
      onCreated(data);
      setCreatedUser(data);
    } catch (err) {
      setError(getRequestErrorMessage(err, 'Failed to create user'));
    } finally { setLoading(false); }
  };

  const handleSendSetupLink = async () => {
    setLoading(true); setError('');
    try {
      await client.post(`/users/${createdUser.id}/send-setup-link`);
      setEmailSent(true);
    } catch (err) {
      setError(getRequestErrorMessage(err, 'Could not send the password setup email'));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card p-7 w-full max-w-md animate-slide-up">
        <h3 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
          {createdUser ? <Mail className="w-5 h-5 text-emerald-400" /> : <UserPlus className="w-5 h-5 text-emerald-400" />}
          {createdUser ? 'Send Login Setup Email' : 'Add New User'}
        </h3>
        {error && <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl mb-4">{error}</p>}
        {createdUser ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Account <strong className="text-white">{createdUser.username}</strong> was created for{' '}
              <strong className="text-white">{createdUser.email}</strong>.
            </p>
            <p className="text-sm text-slate-400">
              Send a single-use password setup link. It expires in 30 minutes; the user chooses their own password.
            </p>
            {emailSent && (
              <p role="status" className="flex items-center gap-2 text-sm text-emerald-300">
                <CheckCircle className="h-4 w-4" /> Setup email sent.
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn-ghost flex-1 border border-white/10">Close</button>
              <button
                type="button"
                onClick={handleSendSetupLink}
                disabled={loading}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><Mail className="h-4 w-4" /> {emailSent ? 'Resend Link' : 'Send Setup Link'}</>}
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input name="username" placeholder="Username" value={form.username} onChange={handleChange} className="form-input" required minLength={3} />
          <input name="email"    placeholder="Email"    type="email" value={form.email} onChange={handleChange} className="form-input" required />
          {hasRole('administrator') && (
            <select name="role" value={form.role} onChange={handleChange} className="form-input">
              <option value="inputer">Inputer</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
              <option value="administrator">Administrator</option>
            </select>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 border border-white/10">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : 'Create User'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

export default function UserManagementPage() {
  const { user: currentUser, hasRole } = useAuth();
  const [users, setUsers]     = useState([]);
  const [securityOverview, setSecurityOverview] = useState(null);
  const [securityError, setSecurityError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [setupLinkState, setSetupLinkState] = useState({});
  const PAGE_SIZE = 20;

  const canAdd    = hasRole('manager', 'administrator');
  const canDelete = hasRole('admin',   'administrator');
  const canViewSecurity = hasRole('admin', 'administrator');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await client.get(`/users?page=${page}&limit=${PAGE_SIZE}`);
      setUsers(data.users); setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (!canViewSecurity) return;
    client.get('/users/security-overview')
      .then(({ data }) => setSecurityOverview(data))
      .catch(() => setSecurityError('Password protection details are unavailable.'));
  }, [canViewSecurity]);

  const handleDelete = async (id) => {
    try {
      await client.delete(`/users/${id}`);
      setUsers(prev => prev.filter(u => u.id !== id));
      setTotal(t => t - 1);
    } catch (err) {
      alert(err?.response?.data?.message || 'Delete failed');
    }
  };

  const handleRoleChange = async (id, role) => {
    try {
      const { data } = await client.patch(`/users/${id}/role`, { role });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role: data.role } : u));
    } catch (err) {
      alert(err?.response?.data?.message || 'Role change failed');
    }
  };

  const handleResendSetupLink = async (id) => {
    setSetupLinkState(prev => ({ ...prev, [id]: { loading: true } }));
    try {
      await client.post(`/users/${id}/send-setup-link`);
      setSetupLinkState(prev => ({ ...prev, [id]: { message: 'Email sent' } }));
    } catch (err) {
      setSetupLinkState(prev => ({
        ...prev,
        [id]: { error: getRequestErrorMessage(err, 'Could not send setup email') },
      }));
    }
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 animate-fade-in sm:p-6 lg:p-8">
      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={u => { setUsers(prev => [u, ...prev]); setTotal(t => t + 1); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-slate-400 text-sm">{total} total accounts</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
          <button onClick={fetchUsers} className="btn-ghost flex flex-1 items-center justify-center gap-2 border border-white/10 text-sm sm:flex-none">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {canAdd && (
            <button onClick={() => setShowAdd(true)} className="btn-primary flex flex-1 items-center justify-center gap-2 px-3 text-sm sm:flex-none sm:px-6">
              <UserPlus className="w-4 h-4 shrink-0" /> Add Inputer
            </button>
          )}
        </div>
      </div>

      {canViewSecurity && (
        <section className="glass-card space-y-4 p-4 sm:p-5" aria-labelledby="credential-security-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 id="credential-security-title" className="font-semibold text-white">Password protection</h2>
              <p className="mt-1 text-sm text-slate-400">
                Passwords cannot be viewed or recovered. Users set or reset their own passwords through a secure link.
              </p>
            </div>
          </div>
          {securityError ? (
            <p role="alert" className="text-sm text-amber-300">{securityError}</p>
          ) : securityOverview ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <p className="text-xs text-slate-500">Password hashing</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {securityOverview.passwordHashing.algorithm}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  64 MiB memory, {securityOverview.passwordHashing.iterations} iterations
                </p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <p className="text-xs text-slate-500">Per-user salt</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {securityOverview.salt.bytesPerUser} random bytes
                </p>
                <p className="mt-1 text-xs text-slate-400">Unique for each account</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <p className="text-xs text-slate-500">Server pepper</p>
                <p className={`mt-1 text-sm font-medium ${securityOverview.pepper.configured ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {securityOverview.pepper.configured ? 'Configured' : 'Not configured'}
                </p>
                <p className="mt-1 text-xs text-slate-400">Kept in backend environment</p>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                <p className="text-xs text-slate-500">Plaintext passwords</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-white">
                  <LockKeyhole className="h-4 w-4 text-emerald-300" />
                  Never stored or displayed
                </p>
                <p className="mt-1 text-xs text-slate-400">Use password setup or recovery</p>
              </div>
            </div>
          ) : (
            <div className="skeleton h-20 rounded-xl" aria-label="Loading password protection details" />
          )}
        </section>
      )}

      {canViewSecurity && (
        <section className="glass-card space-y-4 p-4 sm:p-5" aria-labelledby="synthetic-hash-demo-title">
          <div>
            <h2 id="synthetic-hash-demo-title" className="font-semibold text-white">
              Synthetic credential examples
            </h2>
            <p className="mt-1 text-sm text-amber-200">
              The usernames below are from this page, but the salts and hashes are fake placeholders. They are not stored, used for sign-in, or associated with the accounts.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/8">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-white/[0.03]">
                <tr className="border-b border-white/8">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Account name</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Fake salt (not stored)</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Fake password hash (invalid)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                      No account names are available on this page.
                    </td>
                  </tr>
                ) : users.map(({ id, username }, index) => {
                  const label = String(username).replace(/[^a-zA-Z0-9]/g, '-').toUpperCase();
                  return (
                    <tr key={id}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-white">{username}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        FAKE-SALT-{label}-{index + 1}
                      </td>
                      <td className="break-all px-4 py-3 font-mono text-xs text-slate-300">
                        INVALID-FAKE-HASH-{label}-{index + 1}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          type="search"
          placeholder="Search users…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input pl-10"
        />
      </div>

      {/* Table */}
      <UserTable
        users={filtered}
        loading={loading}
        onDelete={handleDelete}
        onRoleChange={handleRoleChange}
        onResendSetupLink={handleResendSetupLink}
        setupLinkState={setupLinkState}
        currentUserId={currentUser?.id}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <p>Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost border border-white/10 disabled:opacity-30 p-2"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-ghost border border-white/10 disabled:opacity-30 p-2"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
