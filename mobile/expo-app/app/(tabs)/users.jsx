// mobile/expo-app/app/(tabs)/users.jsx — User Management (manager+)
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { usersApi } from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';

const ROLES = ['inputer', 'manager', 'admin', 'administrator'];

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function UsersScreen() {
  const { user, accessToken, hasRole } = useAuth();
  const isManager = hasRole('manager', 'admin', 'administrator');
  const isAdmin = hasRole('administrator');
  const currentUserId = user?.id;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Create user modal
  const [createModal, setCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('inputer');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await usersApi.list(accessToken);
      setUsers(Array.isArray(data) ? data : (data.users || []));
    } catch (err) {
      setError(err.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { if (accessToken) load(); }, [accessToken, load]);

  const handleDelete = async (id) => {
    const confirmed = await Alert.alert(
      'Delete user',
      'Are you sure you want to delete this user? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {} },
      ],
    );
    if (confirmed !== 2) return;
    try {
      await usersApi.delete(accessToken, id);
      setNotice('User deleted.');
      await load();
    } catch (err) {
      setError(err.message || 'Could not delete user.');
    }
  };

  const handleRoleChange = async (id, role) => {
    try {
      await usersApi.changeRole(accessToken, id, role);
      setNotice(`Role changed to ${role}.`);
      await load();
    } catch (err) {
      setError(err.message || 'Could not change role.');
    }
  };

  const handleCreate = async () => {
    try {
      await usersApi.create(accessToken, {
        username: newUsername,
        email: newEmail,
        role: newRole,
      });
      setNotice('User created.');
      setCreateModal(false);
      setNewUsername('');
      setNewEmail('');
      setNewRole('inputer');
      await load();
    } catch (err) {
      setError(err.message || 'Could not create user.');
    }
  };

  if (!isManager) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
        <Text style={styles2.headerTitle}>User Management</Text>
        <Text style={styles2.headerMeta}>Manager access required.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles2.integrationsHeader}>
        <View>
          <Text style={styles2.headerTitle}>User Management</Text>
          <Text style={styles2.headerMeta}>User directory — add, edit, and remove accounts.</Text>
        </View>
        <TouchableOpacity style={styles2.refreshButton} onPress={load} disabled={loading}>
          <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 6 }} animating={loading} />
          <Text style={styles2.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity
            style={[styles2.refreshButton, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}
            onPress={() => setCreateModal(true)}
          >
            <Text style={[styles2.refreshButtonText, { color: '#10b981' }]}>+ Add user</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!notice && (
        <View style={styles2.noticeBox}>
          <Text style={styles2.noticeText}>{notice}</Text>
        </View>
      )}
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#10b981" />
      ) : users.length === 0 ? (
        <Text style={styles2.listMeta}>No users found.</Text>
      ) : (
        <View>
          {users.map((u) => (
            <View key={u.id} style={[styles2.listCard, { marginBottom: 8 }]}>
              <View style={styles.row}>
                <View>
                  <Text style={styles2.listTitle}>{u.username}</Text>
                  <Text style={styles2.listMeta}>{u.email || 'No email'}</Text>
                </View>
                <View style={{ marginLeft: 'auto' }}>
                  <View style={styles2.badge}>
                    <Text style={[styles2.badgeText, { color: '#6ee7b7' }]}>
                      {(u.role || 'inputer').toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
                {u.id !== currentUserId && (
                  <TouchableOpacity
                    style={[styles2.providerAction, { borderColor: '#f43f5e' }]}
                    onPress={() => handleDelete(u.id)}
                  >
                    <Text style={[styles2.providerActionText, { color: '#f43f5e' }]}>Delete</Text>
                  </TouchableOpacity>
                )}
                {isAdmin && (
                  <TouchableOpacity
                    style={[styles2.providerAction, { borderColor: '#6366F1' }]}
                    onPress={() => {
                      const idx = ROLES.indexOf(u.role || 'inputer');
                      const next = ROLES[(idx + 1) % ROLES.length];
                      handleRoleChange(u.id, next);
                    }}
                  >
                    <Text style={[styles2.providerActionText, { color: '#6366F1' }]}>
                      Role: {(u.role || 'inputer').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {createModal && (
        <View style={styles2.modalBackdrop}>
          <View style={styles2.modalCard}>
            <View style={styles2.modalHeader}>
              <View>
                <Text style={styles2.modalTitle}>Add New User</Text>
                <Text style={styles2.modalSubtitle}>Create a new account and send a password setup link.</Text>
              </View>
              <TouchableOpacity style={styles2.modalClose} onPress={() => setCreateModal(false)}>
                <Text style={styles2.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles2.modalForm}>
              <TextInput
                style={styles.input}
                value={newUsername}
                onChangeText={setNewUsername}
                placeholder="Username"
                placeholderTextColor="#64748b"
              />
              <TextInput
                style={styles.input}
                value={newEmail}
                onChangeText={setNewEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor="#64748b"
              />
              <Text style={styles.label}>Role</Text>
              <View style={styles2.pickerRow}>
                {ROLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles2.chip, newRole === r && styles2.chipActive]}
                    onPress={() => setNewRole(r)}
                  >
                    <Text style={[styles2.chipText, newRole === r && styles2.chipTextActive]}>
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {!!error && createModal && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            <View style={styles2.modalActions}>
              <TouchableOpacity style={styles2.modalCancel} onPress={() => setCreateModal(false)}>
                <Text style={styles2.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles2.modalConfirm, styles2.modalConfirmConnect]}
                onPress={handleCreate}
              >
                <Text style={styles2.modalConfirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}