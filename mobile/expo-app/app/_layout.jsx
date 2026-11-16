// mobile/expo-app/app/_layout.jsx — Expo Router root with auth + theme providers
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function ThemedShell() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: isDark ? '#0B0F17' : '#F8FAFC' },
          headerTintColor: isDark ? '#F9FAFB' : '#0F172A',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: isDark ? '#0B0F17' : '#F8FAFC' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign in', headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="incident/[id]" options={{ title: 'Incident detail' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedShell />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
