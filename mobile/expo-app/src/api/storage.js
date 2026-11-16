// mobile/expo-app/src/api/storage.js
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'ea_access_token';
const USER_KEY = 'ea_user';
const PREFS_KEY = 'ea_prefs';

// SecureStore is unavailable in some web/simulator contexts; fall back to memory.
const memory = new Map();

async function hasSecureStore() {
  try {
    return Platform.OS !== 'web' && (await SecureStore.isAvailableAsync());
  } catch {
    return false;
  }
}

export async function saveSession(accessToken, user, prefs) {
  const nextPrefs = prefs === undefined ? (await loadSession().catch(() => ({})))?.prefs || null : prefs;
  if (await hasSecureStore()) {
    if (accessToken) await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    else await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user || null));
    if (nextPrefs) await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(nextPrefs));
  } else {
    if (accessToken) memory.set(ACCESS_TOKEN_KEY, accessToken);
    else memory.delete(ACCESS_TOKEN_KEY);
    memory.set(USER_KEY, JSON.stringify(user || null));
    if (nextPrefs) memory.set(PREFS_KEY, JSON.stringify(nextPrefs));
  }
}

export async function loadSession() {
  try {
    if (await hasSecureStore()) {
      const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
      const rawUser = await SecureStore.getItemAsync(USER_KEY);
      const rawPrefs = await SecureStore.getItemAsync(PREFS_KEY);
      return {
        accessToken,
        user: rawUser ? JSON.parse(rawUser) : null,
        prefs: rawPrefs ? JSON.parse(rawPrefs) : null,
      };
    }
    const accessToken = memory.get(ACCESS_TOKEN_KEY) || null;
    const rawUser = memory.get(USER_KEY);
    const rawPrefs = memory.get(PREFS_KEY);
    return {
      accessToken,
      user: rawUser ? JSON.parse(rawUser) : null,
      prefs: rawPrefs ? JSON.parse(rawPrefs) : null,
    };
  } catch {
    return { accessToken: null, user: null, prefs: null };
  }
}

export async function clearSession() {
  if (await hasSecureStore()) {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(USER_KEY).catch(() => {});
    // Keep theme prefs across sign-out; delete PREFS_KEY too if you want a full wipe.
  } else {
    memory.delete(ACCESS_TOKEN_KEY);
    memory.delete(USER_KEY);
  }
}
