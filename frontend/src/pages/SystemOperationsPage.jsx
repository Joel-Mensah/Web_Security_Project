import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, CheckCircle, Clock3, Database, Loader2, RefreshCw, ShieldCheck,
} from 'lucide-react';
import client from '../api/client';

function formatDate(value) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown date'
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function readableBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return 'Size unavailable';
  const size = Number(bytes);
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SystemOperationsPage() {
  const [backups, setBackups] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [backupError, setBackupError] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [creatingBackup, setCreatingBackup] = useState(false);

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true);
    setBackupError('');
    try {
      const { data } = await client.get('/system/backups');
      setBackups(data.backups);
    } catch (error) {
      setBackupError(getErrorMessage(error, 'Could not load cloud backups.'));
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  const refresh = loadBackups;

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createBackup = async () => {
    setCreatingBackup(true);
    setBackupError('');
    setBackupMessage('');
    try {
      const { data } = await client.post('/system/backups');
      setBackupMessage(`${data.message} Saved ${data.backup.name}.`);
      await loadBackups();
    } catch (error) {
      setBackupError(getErrorMessage(error, 'Could not create the encrypted backup.'));
    } finally {
      setCreatingBackup(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 animate-fade-in sm:space-y-8 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Administrator controls
          </p>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
            </span>
            System operations
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Create encrypted database backups in Google Drive. Roll back application deployments from Vercel.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={backupsLoading}
          className="btn-ghost flex items-center gap-2 border border-white/10"
        >
          <RefreshCw className={`h-4 w-4 ${backupsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <section className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50 via-emerald-100 to-green-50 p-5 sm:p-7 dark:border-emerald-500/30 dark:from-emerald-900/20 dark:via-green-900/20 dark:to-emerald-900/20">
        <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              <Database className="h-3.5 w-3.5" />
              Encrypted database backup
            </div>
            <h2 className="text-lg font-semibold text-white sm:text-xl dark:text-white">Create an encrypted backup now</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-900 dark:text-slate-400">
              The backup includes account, audit, and incident records. AES-256-GCM encrypts it before upload.
              The encryption key stays in the backend environment.
            </p>
          </div>
          <button
            type="button"
            onClick={createBackup}
            disabled={creatingBackup}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 bg-emerald-500 hover:bg-emerald-400 shadow-sm dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            {creatingBackup
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating backup…</>
              : <><Database className="h-4 w-4" /> Create backup</>}
          </button>
        </div>
        {backupMessage && (
          <p role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> {backupMessage}
          </p>
        )}
        {backupError && (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {backupError}
          </p>
        )}
      </section>

      <section className="glass-card overflow-hidden">
        <div className="border-b border-white/5 px-4 py-4 sm:px-6">
          <h2 className="font-semibold text-white">Cloud backups</h2>
          <p className="mt-1 text-xs text-slate-500">Encrypted backup files in the configured private cloud folder.</p>
        </div>
        {backupsLoading ? (
          <div className="space-y-3 p-4 sm:p-6" aria-label="Loading backups">
            {Array.from({ length: 3 }, (_, index) => <div key={index} className="skeleton h-14 rounded-xl" />)}
          </div>
        ) : backupError ? (
          <p className="px-5 py-8 text-sm text-slate-400">Backup list is unavailable until storage configuration is fixed.</p>
        ) : backups.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">No backups found. Create one to start a backup history.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {backups.map((backup) => (
              <li key={backup.name} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-start gap-3">
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-white">{backup.name}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" /> {formatDate(backup.createdAt)}
                    </p>
                  </div>
                </div>
                <span className="pl-7 text-xs text-slate-400 sm:pl-0">{readableBytes(backup.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-5 sm:p-6">
        <h2 className="font-semibold text-white">Application rollback</h2>
        <p className="mt-2 text-sm text-slate-400">
          To restore an earlier web or API version, open your project in Vercel, go to Deployments, select the earlier deployment, and choose Promote to Production.
        </p>
        <a className="mt-4 inline-flex text-sm font-medium text-emerald-300 hover:text-emerald-200" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">
          Open Vercel dashboard
        </a>
      </section>
    </div>
  );
}
