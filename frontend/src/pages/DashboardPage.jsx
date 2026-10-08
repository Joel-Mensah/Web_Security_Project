// src/pages/DashboardPage.jsx
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Users, ScrollText, ShieldCheck, Activity, Clock } from 'lucide-react';
import client from '../api/client';

const ROLE_COLORS = {
  inputer:       'text-slate-300  bg-slate-500/15',
  manager:       'text-blue-300   bg-blue-500/15',
  admin:         'text-amber-300  bg-amber-500/15',
  administrator: 'text-emerald-400 bg-emerald-500/15',
};

const ROLE_PERMS = {
  inputer:       ['Create data entries', 'View own entries', 'Edit own entries'],
  manager:       ['All Inputer rights', 'Add Inputer accounts', 'View all users'],
  admin:         ['All Inputer rights', 'Delete Inputer accounts', 'View all users'],
  administrator: ['Full system access', 'Add/Delete users', 'Change roles', 'View audit logs'],
};

function StatCard({ icon: Icon, label, value, sub, color = 'text-emerald-400' }) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color.replace('text-', 'bg-').replace('400', '500/15').replace('300', '500/15')}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value ?? <span className="skeleton w-10 h-6 inline-block" />}</p>
        <p className="text-sm text-slate-400">{label}</p>
        {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [stats, setStats]   = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    if (hasRole('manager', 'admin', 'administrator')) {
      client.get('/users?limit=1').then(r => {
        setStats({ total: r.data.total });
      }).catch(() => {});
    }
    if (hasRole('administrator')) {
      client.get('/users/logs/audit?limit=5').then(r => setRecent(r.data)).catch(() => {});
    }
  }, [hasRole]);

  const role = user?.role || 'inputer';

  return (
    <div className="flex-1 p-8 space-y-8 animate-fade-in overflow-y-auto">
      {/* Welcome header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white">
            Welcome, <span className="text-emerald-400">{user?.username}</span>
          </h1>
          <span className={`role-badge ${ROLE_COLORS[role]}`}>{role}</span>
        </div>
        <p className="text-slate-400 text-sm">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard icon={ShieldCheck} label="Session Secured"    value="Active" sub="Argon2id + TOTP" color="text-emerald-400" />
        {hasRole('manager', 'admin', 'administrator') && (
          <StatCard icon={Users}    label="Total Users"         value={stats?.total ?? '…'} color="text-blue-300" />
        )}
        {hasRole('administrator') && (
          <StatCard icon={ScrollText} label="Recent Audit Events" value={recent.length} sub="Last 5 events" color="text-amber-300" />
        )}
      </div>

      {/* Permissions card */}
      <div className="glass-card p-6 max-w-lg">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" /> Your Permissions
        </h2>
        <ul className="space-y-2">
          {ROLE_PERMS[role]?.map(p => (
            <li key={p} className="flex items-center gap-2 text-sm text-slate-300">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* Recent audit log (administrator only) */}
      {hasRole('administrator') && recent.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" /> Recent Audit Events
          </h2>
          <ul className="space-y-2">
            {recent.map(e => (
              <li key={e.id} className="flex items-center justify-between text-sm py-2 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-emerald-400 text-xs">{e.action}</span>
                  {e.subject_username && (
                    <span className="text-slate-400">→ {e.subject_username}</span>
                  )}
                </div>
                <span className="text-slate-600 text-xs">
                  {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
