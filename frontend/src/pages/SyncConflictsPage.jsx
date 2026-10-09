import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, RefreshCw, Loader2 } from 'lucide-react';
import client from '../api/client';

function Snapshot({ side, value }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4">
      <h3 className="mb-2 text-sm font-semibold text-white">{side} version</h3>
      <p className="mb-3 text-xs uppercase tracking-wide text-slate-500">
        {value.operation}
      </p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-300">
        {value.data ? JSON.stringify(value.data, null, 2) : 'No row on this side'}
      </pre>
    </section>
  );
}

export default function SyncConflictsPage() {
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  const loadConflicts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/sync/conflicts');
      setConflicts(data.conflicts);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load synchronization conflicts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConflicts(); }, [loadConflicts]);

  const resolve = async (conflict, resolution) => {
    const side = resolution === 'local' ? 'local PostgreSQL' : 'Supabase';
    if (!window.confirm(`Keep the ${side} version and synchronize it to the other database?`)) return;
    setSaving(conflict.id);
    setError('');
    try {
      await client.post(`/sync/conflicts/${conflict.id}/resolve`, { resolution });
      await loadConflicts();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not resolve synchronization conflict');
    } finally {
      setSaving('');
    }
  };

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-8 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <AlertTriangle className="h-6 w-6 text-amber-400" />
            Sync conflicts
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Choose the version to keep. Your choice is queued to synchronize to both databases.
          </p>
        </div>
        <button
          onClick={loadConflicts}
          disabled={loading}
          className="btn-ghost flex items-center gap-2 border border-white/10 text-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading conflicts…
        </div>
      ) : conflicts.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
          No unresolved synchronization conflicts.
        </p>
      ) : (
        <div className="space-y-5">
          {conflicts.map((conflict) => (
            <article key={conflict.id} className="glass-card space-y-4 p-5">
              <div>
                <h2 className="font-semibold text-white">
                  {conflict.table} · {conflict.rowId}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Found {new Date(conflict.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Snapshot side="Local PostgreSQL" value={conflict.local} />
                <Snapshot side="Supabase" value={conflict.supabase} />
              </div>

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  onClick={() => resolve(conflict, 'local')}
                  disabled={Boolean(saving)}
                  className="btn-ghost flex items-center gap-2 border border-white/10 text-sm disabled:opacity-50"
                >
                  {saving === conflict.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Keep local
                </button>
                <button
                  onClick={() => resolve(conflict, 'supabase')}
                  disabled={Boolean(saving)}
                  className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  {saving === conflict.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Keep Supabase
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
