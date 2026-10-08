// src/pages/UserManagementPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Search, RefreshCw, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';
import UserTable from '../components/UserTable';

function AddUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'inputer' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { hasRole } = useAuth();

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const { data } = await client.post('/users', form);
      onCreated(data);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to create user');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card p-7 w-full max-w-md animate-slide-up">
        <h3 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-emerald-400" /> Add New User
        </h3>
        {error && <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl mb-4">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input name="username" placeholder="Username" value={form.username} onChange={handleChange} className="form-input" required minLength={3} />
          <input name="email"    placeholder="Email"    type="email" value={form.email} onChange={handleChange} className="form-input" required />
          <input name="password" placeholder="Password (min 10 chars)" type="password" value={form.password} onChange={handleChange} className="form-input" required minLength={10} />
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
      </div>
    </div>
  );
}

export default function UserManagementPage() {
  const { user: currentUser, hasRole } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const PAGE_SIZE = 20;

  const canAdd    = hasRole('manager', 'administrator');
  const canDelete = hasRole('admin',   'administrator');

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

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex-1 p-8 space-y-6 animate-fade-in overflow-y-auto">
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
        <div className="flex items-center gap-3">
          <button onClick={fetchUsers} className="btn-ghost border border-white/10 flex items-center gap-2 text-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          {canAdd && (
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 text-sm">
              <UserPlus className="w-4 h-4" /> Add Inputer
            </button>
          )}
        </div>
      </div>

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
