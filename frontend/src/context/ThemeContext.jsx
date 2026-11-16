// src/context/ThemeContext.jsx — Dual-theme (light / dark / system) with localStorage persistence
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'ea-theme';
const VALID_MODES = ['light', 'dark', 'system'];

const ThemeContext = createContext(null);

function getStoredMode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (VALID_MODES.includes(raw)) return raw;
  } catch { /* ignore */ }
  return 'dark'; // Dark glassmorphism is the product default
}

function resolveSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(getStoredMode);
  const [systemTheme, setSystemTheme] = useState(resolveSystemTheme);

  // Track OS-level changes while in `system` mode
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!mq?.addEventListener) return;
    const onChange = () => setSystemTheme(mq.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const effective = mode === 'system' ? systemTheme : mode;

  // Inject .dark / .light on <html> for Tailwind `darkMode: 'class'`
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(effective);
    root.style.colorScheme = effective;
    root.dataset.theme = effective;
  }, [effective]);

  const setMode = useCallback((next) => {
    if (!VALID_MODES.includes(next)) return;
    setModeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const current = prev === 'system' ? resolveSystemTheme() : prev;
      const next = current === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode, effective, systemTheme, isDark: effective === 'dark', setMode, toggle }),
    [mode, effective, systemTheme, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
