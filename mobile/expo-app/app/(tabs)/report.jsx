// mobile/expo-app/app/(tabs)/report.jsx — create a new incident report
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CATEGORIES, SEVERITIES, incidentsApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';

export default function ReportScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('suspicious_email');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (title.trim().length < 5 || description.trim().length < 20) {
      setError('Title needs 5+ characters and description needs 20+ characters.');
      return;
    }
    setLoading(true);
    try {
      const created = await incidentsApi.create(accessToken, {
        title: title.trim(),
        category,
        severity,
        description: description.trim(),
      });
      router.push(`/incident/${created.id}`);
    } catch (err) {
      setError(err.message || 'Could not submit the report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <Text style={styles2.headerTitle}>New report</Text>
      <Text style={styles2.headerMeta}>The response team sees new reports immediately</Text>
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="What happened?" placeholderTextColor="#64748b" />
      <Text style={styles.label}>Category</Text>
      <View style={styles2.pickerRow}>
        {CATEGORIES.map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[styles2.chip, category === value && styles2.chipActive]}
            onPress={() => setCategory(value)}
          >
            <Text style={[styles2.chipText, category === value && styles2.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Severity</Text>
      <View style={styles2.pickerRow}>
        {SEVERITIES.map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles2.chip, severity === value && styles2.chipActive]}
            onPress={() => setSeverity(value)}
          >
            <Text style={[styles2.chipText, severity === value && styles2.chipTextActive]}>{value}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Description (min 20 chars)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="What did you see? When? Who is affected?"
        placeholderTextColor="#64748b"
      />
      <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color="#04120c" /> : <Text style={styles.buttonText}>Submit report</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
