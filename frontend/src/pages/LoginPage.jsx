// src/pages/LoginPage.jsx
// Multi-step auth: credentials → QR setup (first time) OR TOTP verify (primary) OR Email OTP (backup) → dashboard
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertCircle, Sparkles, Lock } from 'lucide-react';

import client         from '../api/client';
import { useAuth }    from '../hooks/useAuth';
import { useTheme }   from '../context/ThemeContext';
import LoginForm      from '../components/LoginForm';
import TwoFactorModal from '../components/TwoFactorModal';
import QRSetupModal   from '../components/QRSetupModal';
import EmailOTPModal  from '../components/EmailOTPModal';
import PasswordRecovery from '../components/PasswordRecovery';
import LoginSimulationModal from '../components/LoginSimulationModal';
import LoginStageTracker from '../components/LoginStageTracker';
import ThemeToggle from '../components/ThemeToggle';

// step: 'credentials' | 'qr-setup' | 'totp' | 'email-otp' | 'password-recovery'
export default function LoginPage() {
  const { login }          = useAuth();
  const { isDark }         = useTheme();
  const navigate           = useNavigate();

  const [step, setStep]         = useState('credentials');
  const [pendingToken, setToken] = useState('');
  const [qrData, setQrData]     = useState({ qrDataUrl: '', manualCode: '' });
  const [maskedEmail, setMaskedEmail] = useState('');
  const [recoveryUsername, setRecoveryUsername] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [simulation, setSimulation] = useState({
    isOpen: false,
    username: '',
    role: '',
    isDemo: false,
    onComplete: null,
  });

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

  const handleForgotPassword = (username) => {
    setRecoveryUsername(username.trim());
    setError('');
    setStep('password-recovery');
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
      setSimulation({
        isOpen: true,
        username: data.user?.username || 'User',
        role: data.user?.role || 'user',
        isDemo: false,
        onComplete: () => {
          login(data);
          navigate('/dashboard', { replace: true });
        },
      });
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2c: Fallback to Email OTP ──────────────────────────────────────────
  const handleSwitchToEmail = async () => setStep('email-otp');

  const handleVerifyEmail = async (code) => {
    setLoading(true);
    try {
      const { data } = await client.post(
        '/auth/verify-email-otp',
        { code },
        { headers: { Authorization: `Bearer ${pendingToken}` } }
      );
      setSimulation({
        isOpen: true,
        username: data.user?.username || 'User',
        role: data.user?.role || 'user',
        isDemo: false,
        onComplete: () => {
          login(data);
          navigate('/dashboard', { replace: true });
        },
      });
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid email OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    setLoading(true);
    try {
      await client.post('/auth/resend-email-otp', {}, { headers: { Authorization: `Bearer ${pendingToken}` } });
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to resend email');
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = {
    'credentials': { title: 'Welcome back',        sub: 'Sign in to your account' },
    'qr-setup':    { title: 'Secure your account',  sub: 'One-time 2FA setup' },
    'totp':        { title: 'Two-Factor Auth',       sub: 'Enter your authenticator code' },
    'email-otp':   { title: 'Email Verification',    sub: 'Backup two-factor authorization' },
    'password-recovery': { title: 'Recover your account', sub: 'Reset your password by email' },
  };

  // Live stage tracking for stage movement animation
  let currentStage = 1;
  let statusMessage = '';

  if (step === 'credentials') {
    if (loading) {
      currentStage = 2;
      statusMessage = 'Executing Argon2id hash with PostgreSQL salt & pepper...';
    } else {
      currentStage = 1;
      statusMessage = 'Step 1: Identity & Password verification';
    }
  } else if (step === 'qr-setup') {
    currentStage = 3;
    statusMessage = 'Step 2: One-time Google Authenticator setup';
  } else if (step === 'totp') {
    if (loading) {
      currentStage = 4;
      statusMessage = 'Verifying TOTP code & issuing signed JWT session bearer...';
    } else {
      currentStage = 3;
      statusMessage = 'Step 2: Enter 6-digit Google Authenticator TOTP code';
    }
  } else if (step === 'email-otp') {
    if (loading) {
      currentStage = 4;
      statusMessage = 'Verifying Email OTP code & issuing signed JWT session bearer...';
    } else {
      currentStage = 3;
      statusMessage = 'Step 2: Enter 6-digit OTP code sent to your email';
    }
  } else if (step === 'password-recovery') {
    currentStage = 1;
    statusMessage = 'Account recovery in progress';
  }

  return (
    <div className="auth-bg min-h-screen flex flex-col justify-between p-3 sm:p-6 transition-colors duration-300">
      {/* Animated aurora orb background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Primary emerald aurora */}
        <div
          className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full blur-[80px] opacity-60 dark:opacity-40 animate-aurora"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.35) 0%, rgba(5,150,105,0.15) 50%, transparent 80%)' }}
        />
        {/* Blue aurora */}
        <div
          className="absolute -bottom-32 -left-32 w-[480px] h-[480px] rounded-full blur-[80px] opacity-50 dark:opacity-30 animate-float"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(99,102,241,0.12) 55%, transparent 80%)', animationDelay: '2s' }}
        />
        {/* Centre haze */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full blur-[100px] opacity-20 animate-glow-pulse"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.2) 0%, rgba(99,102,241,0.08) 60%, transparent 90%)', animationDelay: '1s' }}
        />
      </div>

      {/* Floating Top Header bar with Theme Toggle */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between py-2 px-1 relative z-10">
        <div className="flex items-center gap-2.5">
          {/* Jewel badge */}
          <div
            className="relative w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(5,150,105,0.1) 100%)',
              border: '1px solid rgba(16,185,129,0.45)',
              boxShadow: '0 0 20px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <Shield className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div>
            <span className="font-bold text-sm sm:text-base tracking-tight bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 bg-clip-text text-transparent dark:from-emerald-400 dark:via-teal-300 dark:to-emerald-500">
              EnterpriseAuth
            </span>
            <span className="hidden sm:inline-block ml-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Argon2id + 2FA
            </span>
          </div>
        </div>

        {/* Night Mode / Light Mode Switch */}
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-block text-xs font-mono text-slate-600 dark:text-slate-400">
            {isDark ? 'Night Mode' : 'Light Mode'}
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main card section */}
      <div className="flex-1 flex items-center justify-center py-6 px-1 relative z-10">
        <div className="w-full max-w-md">
          {/* Card */}
          <div
            className="glass-card p-5 sm:p-7 animate-slide-up transition-colors duration-300 relative"
            style={{ boxShadow: '0 32px 64px -16px rgba(0,0,0,0.4), 0 0 0 1px rgba(16,185,129,0.1), inset 0 1px 0 rgba(255,255,255,0.1)' }}
          >
            {/* Header */}
            <div className="text-center mb-5">
              {/* Jewel icon badge with glow halo */}
              <div className="relative inline-flex items-center justify-center mb-4">
                {/* Outer glow ring */}
                <span
                  className="absolute w-20 h-20 rounded-full animate-glow-pulse"
                  style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)' }}
                />
                <span className="absolute w-16 h-16 rounded-full border border-emerald-500/20" />
                <div
                  className="relative w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(5,150,105,0.12) 100%)',
                    border: '1px solid rgba(16,185,129,0.5)',
                    boxShadow: '0 8px 24px rgba(16,185,129,0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
                  }}
                >
                  <Shield className="w-7 h-7 text-emerald-500 dark:text-emerald-400" />
                </div>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {stepTitles[step].title}
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                {stepTitles[step].sub}
              </p>
            </div>

            {/* Step indicator dots */}
            <div className="flex justify-center gap-2 mb-6">
              {['credentials', 'qr-setup', 'totp', 'email-otp', 'password-recovery'].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s === step ? 'w-6 bg-emerald-500' : 'w-2 bg-slate-200 dark:bg-white/15'
                  }`}
                />
              ))}
            </div>

            {/* Error banner */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300 text-sm px-4 py-3 rounded-xl mb-5 animate-fade-in">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
                {error}
              </div>
            )}

            {/* Render current step */}
            {step === 'credentials' && (
              <LoginForm
                onSuccess={handleCredentials}
                onError={setError}
                onForgotPassword={handleForgotPassword}
                initialUsername={recoveryUsername}
              />
            )}
            {step === 'password-recovery' && (
              <PasswordRecovery
                initialUsername={recoveryUsername}
                onBack={() => { setStep('credentials'); setError(''); }}
              />
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
        </div>
      </div>

      {/* Bottom spacer / branding */}
      <footer className="w-full max-w-4xl mx-auto text-center py-2 relative z-10">
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-600">
          Zero-Trust RBAC • End-to-End Cryptography
        </span>
      </footer>

      {/* Simulation modal — rendered at root to avoid z-index issues */}
      {simulation.isOpen && (
        <LoginSimulationModal
          isOpen={simulation.isOpen}
          username={simulation.username}
          role={simulation.role}
          isDemo={simulation.isDemo}
          onComplete={simulation.onComplete}
          onClose={() => setSimulation(s => ({ ...s, isOpen: false }))}
        />
      )}
    </div>
  );
}
