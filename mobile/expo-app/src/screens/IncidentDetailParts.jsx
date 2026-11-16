// mobile/expo-app/src/screens/IncidentDetailParts.jsx
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { incidentsApi } from '../api/client';
import { styles } from '../theme/styles';
import { styles2 } from '../theme/styles2';

export function CommentForm({ accessToken, incidentId, canCommentAll, onSent }) {
  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setError('');
    if (message.trim().length < 2) {
      setError('Write at least 2 characters.');
      return;
    }
    setSending(true);
    try {
      await incidentsApi.comment(accessToken, incidentId, message.trim(), internal);
      setMessage('');
      setInternal(false);
      onSent?.();
    } catch (err) {
      setError(err.message || 'Could not post the update.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles2.listCard}>
      <Text style={styles2.sectionTitle}>Add update</Text>
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      <TextInput
        style={[styles.input, styles.textArea, { marginTop: 12 }]}
        value={message}
        onChangeText={setMessage}
        multiline
        placeholder="Write a follow-up or question"
        placeholderTextColor="#64748b"
      />
      {canCommentAll && (
        <TouchableOpacity style={styles.ghostButton} onPress={() => setInternal((v) => !v)}>
          <Text style={styles.ghostButtonText}>
            {internal ? 'Private note: ON (managers only)' : 'Private note: OFF (visible to reporter)'}
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.button, sending && styles.buttonDisabled]}
        onPress={send}
        disabled={sending}
      >
        {sending ? <ActivityIndicator color="#04120c" /> : <Text style={styles.buttonText}>Post update</Text>}
      </TouchableOpacity>
    </View>
  );
}
