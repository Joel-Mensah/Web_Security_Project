// mobile/expo-app/app/index.jsx — redirect based on stored session
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { getColors } from '../src/theme/tokens';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/(tabs)/dashboard' : '/login');
  }, [loading, user, router]);

  const mode = 'dark';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: getColors(mode).bg }}>
      <ActivityIndicator size="large" color={getColors(mode).primary} />
    </View>
  );
}
