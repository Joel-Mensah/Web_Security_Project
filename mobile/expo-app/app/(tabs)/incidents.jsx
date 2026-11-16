// mobile/expo-app/app/(tabs)/incidents.jsx — searchable report queue
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SEVERITIES, STATUSES, incidentsApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';

function ChipRow({ label, options, value, onChange }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles2.pickerRow}>
        <TouchableOpacity
          style={[styles2.chip, !value && styles2.chipActive]}
          onPress={() => onChange('')}
        >
          <Text style={[styles2.chipText, !value && styles2.chipTextActive]}>All</Text>
        </TouchableOpacity>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles2.chip, value === opt && styles2.chipActive]}
            onPress={() => onChange(opt)}
          >
            <Text style={[styles2.chipText, value === opt && styles2.chipTextActive]}>
              {opt.replaceAll('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function IncidentsScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await incidentsApi.list(accessToken, {
        search: search.trim(),
        status,
        severity,
        limit: 50,
      });
      setItems(data.incidents || data || []);
    } catch (err) {
      setError(err.message || 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, search, status, severity]);

  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles2.headerTitle}>Reports</Text>
      <Text style={styles2.headerMeta}>Search, filter, and open a report for detail</Text>

      <Text style={styles.label}>Search</Text>
      <TextInput
        style={styles.input}
        value={search}
        onChangeText={setSearch}
        placeholder="Search title or description"
        placeholderTextColor="#64748b"
      />
      <ChipRow label="Status" options={STATUSES} value={status} onChange={setStatus} />
      <ChipRow label="Severity" options={SEVERITIES} value={severity} onChange={setSeverity} />

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#10b981" />
      ) : (
        <View>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles2.listCard}
              onPress={() => router.push(`/incident/${item.id}`)}
            >
              <Text style={styles2.listTitle}>{item.title}</Text>
              <Text style={styles2.listMeta}>
                {item.category?.replaceAll('_', ' ')} · {item.reporter_username || 'unknown reporter'}
              </Text>
              <View style={[styles2.badge, { borderColor: 'rgba(16,185,129,0.4)', backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                <Text style={[styles2.badgeText, { color: '#6ee7b7' }]}>
                  {item.severity} · {item.status}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {items.length === 0 && <Text style={styles2.listMeta}>No reports match these filters.</Text>}
        </View>
      )}
    </ScrollView>
  );
}
