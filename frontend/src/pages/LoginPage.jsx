// src/pages/LoginPage.jsx
// Multi-step auth: credentials → QR setup (first time) OR TOTP verify (primary) OR Email OTP (backup) → dashboard
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertCircle } from 'lucide-react';

import client         from '../api/client';
import { useAuth }    from '../hooks/useAuth';
import LoginForm      from '../components/LoginForm';
import TwoFactorModal from '../components/TwoFactorModal';
import QRSetupModal   from '../components/QRSetupModal';
import EmailOTPModal  from '../components/EmailOTPModal';

// step: 'credentials' | 'qr-setup' | 'totp' | 'email-otp'
export default function LoginPage() {
  const { login }          = useAuth();
  const navigate           = useNavigate();

  const [step, setStep]         = useState('credentials');
  const [pendingToken, setToken] = useState('');
  const [qrData, setQrData]     = useState({ qrDataUrl: '', manualCode: '' });
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // ── Step 1: submit credentials ──────────────────────────────────────────────
  const handleCredentials = async ({ username, password }) => {
    setError('');
    const { data } = await client.post('/auth/login', { username, password });
    setToken(data.pendingToken);

    if (data.requires2FASetup) {
      // Fetch QR
      setLoading(true);
      const qrRes = await client.post(
        '/auth/setup-2fa',
        {},
        { headers: { Authorization: `Bearer ${data.pendingToken}` } }
      );
      setQrData({ qrDataUrl: qrRes.data.qrDataUrl, manualCode: qrRes.data.manualCode });
      setLoading(false);
      setStep('qr-setup');
    } else if (data.requires2FA) {
      setStep('totp');
    }
  };

  // ── Step 2a: QR confirmed → go to TOTP entry ────────────────────────────────
  const handleQRConfirm = () => setStep('totp');

  // ── Step 2b: verify TOTP ─────────────────────────────────────────────────────
  const handleTOTP = async (token) => {
    if (token.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await client.post(
        '/auth/verify-2fa',
        { token },
        { headers: { Authorization: `Bearer ${pendingToken}` } }
      );
      login(data);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2c: Fallback to Email OTP ──────────────────────────────────────────
  const handleSwitchToEmail = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await client.post(
        '/auth/send-email-otp',
        {},
        { headers: { Authorization: `Bearer ${pendingToken}` } }
      );
      setMaskedEmail(data.maskedEmail);
      setStep('email-otp');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to send verification email');
    } finally {
      setLoading(false);
    }
  };

  // ── Resend Email OTP ────────────────────────────────────────────────────────
  const handleResendEmail = async () => {
    setError('');
    try {
      const { data } = await client.post(
        '/auth/send-email-otp',
        {},
        { headers: { Authorization: `Bearer ${pendingToken}` } }
      );
      setMaskedEmail(data.maskedEmail);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to resend verification email');
      throw err;
    }
  };

  // ── Verify Email OTP ────────────────────────────────────────────────────────
  const handleVerifyEmail = async (token) => {
    if (token.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await client.post(
        '/auth/verify-email-otp',
        { token },
        { headers: { Authorization: `Bearer ${pendingToken}` } }
      );
      login(data);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid or expired verification code');
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = {
    'credentials': { title: 'Welcome back',        sub: 'Sign in to your account' },
    'qr-setup':    { title: 'Secure your account',  sub: 'One-time 2FA setup' },
    'totp':        { title: 'Two-Factor Auth',       sub: 'Enter your authenticator code' },
    'email-otp':   { title: 'Email Verification',    sub: 'Backup two-factor authorization' },
  };

  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4">
      {/* Decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Card */}
        <div className="glass-card p-8 animate-slide-up">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-emerald-500/15 rounded-2xl mb-4">
              <Shield className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">{stepTitles[step].title}</h1>
            <p className="text-slate-400 text-sm mt-1">{stepTitles[step].sub}</p>
          </div>

          {/* Step indicator dots */}
          <div className="flex justify-center gap-2 mb-7">
            {['credentials', 'qr-setup', 'totp', 'email-otp'].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step ? 'w-6 bg-emerald-500' : 'w-2 bg-white/15'
                }`}
              />
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-300 text-sm px-4 py-3 rounded-xl mb-5 animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Render current step */}
          {step === 'credentials' && (
            <LoginForm onSuccess={handleCredentials} onError={setError} />
          )}
          {step === 'qr-setup' && (
            <QRSetupModal
              qrDataUrl={qrData.qrDataUrl}
              manualCode={qrData.manualCode}
              onConfirm={handleQRConfirm}
              loading={loading}
            />
          )}
          {step === 'totp' && (
            <TwoFactorModal
              onVerify={handleTOTP}
              onBack={() => { setStep('credentials'); setError(''); }}
              onSwitchToEmail={handleSwitchToEmail}
              loading={loading}
            />
          )}
          {step === 'email-otp' && (
            <EmailOTPModal
              maskedEmail={maskedEmail}
              onVerify={handleVerifyEmail}
              onResend={handleResendEmail}
              onBackToTOTP={() => { setStep('totp'); setError(''); }}
              loading={loading}
            />
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          EnterpriseAuth • Secured with Argon2id + TOTP & Email OTP
        </p>
      </div>
    </div>
  );
}
