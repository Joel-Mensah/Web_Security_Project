import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import { Link } from 'react-router-dom';

const ROLE_LABELS: Record<string, string> = {
  inputer: 'Inputer',
  manager: 'Manager',
  admin: 'Admin',
  administrator: 'Administrator',
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchIncidents();
    }
  }, [user]);

  const fetchIncidents = async () => {
    try {
      const token = localStorage.getItem('ea_token') || '';
      const data = await api.getIncidents(token);
      setIncidents(data);
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="auth-bg min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-white mb-2">Sign in required</h2>
          <p className="text-slate-400 text-sm">Please sign in to access the dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)]">
      <aside className="w-64 bg-navy-950 border-r border-white/10 p-4 flex flex-col">
        <h2 className="text-lg font-bold text-white mb-4">{user.username}</h2>
        <div className="mb-6">
          <p className="text-xs text-slate-400">Role</p>
          <p className="text-white font-semibold">{ROLE_LABELS[user.role] || user.role}</p>
        </div>
        <div className="mb-6">
          <p className="text-xs text-slate-400">Email</p>
          <p className="text-white font-semibold">{user.email || '—'}</p>
        </div>
        <Link to="/" onClick={logout}>
          <button className="text-left text-sm text-slate-400 hover:text-white transition-colors px-3 py-2 rounded-xl">
            Sign Out
          </button>
        </Link>
      </aside>

      <main className="flex-1 p-4 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">My Incidents</h1>
          <Link to="/incidents" className="text-emerald-400 text-sm hover:underline">
            View all
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400">Loading incidents...</div>
        ) : (
          <div className="space-y-3">
            {incidents.slice(0, 5).map((incident) => (
              <div
                key={incident.id}
                className="glass-card p-4 flex items-center gap-4"
              >
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: incident.severity === 'critical' ? 'red' : incident.severity === 'high' ? 'orange' : 'yellow' }} />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{incident.title}</p>
                  <p className="text-xs text-slate-400">{incident.category}</p>
                </div>
                <span className="text-xs text-slate-400">{incident.status}</span>
              </div>
            ))}
            {incidents.length === 0 && (
              <p className="text-slate-400 text-center py-8">No incidents found.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
