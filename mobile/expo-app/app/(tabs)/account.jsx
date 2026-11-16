// mobile/expo-app/app/(tabs)/account.jsx — session + role info + theme
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';
import { ThemeToggle } from '../../src/screens/ThemeToggle';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { mode } = useTheme();
  const router = useRouter();

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles2.headerTitle}>Account</Text>
      <Text style={styles2.headerMeta}>Signed-in session on this device</Text>
      <View style={styles2.listCard}>
        <Text style={styles2.listTitle}>{user?.username || 'Unknown user'}</Text>
        <Text style={styles2.listMeta}>{user?.email || 'No email on file'}</Text>
        <View style={[styles2.badge, { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.12)' }]}>
          <Text style={[styles2.badgeText, { color: '#6ee7b7' }]}>
            {(user?.role || 'inputer').toUpperCase()}
          </Text>
        </View>
        <View style={styles2.divider} />
        <Text style={styles2.listMeta}>MFA: {user?.mfa_enabled ? 'enabled' : 'not enabled'}</Text>
        {!!user?.last_login_at && (
          <Text style={styles2.listMeta}>
            Last sign-in: {new Date(user.last_login_at).toLocaleString()}
          </Text>
        )}
      </View>
      <TouchableOpacity style={[styles.button, { backgroundColor: '#f43f5e' }]} onPress={signOut}>
        <Text style={[styles.buttonText, { color: '#fff' }]}>Sign out</Text>
      </TouchableOpacity>

      <View style={[styles2.listCard, { marginTop: 12 }]}>
        <Text style={styles2.listTitle}>Appearance</Text>
        <Text style={styles2.listMeta}>Current: {mode}. Applies instantly, saved on this device.</Text>
        <View style={{ marginTop: 10 }}>
          <ThemeToggle />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.ghostButton, { marginTop: 12 }]}
        onPress={() => router.push('/(tabs)/integrations')}
      >
        <Text style={styles.ghostButtonText}>🔗 Manage linked accounts</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
