// mobile/expo-app/src/api/client.js
// Fetch-based API client wired to the same Express backend as the web frontend.
// Expo Go on a phone cannot reach localhost, so we default to the LAN IP.
import Constants from 'expo-constants';
import { MaterialCommunityIcons } from '@expo/vector-icons';

function resolveBaseUrl() {
  const fromExtra = Constants?.expoConfig?.extra?.apiUrl;
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  // Your PC LAN IP from ipconfig — phone + PC must be on the same Wi-Fi.
  return fromEnv || fromExtra || 'http://10.118.223.84:5000/api';
}

export const API_BASE_URL = resolveBaseUrl();

async function parseBody(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function apiRequest(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parseBody(res);
  if (!res.ok) {
    const message =
      data?.message ||
      (Array.isArray(data?.errors) && data.errors[0]?.msg) ||
      `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const authApi = {
  login: (username, password) =>
    apiRequest('/auth/login', { method: 'POST', body: { username, password } }),
  setup2fa: (pendingToken) =>
    apiRequest('/auth/setup-2fa', { method: 'POST', token: pendingToken, body: {} }),
  verify2fa: (pendingToken, token) =>
    apiRequest('/auth/verify-2fa', { method: 'POST', token: pendingToken, body: { token } }),
  sendEmailOtp: (pendingToken) =>
    apiRequest('/auth/send-email-otp', { method: 'POST', token: pendingToken, body: {} }),
  verifyEmailOtp: (pendingToken, token) =>
    apiRequest('/auth/verify-email-otp', { method: 'POST', token: pendingToken, body: { token } }),
  requestPasswordReset: (username) =>
    apiRequest('/auth/request-password-reset', { method: 'POST', body: { username } }),
  resetPassword: (username, token, password) =>
    apiRequest('/auth/reset-password', {
      method: 'POST',
      body: { username, token, password },
    }),
  me: (accessToken) => apiRequest('/auth/me', { token: accessToken }),
  logout: (accessToken) =>
    apiRequest('/auth/logout', { method: 'POST', token: accessToken, body: {} }).catch(() => ({})),
};

export const incidentsApi = {
  summary: (accessToken) => apiRequest('/incidents/summary', { token: accessToken }),
  list: (accessToken, params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return apiRequest(`/incidents${query ? `?${query}` : ''}`, { token: accessToken });
  },
  detail: (accessToken, id) => apiRequest(`/incidents/${id}`, { token: accessToken }),
  create: (accessToken, payload) =>
    apiRequest('/incidents', { method: 'POST', token: accessToken, body: payload }),
  comment: (accessToken, id, message, internal = false) =>
    apiRequest(`/incidents/${id}/updates`, {
      method: 'POST',
      token: accessToken,
      body: { message, internal },
    }),
};

export const linkedAccountsApi = {
  list: (accessToken) => apiRequest('/users/me/linked-accounts', { token: accessToken }),
  connect: (accessToken, provider, payload = {}) =>
    apiRequest(`/users/me/linked-accounts/connect/${provider}`, {
      method: 'POST',
      token: accessToken,
      body: payload,
    }),
  disconnect: (accessToken, id, confirmLastMethod = false) =>
    apiRequest(`/users/me/linked-accounts/${id}`, {
      method: 'DELETE',
      token: accessToken,
      body: { confirmLastMethod },
    }),
};

export const CATEGORIES = [
  ['suspicious_email', 'Suspicious email or message'],
  ['account_compromise', 'Possible account compromise'],
  ['lost_device', 'Lost or stolen device'],
  ['data_exposure', 'Data exposure'],
  ['malware', 'Malware or suspicious software'],
  ['policy_violation', 'Security policy concern'],
  ['other', 'Other security concern'],
];

export const SEVERITIES = ['low', 'medium', 'high', 'critical'];
export const STATUSES = ['new', 'triaged', 'in_progress', 'resolved', 'closed'];

// ─── Provider cards with correct brand logos (SVG-style icons) ─────────────
// Each card now carries an icon component from @expo/vector-icons
// so the Integration Center renders the actual brand mark instead of an emoji.
const iconMap = {
  google: MaterialCommunityIcons.Google,
  github: MaterialCommunityIcons.GitHub,
  microsoft: MaterialCommunityIcons.Microsoft,
  slack: MaterialCommunityIcons.Slack,
  custom_saml: MaterialCommunityIcons.KeyLock,
};

export const PROVIDER_CARDS = [
  {
    id: 'google',
    name: 'Google',
    blurb: 'Sign in with Google and sync your workspace identity.',
    logo: '🅶',
    icon: iconMap.google,
    gradient: ['#EA4335', '#FBBC05', '#4285F4'], // red → yellow → blue
  },
  {
    id: 'github',
    name: 'GitHub',
    blurb: 'Link repos and developer identity for security reviews.',
    logo: '🐙',
    icon: iconMap.github,
    gradient: ['#24292E', '#2F363D', '#171A21'], // dark slate gradient
  },
  {
    id: 'microsoft',
    name: 'Microsoft 365',
    blurb: 'Connect Entra ID for corporate single sign-on.',
    logo: '🪟',
    icon: iconMap.microsoft,
    gradient: ['#00A4EF', '#0078D4', '#005A9E'], // sky blue gradient
  },
  {
    id: 'slack',
    name: 'Slack',
    blurb: 'Get incident alerts in your security channel.',
    logo: '💬',
    icon: iconMap.slack,
    gradient: ['#E01E5A', '#36C5F0', '#3AA4E9'], // red → cyan → blue
  },
  {
    id: 'custom_saml',
    name: 'Enterprise SSO / SAML',
    blurb: 'Custom SAML identity provider for regulated tenants.',
    logo: '🔐',
    icon: iconMap.custom_saml,
    gradient: ['#6366F1', '#8B5CF6', '#06B6D4'], // indigo → violet → cyan
  },
];

// ─── System API (administrator) ─────────────────────────────────────────────
export const systemApi = {
  listBackups: (accessToken) => apiRequest('/system/backups', { token: accessToken }),
  createBackup: (accessToken) =>
    apiRequest('/system/backups', { method: 'POST', token: accessToken }),
  listRestorePoints: (accessToken) =>
    apiRequest('/system/restore-points', { token: accessToken }),
  createRestorePoint: (accessToken, commitSha) =>
    apiRequest('/system/restore-points', {
      method: 'POST',
      token: accessToken,
      body: { commitSha },
    }),
};

// ─── Users API (manager+ / administrator) ───────────────────────────────────
export const usersApi = {
  list: (accessToken, params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return apiRequest(`/users${query ? `?${query}` : ''}`, { token: accessToken });
  },
  get: (accessToken, id) => apiRequest(`/users/${id}`, { token: accessToken }),
  create: (accessToken, payload) =>
    apiRequest('/users', { method: 'POST', token: accessToken, body: payload }),
  delete: (accessToken, id) =>
    apiRequest(`/users/${id}`, { method: 'DELETE', token: accessToken }),
  changeRole: (accessToken, id, role) =>
    apiRequest(`/users/${id}/role`, { method: 'PATCH', token: accessToken, body: { role } }),
  auditLogs: (accessToken, params = {}) => {
    const query = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
    ).toString();
    return apiRequest(`/users/logs/audit${query ? `?${query}` : ''}`, { token: accessToken });
  },
};
