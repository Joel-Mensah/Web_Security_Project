// src/components/LoginSimulationModal.jsx
// Visual cryptographic authentication simulation showing real-time security verification steps
import { useState, useEffect } from 'react';
import { Shield, CheckCircle2, Loader2, Check, X, Terminal } from 'lucide-react';

const SIMULATION_STEPS = [
  {
    id: 1,
    title: 'Identity Verification & Salt Retrieval',
    detail: 'Querying account in PostgreSQL & retrieving 16-byte random salt',
    tag: 'PostgreSQL DB',
    duration: 450,
  },
  {
    id: 2,
    title: 'Argon2id Cryptographic Hashing',
    detail: 'Computing Hash = Argon2id(Password + Pepper + Salt) [64 MB RAM, 3 iterations, 4 threads]',
    tag: 'Argon2id Engine',
    duration: 600,
  },
  {
    id: 3,
    title: 'Pepper Injection & Timing-Safe Check',
    detail: 'Evaluating server environment pepper with constant-time cryptographic equality',
    tag: 'Crypto Guard',
    duration: 450,
  },
  {
    id: 4,
    title: 'Multi-Factor Authentication (2FA)',
    detail: 'Verifying RFC 6238 TOTP Authenticator code / temporary Email OTP',
    tag: 'TOTP / 2FA',
    duration: 450,
  },
  {
    id: 5,
    title: 'RBAC Access Policy & JWT Issuance',
    detail: 'Establishing role-based permissions & issuing signed JWT session bearer token',
    tag: 'RBAC Policy',
    duration: 450,
  },
];

export default function LoginSimulationModal({
  isOpen,
  username = 'Administrator',
  role = 'administrator',
  onComplete,
  isDemo = false,
  onClose,
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStepIndex(0);
      setIsFinished(false);
      return;
    }

    const timers = new Set();
    let step = 0;
    const schedule = (callback, delay) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delay);
      timers.add(timer);
    };

    const runNextStep = () => {
      if (step < SIMULATION_STEPS.length) {
        const stepDuration = SIMULATION_STEPS[step].duration;
        step += 1;
        setCurrentStepIndex(step);
        if (step < SIMULATION_STEPS.length) {
          schedule(runNextStep, stepDuration);
        } else {
          schedule(() => {
            setIsFinished(true);
            if (onComplete && !isDemo) {
              schedule(onComplete, 1200);
            }
          }, 400);
        }
      }
    };

    schedule(runNextStep, 250);

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [isOpen, onComplete, isDemo, runId]);

  if (!isOpen) return null;

  const progressPercent = Math.min(100, Math.round((currentStepIndex / SIMULATION_STEPS.length) * 100));

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="glass-card max-w-lg w-full p-6 sm:p-7 bg-white/95 dark:bg-slate-900/90 border border-slate-200/80 dark:border-emerald-500/30 shadow-2xl relative overflow-hidden animate-slide-up text-slate-900 dark:text-white">
        {/* Animated glowing top banner accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600 animate-pulse" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Shield className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base sm:text-lg">Authentication in Process</h3>
                <span className="text-[10px] font-mono uppercase bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                  {isDemo ? 'Interactive Demo' : 'Authentication Simulation'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Authenticating account <strong className="text-emerald-600 dark:text-emerald-300">{username}</strong> ({role})
              </p>
            </div>
          </div>
          {isDemo && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              aria-label="Close simulation"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-6 space-y-1.5">
          <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 font-mono">
            <span>Security Pipeline Progress</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-300 dark:border-white/5 relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Telemetry / Checklist steps */}
        <div className="space-y-2.5 mb-6">
          {SIMULATION_STEPS.map((s, index) => {
            const isDone = currentStepIndex > index;
            const isCurrent = currentStepIndex === index + 1 && !isFinished;

            return (
              <div
                key={s.id}
                className={`p-3 rounded-xl border transition-all duration-300 flex items-start gap-3 relative overflow-hidden ${
                  isDone
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500/40 text-slate-900 dark:text-white'
                    : isCurrent
                    ? 'bg-white dark:bg-white/[0.08] border-emerald-500 shadow-md shadow-emerald-500/10 text-slate-900 dark:text-white scale-[1.01]'
                    : 'bg-slate-50/60 dark:bg-white/[0.01] border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-500 opacity-60'
                }`}
              >
                {/* Visual energy scanning pulse for current step */}
                {isCurrent && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-400/10 dark:via-emerald-400/15 to-transparent animate-pulse pointer-events-none" />
                )}

                <div className="mt-0.5 flex-shrink-0">
                  {isDone ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : isCurrent ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      {s.id}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className={`text-xs font-semibold ${isDone || isCurrent ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'}`}>
                      {s.title}
                    </p>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium ${
                        isDone
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : isCurrent
                          ? 'bg-teal-500/20 text-teal-700 dark:text-teal-300 animate-pulse font-semibold'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {s.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed font-mono truncate">
                    {s.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer banner / status */}
        <div className="pt-3 border-t border-slate-200 dark:border-white/10 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
            <Terminal className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
            <span>
              {isFinished
                ? 'Authentication successful — access granted!'
                : `Executing Step ${Math.min(currentStepIndex || 1, SIMULATION_STEPS.length)} of ${SIMULATION_STEPS.length}...`}
            </span>
          </div>

          {isFinished && isDemo ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentStepIndex(0);
                  setIsFinished(false);
                  setRunId((id) => id + 1);
                }}
                className="btn-ghost py-1 px-3 text-xs border border-slate-300 dark:border-white/10"
              >
                Replay
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-primary py-1 px-4 text-xs"
              >
                Done
              </button>
            </div>
          ) : isFinished ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" /> Establishing Session…
            </span>
          ) : (
            <span className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">
              Argon2id + Salt + Pepper
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
