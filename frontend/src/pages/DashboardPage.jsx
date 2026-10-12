import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowRight, CheckCircle, Clock3, KeyRound,
  Loader2, RefreshCw, ScrollText, ShieldCheck, UserPlus, Users,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import client from '../api/client';

const ROLE_STYLE = {
  inputer: 'bg-slate-500/15 text-slate-300',
  manager: 'bg-blue-500/15 text-blue-300',
  admin: 'bg-amber-500/15 text-amber-300',
  administrator: 'bg-emerald-500/15 text-emerald-400',
};

const ROLE_INTRO = {
  inputer: 'Your account and sign-in security at a glance.',
  manager: 'Track account readiness and onboard Inputer accounts.',
  admin: 'Review account health and manage Inputer accounts.',
  administrator: 'Monitor account security and system activity.',
};

const ROLE_PERMISSIONS = {
  inputer: [
    'Sign in with two-factor authentication',
    'Recover your account by email',
    'View your account security status',
  ],
  manager: [
    'Create Inputer accounts',
    'View the user directory',
    'Send password setup links to Inputer accounts',
  ],
  admin: [
    'View the user directory and account status',
    'Delete Inputer accounts',
    'Review MFA and password setup status',
  ],
  administrator: [
    'Create, delete, and assign roles to accounts',
    'Review the audit trail',
    'Resolve database synchronization conflicts',
  ],
};

