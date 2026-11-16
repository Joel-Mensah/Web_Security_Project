// mobile/expo-app/src/theme/tokens.js — dual palettes (dark default glass + light enterprise clean)
export const darkColors = {
  bg: '#0B0F17',
  bgSoft: '#111827',
  card: 'rgba(17, 24, 39, 0.6)',
  cardBorder: 'rgba(51, 65, 85, 0.8)',
  text: '#F9FAFB',
  muted: '#9CA3AF',
  faint: '#64748b',
  primary: '#06B6D4',
  primaryDark: '#6366F1',
  danger: '#f43f5e',
  amber: '#f59e0b',
  sky: '#38bdf8',
  violet: '#a78bfa',
  inputBg: 'rgba(30, 41, 59, 0.6)',
  inputBorder: 'rgba(51, 65, 85, 0.8)',
};

export const lightColors = {
  bg: '#F8FAFC',
  bgSoft: '#F1F5F9',
  card: 'rgba(255, 255, 255, 0.8)',
  cardBorder: '#E2E8F0',
  text: '#0F172A',
  muted: '#475569',
  faint: '#94a3b8',
  primary: '#0284C7',
  primaryDark: '#4F46E5',
  danger: '#DC2626',
  amber: '#D97706',
  sky: '#0284C7',
  violet: '#7C3AED',
  inputBg: '#FFFFFF',
  inputBorder: '#CBD5E1',
};

// Theme-aware colors — returns palette for the given mode
export function getColors(mode) {
  const light = {
    bg: '#F8FAFC',
    bgSoft: '#F1F5F9',
    card: 'rgba(255, 255, 255, 0.8)',
    cardBorder: '#E2E8F0',
    text: '#0F172A',
    muted: '#475569',
    faint: '#94a3b8',
    primary: '#0284C7',
    primaryDark: '#4F46E5',
    danger: '#DC2626',
    amber: '#D97706',
    sky: '#0284C7',
    violet: '#7C3AED',
    inputBg: '#FFFFFF',
    inputBorder: '#CBD5E1',
  };
  const dark = {
    bg: '#0B0F17',
    bgSoft: '#111827',
    card: 'rgba(17, 24, 39, 0.6)',
    cardBorder: 'rgba(51, 65, 85, 0.8)',
    text: '#F9FAFB',
    muted: '#9CA3AF',
    faint: '#64748b',
    primary: '#06B6D4',
    primaryDark: '#6366F1',
    danger: '#f43f5e',
    amber: '#f59e0b',
    sky: '#38bdf8',
    violet: '#a78bfa',
    inputBg: 'rgba(30, 41, 59, 0.6)',
    inputBorder: 'rgba(51, 65, 85, 0.8)',
  };
  return mode === 'light' ? light : dark;
}
// Backward-compat default (dark)
export const colors = getColors('dark');

export const palettes = { dark: darkColors, light: lightColors };

