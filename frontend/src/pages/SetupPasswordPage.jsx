import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, KeyRound, Loader2 } from 'lucide-react';
import client from '../api/client';

export default function SetupPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await client.post('/auth/setup-password', { token, password });
      setComplete(true);
      setPassword('');
      setConfirmation('');
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not set your password. Request a new setup email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-bg flex min-h-screen items-center justify-center p-4">
      <div className="glass-card w-full max-w-md p-5 sm:p-8">
        <div className="mb-7 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
            {complete
              ? <CheckCircle className="h-7 w-7 text-emerald-400" />
              : <KeyRound className="h-7 w-7 text-emerald-400" />}
          </div>
          <h1 className="text-2xl font-bold text-white">
            {complete ? 'Password set' : 'Set your password'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {complete
              ? 'Your account is ready. Sign in to set up two-factor authentication.'
              : 'Choose a password with at least 10 characters.'}
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {complete ? (
          <Link to="/login" className="btn-primary block text-center">
            Continue to sign in
          </Link>
        ) : !/^[a-f\d]{64}$/i.test(token) ? (
          <p className="text-center text-sm text-slate-300">
            This setup link is invalid. Contact your administrator for a new link.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password (min 10 characters)"
              className="form-input"
            />
            <input
              type="password"
              autoComplete="new-password"
              minLength={10}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="Confirm new password"
              className="form-input"
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary flex w-full items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
