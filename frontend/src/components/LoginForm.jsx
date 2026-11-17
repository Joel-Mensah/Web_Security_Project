// src/components/LoginForm.jsx
import { useState } from 'react';
import { Eye, EyeOff, Lock, User, Loader2 } from 'lucide-react';

export default function LoginForm({ onSuccess, onError, onForgotPassword, initialUsername = '' }) {
  const [form, setForm]       = useState({ username: initialUsername, password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake]     = useState(false);

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.username.trim() || !form.password) return;
    setLoading(true);
    try {
      await onSuccess(form);
    } catch (err) {
      triggerShake();
      const response = err?.response;
      const message = response?.data?.message || (
        response
          ? response.status >= 500
            ? 'The login service is unavailable. Please try again shortly.'
            : 'Unable to sign in. Check your username and password.'
          : 'Unable to reach the login service. Check your connection and try again.'
      );
      onError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`space-y-5 ${shake ? 'animate-shake' : ''}`}
      noValidate
    >
      {/* Username */}
      <div className="relative">
        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          type="text"
          name="username"
          autoComplete="username"
          placeholder="Username"
          value={form.username}
          onChange={handleChange}
          className="form-input pl-10"
          required
          disabled={loading}
        />
      </div>

      {/* Password */}
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          type={showPwd ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          className="form-input pl-10 pr-11"
          required
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => setShowPwd(v => !v)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded text-slate-500 transition-colors hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          aria-label={showPwd ? 'Hide password' : 'Show password'}
          aria-pressed={showPwd}
        >
          {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      <button
        type="submit"
        disabled={loading || !form.username.trim() || !form.password}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
        ) : (
          'Continue →'
        )}
      </button>

      <button
        type="button"
        onClick={() => onForgotPassword(form.username)}
        className="w-full text-center text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        Forgot password?
      </button>
    </form>
  );
}
