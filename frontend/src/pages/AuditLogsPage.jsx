import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Clock3, RefreshCw, ScrollText } from 'lucide-react';
import client from '../api/client';

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export default function AuditLogsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/users/logs/audit?limit=100');
      setEvents(data);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load audit events. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 animate-fade-in sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Security monitoring
          </p>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
              <ScrollText className="h-5 w-5 text-emerald-300" />
            </span>
            Audit Logs
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Review recent account and security events recorded by the system.
          </p>
        </div>
        <button
          type="button"
          onClick={loadEvents}
          disabled={loading}
          className="btn-ghost flex items-center gap-2 border border-white/10"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <section className="glass-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-4 sm:px-6">
          <div>
            <h2 className="font-semibold text-white">Recent events</h2>
            <p className="mt-1 text-xs text-slate-500">Showing up to 100 records, newest first</p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">
            {loading ? 'Loading' : `${events.length} events`}
          </span>
        </div>

        {error && (
          <div role="alert" className="m-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 sm:m-6">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="space-y-3 p-4 sm:p-6" aria-label="Loading audit events">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : error ? null : events.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ScrollText className="mx-auto h-8 w-8 text-slate-500" />
            <p className="mt-3 font-medium text-white">No audit events yet</p>
            <p className="mt-1 text-sm text-slate-400">New security events will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {events.map((event) => (
              <li key={event.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="break-words font-mono text-sm font-semibold text-emerald-300">
                    {event.action}
                  </p>
                  <p className="mt-1 break-words text-sm text-slate-300">
                    {event.actor_username || 'System'}
                    {event.subject_username ? ` → ${event.subject_username}` : ''}
                  </p>
                  {event.details && Object.keys(event.details).length > 0 && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/10 p-2 text-xs text-slate-500">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  )}
                </div>
                <time className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatDate(event.created_at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
