// mobile/expo-app/src/theme/ThemeContext.js — light / dark / system with persistence
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { loadSession, saveSession } from '../api/storage';

const THEME_KEY = 'ea_theme';
const VALID = ['light', 'dark', 'system'];

const ThemeContext = createContext(null);

async function readStored() {
  try {
    const session = await loadSession();
    const raw = session?.prefs?.theme;
    if (VALID.includes(raw)) return raw;
  } catch { /* ignore */ }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState('dark');
  const [systemTheme, setSystemTheme] = useState(Appearance.getColorScheme() || 'dark');

  useEffect(() => {
    readStored().then(setModeState);
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemTheme(colorScheme || 'dark');
    });
    return () => sub?.remove?.();
  }, []);

  const effective = mode === 'system' ? systemTheme || 'dark' : mode;

  const setMode = useCallback(async (next) => {
    if (!VALID.includes(next)) return;
    setModeState(next);
    try {
      const session = await loadSession();
      await saveSession(session?.accessToken || null, session?.user || null, { theme: next });
    } catch { /* ignore */ }
  }, []);

  const toggle = useCallback(async () => {
    const next = effective === 'dark' ? 'light' : 'dark';
    setModeState(next);
    try {
      const session = await loadSession();
      await saveSession(session?.accessToken || null, session?.user || null, { theme: next });
    } catch { /* ignore */ }
  }, [effective]);

  const value = useMemo(
    () => ({ mode, effective, isDark: effective === 'dark', setMode, toggle }),
    [mode, effective, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