function StatCard({ icon: Icon, label, value, detail, tone = 'emerald' }) {
  const tones = {
    emerald: 'bg-emerald-500/10 text-emerald-300',
    blue: 'bg-blue-500/10 text-blue-300',
    amber: 'bg-amber-500/10 text-amber-300',
    rose: 'bg-rose-500/10 text-rose-300',
  };

  return (
    <article className="glass-card flex min-w-0 items-start gap-4 p-4 sm:p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-slate-300">{label}</p>
        {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
      </div>
    </article>
  );
}

function QuickAction({ to, icon: Icon, title, description, tone = 'emerald' }) {
  const iconTone = tone === 'amber' ? 'text-amber-300' : 'text-emerald-300';

  return (
    <Link
      to={to}
      className="group flex min-w-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/[0.06]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
        <Icon className={`h-5 w-5 ${iconTone}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-1 group-hover:text-emerald-300" />
    </Link>
  );
}

function SectionHeading({ icon: Icon, children, aside }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-semibold text-white">
        <Icon className="h-4 w-4 text-emerald-300" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

function formatDate(value, options) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString(undefined, options);
}

export default function DashboardPage() {
  const { user, hasRole } = useAuth();
  const [profile, setProfile] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [conflictCount, setConflictCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const role = user?.role?.toLowerCase() || 'inputer';
  const canViewUsers = hasRole('manager', 'admin', 'administrator');
  const isAdministrator = hasRole('administrator');
  const localSyncEnabled = import.meta.env.VITE_LOCAL_SYNC_ENABLED !== 'false';

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    const requests = [
      client.get('/auth/me').then(({ data }) => setProfile(data)),
    ];
    if (canViewUsers) {
      requests.push(
        client.get('/users/dashboard-summary').then(({ data }) => setSummary(data))
      );
    }
    if (isAdministrator) {
      requests.push(
        client.get('/users/logs/audit?limit=5').then(({ data }) => setRecent(data))
      );
      if (localSyncEnabled) {
        requests.push(
          client.get('/sync/conflicts').then(({ data }) => setConflictCount(data.conflicts.length))
        );
      }
    }

    const results = await Promise.allSettled(requests);
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) setError('Some dashboard information could not be loaded. Refresh to try again.');
    setLoading(false);
    setRefreshing(false);
  }, [canViewUsers, isAdministrator, localSyncEnabled]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totalUsers = summary?.total_users;
  const activePercent = totalUsers
    ? Math.round((summary.active_users / totalUsers) * 100)
    : 0;
  const mfaPercent = totalUsers
    ? Math.round((summary.mfa_enabled_users / totalUsers) * 100)
    : 0;
  const mfaEnabled = profile?.mfa_enabled;
  const displayName = profile?.username || user?.username || 'User';

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 animate-fade-in sm:space-y-8 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            EnterpriseAuth overview
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-white sm:text-3xl">
              Welcome, <span className="text-emerald-300">{displayName}</span>
            </h1>
            <span className={`role-badge ${ROLE_STYLE[role] || ROLE_STYLE.inputer}`}>{role}</span>
          </div>
          <p className="mt-2 text-sm text-slate-400">{ROLE_INTRO[role] || ROLE_INTRO.inputer}</p>
        </div>
        <button
          type="button"
          onClick={() => loadDashboard(true)}
          disabled={loading || refreshing}
          className="btn-ghost flex items-center gap-2 border border-white/10"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <section className="relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/10 via-navy-900 to-blue-500/10 p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Account security
            </div>
            <h2 className="text-lg font-semibold text-white sm:text-xl">
              {loading
                ? 'Checking your security status…'
                : mfaEnabled
                  ? 'Multi-factor authentication is enabled'
                  : 'Complete two-factor authentication setup'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Passwords are protected with Argon2id. Two-factor verification adds another check at sign-in.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3">
            {loading
              ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              : <span className={`h-2.5 w-2.5 rounded-full ${mfaEnabled ? 'bg-emerald-400' : 'bg-amber-400'}`} />}
            <span className="text-sm font-medium text-white">
              {loading ? 'Loading' : mfaEnabled ? 'Protected' : 'Setup needed'}
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      {canViewUsers ? (
        <section>
          <SectionHeading icon={Activity}>Account health</SectionHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Users}
              label="Total accounts"
              value={loading && !summary ? '…' : summary?.total_users ?? '—'}
              detail="Across all roles"
              tone="blue"
            />
            <StatCard
              icon={CheckCircle}
              label="Active accounts"
              value={loading && !summary ? '…' : summary?.active_users ?? '—'}
              detail={summary ? `${activePercent}% of all accounts` : 'Currently enabled'}
              tone="emerald"
            />
            <StatCard
              icon={ShieldCheck}
              label="MFA enabled"
              value={loading && !summary ? '…' : summary?.mfa_enabled_users ?? '—'}
              detail={summary ? `${mfaPercent}% of all accounts` : 'Two-factor protection'}
              tone="blue"
            />
            <StatCard
              icon={KeyRound}
              label="Setup pending"
              value={loading && !summary ? '…' : summary?.setup_pending ?? '—'}
              detail="Awaiting password setup"
              tone={summary?.setup_pending ? 'amber' : 'emerald'}
            />
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            icon={Clock3}
            label="Last sign-in"
            value={loading ? '…' : formatDate(profile?.last_login_at, { dateStyle: 'medium' })}
            detail={loading ? 'Loading your account' : formatDate(profile?.last_login_at, { timeStyle: 'short' })}
            tone="blue"
          />
          <StatCard
            icon={KeyRound}
            label="Account created"
            value={loading ? '…' : formatDate(profile?.created_at, { dateStyle: 'medium' })}
            detail="Account profile"
            tone="emerald"
          />
        </section>
      )}

      <section>
        <SectionHeading icon={ArrowRight}>Quick actions</SectionHeading>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {canViewUsers && (
            <QuickAction
              to="/users"
              icon={Users}
              title="User management"
              description={role === 'manager' ? 'Create and support Inputer accounts' : 'Review account status and access'}
            />
          )}
          {isAdministrator && (
            <QuickAction
              to="/users"
              icon={UserPlus}
              title="Manage accounts and roles"
              description="Create accounts, change roles, and review account status"
            />
          )}
          {isAdministrator && localSyncEnabled && (
            <QuickAction
              to="/sync-conflicts"
              icon={AlertTriangle}
              title="Synchronization conflicts"
              description={conflictCount === null ? 'Review local and Supabase differences' : `${conflictCount} open conflict${conflictCount === 1 ? '' : 's'}`}
              tone="amber"
            />
          )}
          {!canViewUsers && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="font-medium text-white">Keep your account protected</h3>
              <p className="mt-1 text-sm text-slate-400">
                Use your authenticator app for sign-in. If you lose access, use email recovery from the login page.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <div className="glass-card p-5 sm:p-6">
          <SectionHeading icon={ShieldCheck}>Your access</SectionHeading>
          <ul className="space-y-3">
            {(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.inputer).map(permission => (
              <li key={permission} className="flex items-start gap-3 text-sm text-slate-300">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{permission}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-white/5 pt-4 text-xs text-slate-500">
            Your role controls which account and security tools you can access.
          </p>
        </div>

        {isAdministrator ? (
          <div className="glass-card p-5 sm:p-6">
            <SectionHeading
              icon={ScrollText}
              aside={<span className="text-xs text-slate-500">Latest 5</span>}
            >
              Recent audit activity
            </SectionHeading>
            {loading && recent.length === 0 ? (
              <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
              </div>
            ) : recent.length ? (
              <ul className="divide-y divide-white/5">
                {recent.map(event => (
                  <li key={event.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                    <div className="min-w-0">
                      <p className="break-words font-mono text-xs text-emerald-300">{event.action}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">
                        {event.actor_username || 'System'}
                        {event.subject_username ? ` · ${event.subject_username}` : ''}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-500">
                      {formatDate(event.created_at, { dateStyle: 'short', timeStyle: 'short' })}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-sm text-slate-400">No recent audit events.</p>
            )}
          </div>
        ) : (
          <div className="glass-card p-5 sm:p-6">
            <SectionHeading icon={Clock3}>Session information</SectionHeading>
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Signed in as</p>
                <p className="mt-1 break-all text-sm font-medium text-white">{displayName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Last successful sign-in</p>
                <p className="mt-1 text-sm text-slate-300">
                  {loading ? 'Loading…' : formatDate(profile?.last_login_at, { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <p className="border-t border-white/5 pt-4 text-xs leading-relaxed text-slate-500">
                If you lose access to your account, use the Forgot password option on the sign-in page.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
