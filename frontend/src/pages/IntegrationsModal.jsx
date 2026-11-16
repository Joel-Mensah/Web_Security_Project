// src/pages/IntegrationsModal.jsx — part 2: connect / disconnect dialog
import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { maskAccountId } from './IntegrationsData';

export default function IntegrationsModal({ target, saving, error, onClose, onConfirm }) {
  const [form, setForm] = useState({ providerEmail: '', providerAccountId: '', displayName: '', code: '' });
  const [confirmLast, setConfirmLast] = useState(false);
  if (!target) return null;
  const { card, account, mode } = target;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="glass-card w-full max-w-md p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {mode === 'connect' ? `Connect ${card.name}` : `Disconnect ${card.name}`}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {mode === 'connect'
                ? 'Paste the account details from the provider. Tokens are AES-256-GCM encrypted at rest.'
                : `Signed in as ${account?.providerEmail || maskAccountId(account?.providerAccountId)}. This revokes stored tokens immediately.`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost" aria-label="Close dialog">
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'connect' ? (
          <div className="space-y-3">
            <input className="form-input" placeholder="Provider email (optional)" value={form.providerEmail}
              onChange={(e) => setForm((f) => ({ ...f, providerEmail: e.target.value }))} />
            <input className="form-input" placeholder="Provider account ID (optional — auto if empty)" value={form.providerAccountId}
              onChange={(e) => setForm((f) => ({ ...f, providerAccountId: e.target.value }))} />
            <input className="form-input" placeholder="Display name (optional)" value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} />
            <input className="form-input" placeholder="OAuth code (optional — initiates flow if empty)" value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </div>
        ) : (
          <label className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-700 dark:text-amber-200">
            <input type="checkbox" checked={confirmLast} onChange={(e) => setConfirmLast(e.target.checked)} className="mt-1" />
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              If this is my last sign-in method, I confirm I re-authenticated with fresh 2FA.
            </span>
          </label>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost border border-slate-200 dark:border-white/10">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onConfirm(mode === 'connect' ? form : { confirmLastMethod: confirmLast })}
            className={mode === 'connect' ? 'btn-brand flex items-center gap-2' : 'btn-primary flex items-center gap-2 !bg-red-500 hover:!bg-red-400'}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'connect' ? 'Connect' : 'Disconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}
