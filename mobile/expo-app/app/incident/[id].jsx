// mobile/expo-app/app/incident/[id].jsx — detail + comments (split for size)
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { incidentsApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';
import { CommentForm } from '../../src/screens/IncidentDetailParts';

function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams();
  const { accessToken, user } = useAuth();
  const [incident, setIncident] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    setLoading(true);
    setError('');
    try {
      const data = await incidentsApi.detail(accessToken, id);
      setIncident(data.incident || data);
      setUpdates(data.updates || []);
    } catch (err) {
      setError(err.message || 'Could not load this report.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

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

  if (error || !incident) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error || 'Report not found.'}</Text>
        </View>
      </ScrollView>
    );
  }

  const canCommentAll = ['manager', 'admin', 'administrator'].includes(
    String(user?.role || '').toLowerCase()
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles2.headerTitle}>{incident.title}</Text>
      <Text style={styles2.headerMeta}>
        {String(incident.category || '').replaceAll('_', ' ')} · reported by{' '}
        {incident.reporter_username || 'unknown'} · {formatDate(incident.created_at)}
      </Text>
      <View style={[styles2.badge, { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.12)' }]}>
        <Text style={[styles2.badgeText, { color: '#6ee7b7' }]}>
          {incident.severity} · {incident.status}
        </Text>
      </View>
      <View style={[styles2.listCard, { marginTop: 14 }]}>
        <Text style={styles2.commentBody}>{incident.description}</Text>
      </View>
      <View style={[styles2.listCard, { marginTop: 12 }]}>
        <Text style={styles2.sectionTitle}>Conversation</Text>
        {updates.length === 0 && <Text style={styles2.listMeta}>No updates yet.</Text>}
        {updates.map((u) => (
          <View key={u.id} style={styles2.commentBox}>
            <Text style={styles2.commentAuthor}>
              {u.actor_username || 'System'} · {u.update_type}
              {u.is_internal ? ' · private' : ''}
            </Text>
            {!!u.message && <Text style={styles2.commentBody}>{u.message}</Text>}
            <Text style={styles2.commentDate}>{formatDate(u.created_at)}</Text>
          </View>
        ))}
      </View>
      <CommentForm accessToken={accessToken} incidentId={id} canCommentAll={canCommentAll} onSent={load} />
    </ScrollView>
  );
}
