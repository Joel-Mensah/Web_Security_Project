// src/components/QRSetupModal.jsx
// First-time 2FA setup: display QR + manual key, confirm scanned
import { useState } from 'react';
import { Copy, Check, Shield, Loader2 } from 'lucide-react';

export default function QRSetupModal({ qrDataUrl, manualCode, onConfirm, loading }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(manualCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="animate-slide-up space-y-5">
      {/* Icon + heading */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500/15 rounded-2xl mb-3">
          <Shield className="w-6 h-6 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Set Up Two-Factor Auth</h3>
        <p className="text-slate-400 text-sm mt-1">
          Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
        </p>
      </div>

      {/* QR code */}
      {qrDataUrl ? (
        <div className="flex justify-center">
          <div className="p-3 bg-white rounded-2xl shadow-lg">
            <img src={qrDataUrl} alt="2FA QR Code" className="w-48 h-48" />
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="skeleton w-48 h-48 rounded-2xl" />
        </div>
      )}

      {/* Manual entry */}
      <div>
        <p className="text-xs text-slate-500 text-center mb-2">Or enter manually:</p>
        <div className="flex items-center gap-2 bg-navy-800/60 border border-white/10 rounded-xl px-3 py-2">
          <code className="flex-1 text-xs font-mono text-emerald-400 break-all">{manualCode}</code>
          <button
            type="button"
            onClick={handleCopy}
            className="text-slate-400 hover:text-white transition-colors shrink-0"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Important warning */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-300">
        ⚠️ Save this key somewhere safe. You won't be able to see it again. If you lose it and lose access to your device, account recovery will require administrator intervention.
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</>
          : "I've scanned it — Continue →"
        }
      </button>
    </div>
  );
}
