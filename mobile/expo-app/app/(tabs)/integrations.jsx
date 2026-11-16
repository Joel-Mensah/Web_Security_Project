// mobile/expo-app/app/(tabs)/integrations.jsx — Integration Center (Link This Site)
// Full parity with web frontend: brand logo cards, connect modal, refresh button,
// notice/error banners, OAuth connectUrl support.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import {
  linkedAccountsApi,
  PROVIDER_CARDS,
} from '../../src/api/client';
import { useAuth } from '../../src/context/AuthContext';
import { styles } from '../../src/theme/styles';
import { styles2 } from '../../src/theme/styles2';

export default function IntegrationsScreen() {
  const { accessToken } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    providerEmail: '',
    providerAccountId: '',
    displayName: '',
    code: '',
  });
  const [confirmLast, setConfirmLast] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const data = await linkedAccountsApi.list(accessToken);
      setAccounts(data.accounts || []);
    } catch (err) {
      setError(err.message || 'Could not load integrations.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  const handleConnect = (card) => {
    setTarget({ card, account: null, mode: 'connect' });
    setForm({ providerEmail: '', providerAccountId: '', displayName: '', code: '' });
    setError('');
  };

  const handleDisconnect = (account) => {
    const card = PROVIDER_CARDS.find((c) => c.id === account.provider);
    setTarget({ card, account, mode: 'disconnect' });
  };

  const confirm = async (payload) => {
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      if (target.mode === 'connect') {
        const body = {
          providerEmail: payload.providerEmail || undefined,
          providerAccountId: payload.providerAccountId || undefined,
          displayName: payload.displayName || undefined,
          code: payload.code || undefined,
          accessToken: payload.code ? undefined : `mobile-${Date.now()}`,
        };
        const init = await linkedAccountsApi.connect(accessToken, target.card.id, body);
        if (init?.connectUrl) {
          await WebBrowser.openBrowserAsync(init.connectUrl);
          setNotice(`${target.card.name}: complete the provider sign-in in the browser, then return here.`);
        } else {
          setNotice(`${target.card.name} connected.`);
        }
      } else {
        await linkedAccountsApi.disconnect(accessToken, target.account.id, !!payload.confirmLastMethod);
        setNotice(`${target.card.name} disconnected.`);
      }
      setTarget(null);
      await load();
    } catch (err) {
      setError(err.message || 'Request failed.');
    } finally {
      setSaving(false);
    }
  };

  const renderStatus = (account) => {
    const connected = !!account;
    return (
      <View style={styles2.integrationStatus}>
        {connected ? (
          <View style={styles2.statusConnected}>
            <Text style={styles2.statusConnectedText}>✓ Connected</Text>
            <Text style={styles2.statusDetail}>
              {account.providerEmail || account.providerAccountId}
            </Text>
          </View>
        ) : (
          <View style={styles2.statusDisconnected}>
            <Text style={styles2.statusDisconnectedText}>○ Not connected</Text>
          </View>
        )}
      </View>
    );
  };

  const renderLogo = (card) => {
    const { icon: Icon, gradient } = card;
    return (
      <View style={[styles2.providerLogo, { backgroundColor: gradient[0] }]}>
        <Icon style={styles2.providerLogoIcon} size={28} color="#fff" />
      </View>
    );
  };

  return (
    <>
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
      <View style={styles2.integrationsHeader}>
        <View>
          <Text style={styles2.headerTitle}>Integration Center</Text>
          <Text style={styles2.headerMeta}>
            Link this site to Google, GitHub, Microsoft 365, Slack, or Enterprise SSO. Tokens are encrypted at rest.
          </Text>
        </View>
        <TouchableOpacity style={styles2.refreshButton} onPress={load} disabled={loading}>
          <ActivityIndicator size="small" color="#6366F1" style={{ marginRight: 6 }} animating={loading} />
          <Text style={styles2.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {notice && (
        <View style={styles2.noticeBox}>
          <Text style={styles2.noticeText}>{notice}</Text>
        </View>
      )}
      {error && !target && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#10b981" />
      ) : (
        <View style={styles2.providerGrid}>
          {PROVIDER_CARDS.map((card) => {
            const account = accounts.find((a) => a.provider === card.id);
            const connected = !!account;
            return (
              <TouchableOpacity key={card.id} style={styles2.providerCard} onPress={() => connected ? handleDisconnect(account) : handleConnect(card)}>
                {renderLogo(card)}
                <Text style={styles2.providerName}>{card.name}</Text>
                <Text style={styles2.providerBlurb}>{card.blurb}</Text>
                {renderStatus(account)}
                <TouchableOpacity style={[styles2.providerAction, connected && styles2.providerActionDisconnect]} onPress={(e) => { e.stopPropagation(); connected ? handleDisconnect(account) : handleConnect(card); }}>
                  <Text style={styles2.providerActionText}>{connected ? 'Disconnect' : 'Connect'}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {target && target.mode === 'connect' && (
        <Modal visible transparent onRequestClose={() => setTarget(null)}>
          <View style={styles2.modalBackdrop}>
            <View style={styles2.modalCard}>
              <View style={styles2.modalHeader}>
                <View>
                  <Text style={styles2.modalTitle}>Connect {target.card.name}</Text>
                  <Text style={styles2.modalSubtitle}>Paste the account details from the provider. Tokens are AES-256-GCM encrypted at rest.</Text>
                </View>
                <TouchableOpacity style={styles2.modalClose} onPress={() => setTarget(null)}>
                  <Text style={styles2.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles2.modalForm}>
                <TextInput style={styles.input} value={form.providerEmail} onChangeText={(v) => setForm({ ...form, providerEmail: v })} autoCapitalize="none" keyboardType="email-address" placeholder="Provider email (optional)" placeholderTextColor="#64748b" />
                <TextInput style={styles.input} value={form.providerAccountId} onChangeText={(v) => setForm({ ...form, providerAccountId: v })} placeholder="Provider account ID (optional)" placeholderTextColor="#64748b" />
                <TextInput style={styles.input} value={form.displayName} onChangeText={(v) => setForm({ ...form, displayName: v })} placeholder="Display name (optional)" placeholderTextColor="#64748b" />
                <TextInput style={styles.input} value={form.code} onChangeText={(v) => setForm({ ...form, code: v })} placeholder="OAuth code (optional)" placeholderTextColor="#64748b" />
              </View>
              {!!error && target && target.mode === 'connect' && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              <View style={styles2.modalActions}>
                <TouchableOpacity style={styles2.modalCancel} onPress={() => setTarget(null)}>
                  <Text style={styles2.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles2.modalConfirm, styles2.modalConfirmConnect]} disabled={saving} onPress={() => confirm(form)}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles2.modalConfirmText}>Connect</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {target && target.mode === 'disconnect' && (
        <Modal visible transparent onRequestClose={() => setTarget(null)}>
          <View style={styles2.modalBackdrop}>
            <View style={styles2.modalCard}>
              <View style={styles2.modalHeader}>
                <View>
                  <Text style={styles2.modalTitle}>Disconnect {target.card.name}</Text>
                  <Text style={styles2.modalSubtitle}>Signed in as {target.account.providerEmail || target.account.providerAccountId}. This revokes stored tokens immediately.</Text>
                </View>
                <TouchableOpacity style={styles2.modalClose} onPress={() => setTarget(null)}>
                  <Text style={styles2.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={styles2.confirmLastRow}>
                <TouchableOpacity style={styles2.confirmLastCheckbox} onPress={() => setConfirmLast((v) => !v)}>
                  <Text style={styles2.confirmLastCheckboxText}>{confirmLast ? '☑' : '☐'}</Text>
                  <Text style={styles2.confirmLastLabel}>If this is my last sign-in method, I confirm I re-authenticated with fresh 2FA.</Text>
                </TouchableOpacity>
              </View>
              {!!error && target && target.mode === 'disconnect' && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              <View style={styles2.modalActions}>
                <TouchableOpacity style={styles2.modalCancel} onPress={() => setTarget(null)}>
                  <Text style={styles2.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles2.modalConfirm, styles2.modalConfirmDisconnect]} disabled={saving} onPress={() => confirm({ confirmLastMethod: confirmLast })}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles2.modalConfirmText}>Disconnect</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
    </>
  );
}