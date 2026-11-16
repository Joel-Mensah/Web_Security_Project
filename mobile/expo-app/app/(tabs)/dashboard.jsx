// mobile/expo-app/app/(tabs)/dashboard.jsx — role-aware overview
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { incidentsApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';

function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setError('');
    try {
      const [sum, inbox] = await Promise.all([
        incidentsApi.summary(accessToken),
        incidentsApi.list(accessToken, { limit: 5 }),
      ]);
      setSummary(sum);
      setRecent(inbox.incidents || inbox || []);
    } catch (err) {
      setError(err.message || 'Could not load the dashboard.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      <View style={styles2.header}>
        <Text style={styles2.headerTitle}>Hello, {user?.username || 'there'}</Text>
        <Text style={styles2.headerMeta}>
          {(user?.role || 'inputer').toUpperCase()} · {user?.email || 'No email on file'}
        </Text>
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles2.statGrid}>
        <View style={styles2.statCard}>
          <Text style={styles2.statValue}>{summary?.total ?? '—'}</Text>
          <Text style={styles2.statLabel}>Total reports</Text>
        </View>
        <View style={styles2.statCard}>
          <Text style={styles2.statValue}>{summary?.open ?? '—'}</Text>
          <Text style={styles2.statLabel}>Open reports</Text>
        </View>
        <View style={styles2.statCard}>
          <Text style={styles2.statValue}>{summary?.urgent ?? '—'}</Text>
          <Text style={styles2.statLabel}>High / critical</Text>
        </View>
        <View style={styles2.statCard}>
          <Text style={styles2.statValue}>{summary?.resolved ?? '—'}</Text>
          <Text style={styles2.statLabel}>Resolved</Text>
        </View>
      </View>

      <View style={[styles2.listCard, { marginTop: 14 }]}>
        <Text style={styles2.sectionTitle}>Recent reports</Text>
        <Text style={styles2.sectionSubtitle}>Ordered by severity and recent activity</Text>
        {(Array.isArray(recent) ? recent.slice(0, 5) : []).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles2.commentBox}
            onPress={() => router.push(`/incident/${item.id}`)}
          >
            <Text style={styles2.listTitle}>{item.title}</Text>
            <Text style={styles2.listMeta}>
              {item.severity} · {item.status} · {formatDate(item.updated_at)}
            </Text>
          </TouchableOpacity>
        ))}
        {(!recent || recent.length === 0) && (
          <Text style={styles2.listMeta}>No reports yet.</Text>
        )}
        <TouchableOpacity style={styles.ghostButton} onPress={() => router.push('/(tabs)/incidents')}>
          <Text style={styles.ghostButtonText}>View all reports</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
