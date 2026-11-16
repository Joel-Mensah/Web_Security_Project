// mobile/expo-app/app/(tabs)/system.jsx — System Operations (administrator)
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { systemApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';

function formatDate(value) {
  if (!value) return 'Unknown date';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleString();
}

function readableBytes(bytes) {
  if (!Number.isFinite(Number(bytes))) return 'Size unavailable';
  const size = Number(bytes);
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SystemScreen() {
  const { user, accessToken, hasRole } = useAuth();
  const isAdmin = hasRole('administrator');
  const [backups, setBackups] = useState([]);
  const [restorePoints, setRestorePoints] = useState([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [restorePointsLoading, setRestorePointsLoading] = useState(true);
  const [backupError, setBackupError] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [backupMessage, setBackupMessage] = useState('');
  const [restoreMessage, setRestoreMessage] = useState('');
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringSha, setRestoringSha] = useState('');
  const [newSha, setNewSha] = useState('');

  const load = useCallback(async () => {
    setBackupsLoading(true);
    setRestorePointsLoading(true);
    try {
      const [b, r] = await Promise.all([
        systemApi.listBackups(accessToken),
        systemApi.listRestorePoints(accessToken),
      ]);
      setBackups(b.backups || []);
      setRestorePoints(r.restorePoints || []);
    } catch (err) {
      if (err.message.includes('backups')) setBackupError(err.message);
      else setRestoreError(err.message);
    } finally {
      setBackupsLoading(false);
      setRestorePointsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  const createBackup = async () => {
    setCreatingBackup(true);
    setBackupError('');
    setBackupMessage('');
    try {
      const data = await systemApi.createBackup(accessToken);
      setBackupMessage(`${data.message} Saved ${data.backup.name}.`);
      await load();
    } catch (err) {
      setBackupError(err.message || 'Could not create backup.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const restoreApp = async (sha) => {
    const confirmed = await Alert.alert(
      'Restore application version',
      `Restore to commit ${sha.slice(0, 8)}? This rolls back application code only. Database records are not changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', style: 'destructive', onPress: () => {} },
      ],
    );
    if (confirmed !== 2) return;
    setRestoringSha(sha);
    setRestoreError('');
    setRestoreMessage('');
    try {
      const data = await systemApi.createRestorePoint(accessToken, sha);
      setRestoreMessage(data.message || 'Restore started.');
      await load();
    } catch (err) {
      setRestoreError(err.message || 'Restore failed.');
    } finally {
      setRestoringSha('');
    }
  };

  if (!isAdmin) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
        <Text style={styles2.headerTitle}>System Operations</Text>
        <Text style={styles2.headerMeta}>Administrator access required.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles2.integrationsHeader}>
        <View>
          <Text style={styles2.headerTitle}>System Operations</Text>
          <Text style={styles2.headerMeta}>Backups, restore points, and application rollback.</Text>
        </View>
        <TouchableOpacity style={styles2.refreshButton} onPress={load} disabled={backupsLoading || restorePointsLoading}>
          <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 6 }} animating={backupsLoading || restorePointsLoading} />
          <Text style={styles2.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {!!backupMessage && (
        <View style={styles2.noticeBox}>
          <Text style={styles2.noticeText}>{backupMessage}</Text>
        </View>
      )}
      {!!backupError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{backupError}</Text>
        </View>
      )}
      {!!restoreMessage && (
        <View style={styles2.noticeBox}>
          <Text style={styles2.noticeText}>{restoreMessage}</Text>
        </View>
      )}
      {!!restoreError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{restoreError}</Text>
        </View>
      )}

      <View style={[styles2.listCard, { marginTop: 14 }]}>
        <Text style={styles2.sectionTitle}>Cloud backups</Text>
        <Text style={styles2.sectionSubtitle}>Encrypted AES-256-GCM database backups to private storage.</Text>
        {backupsLoading ? (
          <ActivityIndicator style={{ marginTop: 16 }} color="#10b981" />
        ) : backups.length === 0 ? (
          <Text style={styles2.listMeta}>No backups found.</Text>
        ) : (
          <View>
            {backups.map((b) => (
              <View key={b.name} style={styles2.listCard}>
                <View style={styles.row}>
                  <View>
                    <Text style={styles2.listTitle}>{b.name}</Text>
                    <Text style={styles2.listMeta}>{formatDate(b.createdAt)}</Text>
                  </View>
                  <Text style={styles2.listMeta}>{readableBytes(b.size)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={[styles.button, creatingBackup && styles.buttonDisabled]}
          onPress={createBackup}
          disabled={creatingBackup}
        >
          {creatingBackup ? <ActivityIndicator color="#04120c" /> : <Text style={styles.buttonText}>Create backup</Text>}
        </TouchableOpacity>
      </View>

      <View style={[styles2.listCard, { marginTop: 14 }]}>
        <Text style={styles2.sectionTitle}>Application restore points</Text>
        <Text style={styles2.sectionSubtitle}>Restoring changes the active AWS frontend and API releases. Database records are not changed.</Text>
        {restorePointsLoading ? (
          <ActivityIndicator style={{ marginTop: 16 }} color="#10b981" />
        ) : restorePoints.length === 0 ? (
          <Text style={styles2.listMeta}>No restore points found. Deploy a release to AWS to create one.</Text>
        ) : (
          <View>
            {restorePoints.map((p) => (
              <View key={p.commitSha} style={styles2.listCard}>
                <View style={styles.row}>
                  <View>
                    <Text style={styles2.listTitle}>{p.commitSha.slice(0, 12)}</Text>
                    <Text style={styles2.listMeta}>{formatDate(p.createdAt)}</Text>
                  </View>
                </View>
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    style={styles.input}
                    value={newSha}
                    onChangeText={setNewSha}
                    placeholder="Commit SHA to restore"
                    placeholderTextColor="#64748b"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.button, restoringSha === p.commitSha && styles.buttonDisabled]}
                  onPress={() => restoreApp(newSha || p.commitSha)}
                  disabled={restoringSha === p.commitSha || (!newSha && !p.commitSha)}
                >
                  {restoringSha === p.commitSha
                    ? <ActivityIndicator color="#04120c" />
                    : <Text style={styles.buttonText}>Restore to {p.commitSha.slice(0, 8)}</Text>}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}