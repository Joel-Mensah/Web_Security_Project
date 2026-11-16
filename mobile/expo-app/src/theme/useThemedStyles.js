// mobile/expo-app/src/theme/useThemedStyles.js — palette-aware StyleSheet factory
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { palettes } from './tokens';
import { useTheme } from './ThemeContext';

export function usePalette() {
  const { effective } = useTheme();
  return palettes[effective] || palettes.dark;
}

export function useThemedStyles() {
  const palette = usePalette();
  return useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: palette.bg },
        scrollContent: { padding: 16, paddingBottom: 48, backgroundColor: palette.bg },
        card: {
          backgroundColor: palette.card,
          borderColor: palette.cardBorder,
          borderWidth: 1,
          borderRadius: 18,
          padding: 20,
        },
        title: { color: palette.text, fontSize: 24, fontWeight: '800' },
        text: { color: palette.text },
        muted: { color: palette.muted },
        input: {
          backgroundColor: palette.inputBg,
          borderColor: palette.inputBorder,
          borderWidth: 1,
          borderRadius: 12,
          color: palette.text,
          paddingHorizontal: 14,
          paddingVertical: 13,
          fontSize: 15,
        },
        button: { backgroundColor: palette.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
        buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
      }),
    [palette]
  );
}
