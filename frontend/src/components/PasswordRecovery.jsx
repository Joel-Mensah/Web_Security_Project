import { useState } from 'react';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import client from '../api/client';

export default function PasswordRecovery({ initialUsername = '', onBack }) {
  const [username, setUsername] = useState(initialUsername);
  const [stage, setStage] = useState('request');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCode = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await client.post('/auth/request-password-reset', { username });
      setMessage(data.message);
      setStage('reset');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not request a reset code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await client.post('/auth/reset-password', {
        username,
        token,
        password,
      });
      setMessage(data.message);
      setStage('complete');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not reset your password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="text-center">
        <Mail className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
        <p className="text-slate-300 text-sm">
          {stage === 'request' && 'Enter your username and we will email a password reset code if the account is active.'}
          {stage === 'reset' && message}
          {stage === 'complete' && message}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-red-300 text-sm text-center">{error}</p>
      )}

      {stage === 'request' && (
        <form onSubmit={requestCode} className="space-y-4">
          <input
            type="text"
            autoComplete="username"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="form-input"
            required
            maxLength={64}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !username.trim()} className="btn-primary w-full">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Email me a reset code'}
          </button>
        </form>
      )}

      {stage === 'reset' && (
        <form onSubmit={resetPassword} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit email code"
            value={token}
            onChange={(event) => setToken(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className="form-input text-center tracking-[0.4em]"
            required
            minLength={6}
            maxLength={6}
            disabled={loading}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password (at least 10 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="form-input"
            required
            minLength={10}
            disabled={loading}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="form-input"
            required
            minLength={10}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || token.length !== 6 || password.length < 10 || !confirmPassword}
            className="btn-primary w-full"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reset password'}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onBack}
        className="btn-ghost w-full flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" /> {stage === 'complete' ? 'Return to login' : 'Back to login'}
      </button>
    </div>
  );
}
