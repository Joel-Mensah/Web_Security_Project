// src/components/EmailOTPModal.jsx
// 6-digit Email OTP verification with resend cooldown and return-to-TOTP option
import { useState, useRef, useEffect, useCallback } from 'react';
import { Mail, Loader2, ArrowLeft, RotateCw, CheckCircle2 } from 'lucide-react';

const DIGITS = 6;
const RESEND_COOLDOWN = 60; // 60 seconds

export default function EmailOTPModal({
  maskedEmail,
  onVerify,
  onResend,
  onBackToTOTP,
  loading,
}) {
  const [digits, setDigits] = useState(Array(DIGITS).fill(''));
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [isResending, setIsResending] = useState(false);
  const [sentMessage, setSentMessage] = useState('');
  const inputRefs = useRef([]);

  const focusIndex = useCallback((i) => {
    inputRefs.current[Math.max(0, Math.min(DIGITS - 1, i))]?.focus();
  }, []);

  useEffect(() => {
    focusIndex(0);
  }, [focusIndex]);

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleKey = (e, idx) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const next = [...digits];
        next[idx] = '';
        setDigits(next);
      } else {
        focusIndex(idx - 1);
      }
    }
  };

  const handleChange = (e, idx) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = val;
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

  const handleResendClick = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      await onResend();
      setCooldown(RESEND_COOLDOWN);
      setSentMessage('A new code has been sent to your email.');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="animate-slide-up space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-500/15 rounded-2xl mb-3">
          <Mail className="w-6 h-6 text-emerald-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Email Verification</h3>
        <p className="text-slate-400 text-sm mt-1">
          Enter the 6-digit code sent to{' '}
          <strong className="text-emerald-400 font-mono font-medium">{maskedEmail || 'your email'}</strong>
        </p>
      </div>

      {/* OTP digit boxes */}
      <div className="flex justify-center gap-1.5 my-4 sm:gap-2" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (inputRefs.current[i] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKey(e, i)}
            className="otp-digit"
            disabled={loading}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => onVerify(digits.join(''))}
        disabled={loading || digits.some((d) => !d)}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
        ) : (
          'Verify Code'
        )}
      </button>

      {/* Resend button */}
      <div className="text-center">
        <button
          type="button"
          onClick={handleResendClick}
          disabled={cooldown > 0 || isResending}
          className="text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
        {sentMessage && (
          <p className="mt-2 text-xs text-emerald-300 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {sentMessage}
          </p>
        )}
      </div>

      {/* Back to authenticator */}
      <button
        type="button"
        onClick={onBackToTOTP}
        className="btn-ghost w-full flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Authenticator App
      </button>
    </div>
  );
}
