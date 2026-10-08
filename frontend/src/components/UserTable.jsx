// src/components/UserTable.jsx
import { useAuth } from '../hooks/useAuth';
import { Trash2, UserPlus, MoreVertical, CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';

const ROLE_BADGE_CLASSES = {
  inputer:       'bg-slate-500/20 text-slate-300 border-slate-500/30',
  manager:       'bg-blue-500/20 text-blue-300 border-blue-500/30',
  admin:         'bg-amber-500/20 text-amber-300 border-amber-500/30',
  administrator: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

function ConfirmModal({ username, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card p-6 max-w-sm w-full animate-slide-up space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-500/15 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-white font-semibold">Delete User?</h3>
          <p className="text-slate-400 text-sm mt-1">
            This will permanently delete <strong className="text-white">{username}</strong> and log the action in the audit trail.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-ghost flex-1 border border-white/10">Cancel</button>
          <button onClick={onConfirm} className="flex-1 bg-red-500 hover:bg-red-400 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserTable({ users = [], loading, onDelete, onRoleChange, currentUserId }) {
  const { hasRole }              = useAuth();
  const [confirmUser, setConfirm] = useState(null);

  const canDelete = hasRole('admin', 'administrator');
  const canChangeRole = hasRole('administrator');

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      {confirmUser && (
        <ConfirmModal
          username={confirmUser.username}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { onDelete(confirmUser.id); setConfirm(null); }}
        />
      )}

      <div className="overflow-x-auto rounded-xl border border-white/8">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-white/3">
              {['User', 'Email', 'Role', 'MFA', 'Status', 'Last Login', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-500">No users found</td>
              </tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-white/3 transition-colors group">
                {/* Username */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-semibold text-xs uppercase flex-shrink-0">
                      {u.username[0]}
                    </div>
                    <span className="font-medium text-white">{u.username}</span>
                    {u.id === currentUserId && (
                      <span className="text-xs bg-slate-500/20 text-slate-400 px-1.5 py-0.5 rounded">You</span>
                    )}
                  </div>
                </td>

                {/* Email */}
                <td className="px-4 py-3 text-slate-400">{u.email}</td>

                {/* Role badge + change */}
                <td className="px-4 py-3">
                  {canChangeRole && u.id !== currentUserId ? (
                    <select
                      value={u.role}
                      onChange={e => onRoleChange(u.id, e.target.value)}
                      className={`role-badge border cursor-pointer bg-transparent outline-none ${ROLE_BADGE_CLASSES[u.role]}`}
                    >
                      {['inputer', 'manager', 'admin', 'administrator'].map(r => (
                        <option key={r} value={r} className="bg-navy-900 text-white">{r}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`role-badge border ${ROLE_BADGE_CLASSES[u.role]}`}>{u.role}</span>
                  )}
                </td>

                {/* MFA status */}
                <td className="px-4 py-3">
                  {u.mfa_enabled
                    ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                    : <XCircle    className="w-4 h-4 text-slate-600"    />
                  }
                </td>

                {/* Active status */}
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${u.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <span className={`status-dot ${u.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>

                {/* Last login */}
                <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                  {u.last_login_at
                    ? new Date(u.last_login_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : <span className="text-slate-600">Never</span>
                  }
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  {canDelete && u.id !== currentUserId && (
                    <button
                      onClick={() => setConfirm(u)}
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1.5 rounded-lg hover:bg-red-500/10"
                      title="Delete user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
