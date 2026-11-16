// mobile/expo-app/app/(tabs)/audit.jsx — Audit Logs (administrator)
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, ScrollView, Text, TouchableOpacity, View,
} from 'react-native';
import { usersApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';

function formatDate(value) {
  if (!value) return 'Unknown date';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleString();
}

export default function AuditScreen() {
  const { accessToken, hasRole } = useAuth();
  const isAdmin = hasRole('administrator');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await usersApi.auditLogs(accessToken, { limit: 100 });
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Could not load audit events.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { if (accessToken) loadEvents(); }, [accessToken, loadEvents]);

  if (!isAdmin) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
        <Text style={styles2.headerTitle}>Audit Logs</Text>
        <Text style={styles2.headerMeta}>Administrator access required.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles2.integrationsHeader}>
        <View>
          <Text style={styles2.headerTitle}>Audit Logs</Text>
          <Text style={styles2.headerMeta}>Security monitoring — review recent account and security events.</Text>
        </View>
        <TouchableOpacity style={styles2.refreshButton} onPress={loadEvents} disabled={loading}>
          <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 6 }} animating={loading} />
          <Text style={styles2.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={[styles2.listCard, { marginTop: 14 }]}>
        <Text style={styles2.sectionTitle}>Recent events</Text>
        <Text style={styles2.sectionSubtitle}>Showing up to 100 records, newest first</Text>
        <Text style={styles2.listMeta}>{events.length} events</Text>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 16 }} color="#10b981" />
        ) : events.length === 0 ? (
          <Text style={styles2.listMeta}>No audit events yet.</Text>
        ) : (
          <View>
            {events.map((event) => (
              <View key={event.id} style={[styles2.listCard, { marginBottom: 8 }]}>
                <Text style={[styles2.listTitle, { color: '#6ee7b7', fontFamily: 'monospace' }]}>
                  {event.action}
                </Text>
                <Text style={styles2.listMeta}>
                  {event.actor_username || 'System'}
                  {event.subject_username ? ` → ${event.subject_username}` : ''}
                </Text>
                {event.details && Object.keys(event.details).length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={[styles2.listMeta, { fontSize: 10, color: '#64748b' }]}>
                      {JSON.stringify(event.details, null, 2).slice(0, 200)}
                    </Text>
                  </View>
                )}
                <Text style={styles2.commentDate}>{formatDate(event.created_at)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}