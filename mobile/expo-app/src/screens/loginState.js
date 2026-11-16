// mobile/expo-app/src/screens/loginState.js
// Shared login flow helpers mirroring frontend/src/pages/LoginPage.jsx
import { authApi } from '../api/client';

export async function startLogin(username, password) {
  const data = await authApi.login(username.trim().toLowerCase(), password);
  if (data.requires2FASetup) {
    const qr = await authApi.setup2fa(data.pendingToken);
    return { pendingToken: data.pendingToken, next: 'qr-setup', qr };
  }
  return { pendingToken: data.pendingToken, next: 'totp', qr: null };
}

export function onlyDigits(value, max = 6) {
  return String(value || '').replace(/\D/g, '').slice(0, max);
}
