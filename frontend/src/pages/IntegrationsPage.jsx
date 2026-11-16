// src/pages/IntegrationsPage.jsx — Integration Center grid + workflows
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plug2, RefreshCw } from 'lucide-react';
import client from '../api/client';
import { PROVIDER_CARDS } from './IntegrationsData';
import IntegrationsGrid from './IntegrationsGrid';
import IntegrationsModal from './IntegrationsModal';

export default function IntegrationsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.get('/users/me/linked-accounts');
      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not load integrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirm = async (payload) => {
    if (!target) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (target.mode === 'connect') {
        const body = {
          providerEmail: payload.providerEmail || undefined,
          providerAccountId: payload.providerAccountId || undefined,
          displayName: payload.displayName || undefined,
          code: payload.code || undefined,
          accessToken: payload.code ? undefined : `manual-${Date.now()}`,
        };
        const { data } = await client.post(`/users/me/linked-accounts/connect/${target.card.id}`, body);
        setNotice(data?.connectUrl
          ? `${target.card.name}: open provider URL with state ${data.state}, then paste the code.`
          : `${target.card.name} connected.`);
      } else {
        await client.delete(`/users/me/linked-accounts/${target.account.id}`, {
          data: { confirmLastMethod: !!payload.confirmLastMethod },
        });
        setNotice(`${target.card.name} disconnected.`);
      }
      setTarget(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Request failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 text-slate-900 dark:bg-transparent dark:text-white sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Plug2 className="h-6 w-6 text-indigo-500 dark:text-indigo-300" />
            Integration Center
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Link this site to Google, GitHub, Microsoft 365, Slack, or Enterprise SSO. Tokens are encrypted at rest.
          </p>
        </div>
        <button type="button" onClick={load} className="btn-ghost border border-slate-200 dark:border-white/10">
          <span className="flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Refresh</span>
        </button>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          {notice}
        </div>
      )}
      {error && !target && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading integrations…
        </div>
      ) : (
        <IntegrationsGrid accounts={{ cards: PROVIDER_CARDS, linked: accounts }} onSelect={setTarget} />
      )}

      <IntegrationsModal
        target={target}
        saving={saving}
        error={error}
        onClose={() => { setTarget(null); setError(''); }}
        onConfirm={confirm}
      />
    </div>
  );
}
