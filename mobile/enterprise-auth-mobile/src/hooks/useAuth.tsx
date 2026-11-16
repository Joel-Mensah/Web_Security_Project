import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { api } from '../services/api';

type Role = 'inputer' | 'manager' | 'admin' | 'administrator';

interface User {
  id: string;
  username: string;
  role: Role;
  email?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        // In production, this would be a session check via Supabase or a protected API endpoint
        const token = localStorage.getItem('ea_token');
        if (token) {
          // For demo, we'll verify via the auth/me endpoint
          const res = await api.getCurrentUser(token);
          setUser({ id: res.id, username: res.username, role: res.role, email: res.email });
        }
      } catch (err) {
        localStorage.removeItem('ea_token');
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.login({ username, password });
    // If 2FA is required, the app will show the 2FA modal
    if (res.pendingToken) {
      localStorage.setItem('ea_token', res.pendingToken);
      // In a full implementation, we'd track the pending 2FA state
    }
    // Fetch user info
    const userRes = await api.getCurrentUser(res.pendingToken);
    setUser({ id: userRes.id, username: userRes.username, role: userRes.role, email: userRes.email });
  };

  const logout = async () => {
    try {
      await api.getCurrentUser(''); // This would be a logout endpoint in a full implementation
    } catch (e) {
      // Ignore errors on logout
    }
    localStorage.removeItem('ea_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
