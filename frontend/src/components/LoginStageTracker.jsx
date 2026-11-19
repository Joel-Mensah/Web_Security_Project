// src/components/LoginStageTracker.jsx
// Live interactive stage simulator showing real-time animated movement as the user progresses through login
import { Lock, KeyRound, ShieldCheck, CheckCircle2, Check, ArrowRight } from 'lucide-react';

const STAGES = [
  {
    id: 1,
    label: 'Credentials',
    short: 'Step 1',
    description: 'Identity & Password',
    icon: Lock,
  },
  {
    id: 2,
    label: 'Argon2id Hash',
    short: 'Step 2',
    description: 'Salt & Pepper Check',
    icon: KeyRound,
  },
  {
    id: 3,
    label: '2FA Verification',
    short: 'Step 3',
    description: 'TOTP / Email OTP',
    icon: ShieldCheck,
  },
  {
    id: 4,
    label: 'Access Granted',
    short: 'Step 4',
    description: 'JWT & RBAC Policy',
    icon: CheckCircle2,
  },
];

export default function LoginStageTracker({ currentStage = 1, isVerifying = false, statusMessage = '' }) {
  // Determine active visual stage:
  // 1: on credentials form (not submitted)
  // 2: submitting credentials (verifying argon2id salt/hash)
  // 3: on 2FA screen (totp or email otp)
  // 4: 2FA verified / completed (access granted)

  return (
    <div
      className="w-full mb-6 p-3 sm:p-4 rounded-2xl border backdrop-blur-md transition-colors relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(16,185,129,0.03) 100%)',
        border: '1px solid rgba(16,185,129,0.15)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
      }}
    >
      {/* Subtle shimmer top highlight */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.4), transparent)' }}
      />

      {/* Top stage header */}
      <div className="flex items-center justify-between mb-3 text-xs font-mono">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Auth Pipeline Simulator
        </span>
        <span className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
          Stage {currentStage} of 4
        </span>
      </div>

      {/* Pipeline line stays centered through the four equally spaced stage nodes. */}
      <div className="relative">
        <div
          className="absolute left-[12.5%] right-[12.5%] top-[18px] h-1 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-800 sm:top-5"
          role="progressbar"
          aria-label="Authentication progress"
          aria-valuemin={1}
          aria-valuemax={STAGES.length}
          aria-valuenow={currentStage}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 transition-[width] duration-700 ease-out"
            style={{
              width: `${Math.min(100, Math.max(0, ((currentStage - 1) / (STAGES.length - 1)) * 100))}%`,
            }}
          />
          {isVerifying && currentStage < STAGES.length && (
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_3px_rgba(16,185,129,0.8)] transition-[left] duration-700"
              style={{
                left: `${Math.min(100, Math.max(0, ((currentStage - 1) / (STAGES.length - 1)) * 100))}%`,
              }}
            />
          )}
        </div>

        <div className="relative z-10 grid grid-cols-4">
          {STAGES.map((stage) => {
            const isDone = currentStage > stage.id;
            const isCurrent = currentStage === stage.id;
            const Icon = stage.icon;

            return (
              <div key={stage.id} className="flex min-w-0 flex-col items-center">
                <div className="relative flex h-9 items-center justify-center sm:h-10">
                  {isCurrent && (
                    <span className="absolute -inset-1.5 rounded-full bg-emerald-500/25 dark:bg-emerald-400/20 animate-ping" />
                  )}

                  <div
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-500 sm:h-10 sm:w-10 ${
                      isDone
                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                        : isCurrent
                        ? 'scale-110 bg-emerald-600 text-white ring-4 ring-emerald-500/20 dark:bg-emerald-500'
                        : 'border border-slate-300 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                    }`}
                    style={isCurrent ? { boxShadow: '0 0 20px rgba(16,185,129,0.6), 0 4px 12px rgba(16,185,129,0.4)' } : {}}
                    title={`${stage.label}: ${stage.description}`}
                  >
                    {isDone ? (
                      <Check className="h-4 w-4 animate-fade-in stroke-[3]" />
                    ) : (
                      <Icon className={`h-4 w-4 ${isCurrent ? 'animate-pulse' : ''}`} />
                    )}
                  </div>
                </div>

                <div className="mt-2 w-full text-center">
                  <span
                    className={`block text-[10px] font-semibold leading-tight tracking-tight transition-colors sm:text-[11px] ${
                      isCurrent
                        ? 'font-bold text-emerald-600 dark:text-emerald-400'
                        : isDone
                        ? 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {stage.label}
                  </span>
                  <span className="hidden text-[9px] font-mono text-slate-500 dark:text-slate-400 sm:block">
                    {stage.short}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic status telemetry banner */}
      <div className="mt-3.5 pt-2.5 border-t border-slate-200/70 dark:border-white/5 flex items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2 truncate">
          <ArrowRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="text-slate-600 dark:text-slate-300 text-[11px] truncate">
            {statusMessage ||
              (currentStage === 1
                ? 'Enter account username & password'
                : currentStage === 2
                ? 'Verifying Argon2id hash with PostgreSQL salt & pepper...'
                : currentStage === 3
                ? 'Awaiting second factor (TOTP / Email OTP)...'
                : 'Cryptographic session established — Access granted!')}
          </span>
        </div>
        {/* Glamorous status badge */}
        <span
          className="hidden sm:inline-block text-[10px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))',
            border: '1px solid rgba(16,185,129,0.3)',
            color: '#10B981',
            boxShadow: '0 0 8px rgba(16,185,129,0.15)',
          }}
        >
          {currentStage === 1
            ? 'Input Stage'
            : currentStage === 2
            ? 'Argon2id Hash'
            : currentStage === 3
            ? '2FA Check'
            : 'Authorized'}
        </span>
      </div>
    </div>
  );
}
