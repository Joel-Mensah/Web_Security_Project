// src/components/TwoFactorModal.jsx
// 6-digit TOTP input with live 30-second countdown ring
import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Mail } from 'lucide-react';

const DIGITS = 6;
const TOTP_PERIOD = 30; // seconds

function CountdownRing() {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const now = Math.floor(Date.now() / 1000);
    return TOTP_PERIOD - (now % TOTP_PERIOD);
  });

  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      setSecondsLeft(TOTP_PERIOD - (now % TOTP_PERIOD));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const radius      = 20;
  const circumference = 2 * Math.PI * radius;
  const progress    = (secondsLeft / TOTP_PERIOD) * circumference;
  const isWarning   = secondsLeft <= 8;

  return (
    <div className="flex flex-col items-center gap-1 mb-6">
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        {/* Track */}
        <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        {/* Progress */}
        <circle
          cx="28" cy="28" r={radius}
          fill="none"
          stroke={isWarning ? '#f59e0b' : '#10B981'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s ease' }}
        />
      </svg>
      <span className={`text-xs font-mono font-semibold ${isWarning ? 'text-amber-400' : 'text-slate-400'}`}>
        {secondsLeft}s
      </span>
    </div>
  );
}

export default function TwoFactorModal({ onVerify, onBack, onSwitchToEmail, loading }) {
  const [digits, setDigits]   = useState(Array(DIGITS).fill(''));
  const [shake, setShake]     = useState(false);
  const inputRefs             = useRef([]);

  const focusIndex = useCallback((i) => {
    inputRefs.current[Math.max(0, Math.min(DIGITS - 1, i))]?.focus();
  }, []);

  useEffect(() => { focusIndex(0); }, [focusIndex]);

  const handleKey = (e, idx) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits]; next[idx] = '';
        setDigits(next);
      } else {
        focusIndex(idx - 1);
      }
    }
  };

  const handleChange = (e, idx) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    const next = [...digits]; next[idx] = val;
    setDigits(next);
    if (val) focusIndex(idx + 1);
    if (next.every(Boolean)) {
      onVerify(next.join(''));
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, DIGITS);
    const next = Array(DIGITS).fill('').map((_, i) => pasted[i] || '');
    setDigits(next);
    if (pasted.length === DIGITS) onVerify(pasted);
    else focusIndex(pasted.length);
  };

  return (
    <div className={`animate-slide-up ${shake ? 'animate-shake' : ''}`}>
      <CountdownRing />

      <p className="text-center text-slate-400 text-sm mb-6">
        Enter the 6-digit code from your authenticator app
      </p>

      {/* OTP digit boxes */}
      <div className="flex justify-center gap-1.5 mb-6 sm:gap-2" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={el => (inputRefs.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={e => handleChange(e, i)}
            onKeyDown={e => handleKey(e, i)}
            className="otp-digit"
            disabled={loading}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onVerify(digits.join(''))}
        disabled={loading || digits.some(d => !d)}
        className="btn-primary w-full flex items-center justify-center gap-2 mb-3"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
          : 'Verify Code'
        }
      </button>

      {onSwitchToEmail && (
        <button
          type="button"
          onClick={onSwitchToEmail}
          className="w-full text-center text-xs text-emerald-400 hover:text-emerald-300 transition-colors py-2 mb-2 flex items-center justify-center gap-1.5"
        >
          <Mail className="w-3.5 h-3.5" /> Can't access authenticator? Send code to email
        </button>
      )}

      <button
        type="button"
        onClick={onBack}
        className="btn-ghost w-full flex items-center justify-center gap-2"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Back to login
      </button>
    </div>
  );
}
