// mobile/expo-app/src/screens/ThemeToggle.jsx — Sun / Moon / Monitor switch
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { usePalette } from '../theme/useThemedStyles';

const ORDER = ['dark', 'light', 'system'];
const ICONS = { dark: '☾', light: '☀', system: '◉' };

export function ThemeToggle({ compact = false }) {
  const { mode, setMode } = useTheme();
  const palette = usePalette();

  if (compact) {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    return (
      <TouchableOpacity
        onPress={() => setMode(next)}
        accessibilityLabel={`Theme: ${mode}. Tap to switch.`}
        style={{
          borderRadius: 10, padding: 8,
          borderWidth: 1, borderColor: palette.cardBorder,
          backgroundColor: palette.card,
        }}
      >
        <Text style={{ color: palette.text, fontSize: 16 }}>{ICONS[mode]}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 12, borderWidth: 1, borderColor: palette.cardBorder, backgroundColor: palette.card }}>
      {ORDER.map((value) => {
        const active = mode === value;
        return (
          <TouchableOpacity
            key={value}
            onPress={() => setMode(value)}
            accessibilityState={{ selected: active }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
              backgroundColor: active ? palette.primary : 'transparent',
            }}
          >
            <Text style={{ color: active ? '#fff' : palette.muted, fontSize: 13 }}>{ICONS[value]}</Text>
            <Text style={{ color: active ? '#fff' : palette.muted, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>
              {value}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
