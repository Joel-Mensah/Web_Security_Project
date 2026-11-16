// src/components/ThemeToggle.jsx — Sun / Moon / Monitor switch with smooth icon animation
import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const ORDER = ['dark', 'light', 'system'];

export default function ThemeToggle({ compact = false }) {
  const { mode, effective, setMode } = useTheme();
  const [spinKey, setSpinKey] = useState(0);

  useEffect(() => {
    setSpinKey((k) => k + 1);
  }, [effective]);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
  };

  const Icon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  const label = mode === 'light' ? 'Light mode' : mode === 'dark' ? 'Dark mode' : 'System theme';

  if (compact) {
    return (
      <button
        type="button"
        onClick={cycle}
        title={`Theme: ${label} (click to change)`}
        aria-label={`Theme: ${label}. Activate to switch theme.`}
        className="rounded-lg p-2 text-slate-400 transition-all duration-200 hover:bg-black/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <span key={spinKey} className="block animate-fade-in">
          <Icon className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white/70 p-1 backdrop-blur-md dark:border-white/10 dark:bg-white/5"
      role="group"
      aria-label="Color theme"
    >
      {ORDER.map((value) => {
        const ItemIcon = value === 'light' ? Sun : value === 'dark' ? Moon : Monitor;
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            title={value === 'light' ? 'Light' : value === 'dark' ? 'Dark' : 'System'}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold capitalize transition-all duration-200 ${
              active
                ? 'bg-indigo-600 text-white shadow-sm dark:bg-indigo-500'
                : 'text-slate-500 hover:bg-black/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
          >
            <ItemIcon className="h-3.5 w-3.5" />
            {!compact && <span className="hidden sm:inline">{value}</span>}
          </button>
        );
      })}
    </div>
  );
}
