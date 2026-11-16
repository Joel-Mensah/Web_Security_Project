// mobile/expo-app/src/context/AuthContext.js
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/client';
import { clearSession, loadSession, saveSession } from '../api/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const session = await loadSession();
      if (session?.accessToken) {
        try {
          // Validate stored JWT against the backend before trusting it.
          const profile = await authApi.me(session.accessToken);
          setUser(profile);
          setAccessToken(session.accessToken);
        } catch {
          await clearSession();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async ({ accessToken: token, user: userData }) => {
    let profile = userData;
    try {
      // /auth/me returns the full profile row (id, username, email, role, mfa_enabled).
      profile = await authApi.me(token);
    } catch {
      // Fall back to the smaller user object from verify-2fa.
    }
    await saveSession(token, profile);
    setAccessToken(token);
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    if (accessToken) await authApi.logout(accessToken);
    await clearSession();
    setAccessToken(null);
    setUser(null);
  }, [accessToken]);

  const hasRole = useCallback(
    (...roles) => {
      if (!user?.role) return false;
      return roles.map((r) => r.toLowerCase()).includes(String(user.role).toLowerCase());
    },
    [user]
  );

  const value = useMemo(
    () => ({ user, accessToken, loading, login, logout, hasRole }),
    [user, accessToken, loading, login, logout, hasRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
