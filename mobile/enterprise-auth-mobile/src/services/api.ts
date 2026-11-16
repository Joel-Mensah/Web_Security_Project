// API base URL resolution:
// - Web dev: the Vite proxy forwards /api to http://localhost:5000 (see vite.config.ts)
// - Native builds: set VITE_API_URL to the absolute backend URL at build time,
//   for example https://<cloudfront-domain>.cloudfront.net/api
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  pendingToken: string;
  requires2FASetup: boolean;
  requires2FA: boolean;
  message?: string;
}

export interface User {
  id: string;
  username: string;
  role: string;
  email: string;
}

export class ApiClient {
  private base = API_BASE;

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const res = await fetch(`${this.base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(err.message || 'Login failed');
    }
    return res.json();
  }

  async requestPasswordReset(username: string): Promise<{ message: string }> {
    const res = await fetch(`${this.base}/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to request reset' }));
      throw new Error(err.message || 'Failed to request reset');
    }
    return res.json();
  }

  async resetPassword({ username, token, password }: { username: string; token: string; password: string }): Promise<{ message: string }> {
    const res = await fetch(`${this.base}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, token, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Reset failed' }));
      throw new Error(err.message || 'Reset failed');
    }
    return res.json();
  }

  async setup2FA(pendingToken: string) {
    const res = await fetch(`${this.base}/auth/setup-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to setup 2FA' }));
      throw new Error(err.message || 'Failed to setup 2FA');
    }
    return res.json();
  }

  async verify2FA(pendingToken: string, token: string) {
    const res = await fetch(`${this.base}/auth/verify-2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Invalid 2FA code' }));
      throw new Error(err.message || 'Invalid 2FA code');
    }
    return res.json();
  }

  async getCurrentUser(pendingToken: string) {
    const res = await fetch(`${this.base}/auth/me`, {
      headers: { Authorization: `Bearer ${pendingToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to fetch user' }));
      throw new Error(err.message || 'Failed to fetch user');
    }
    return res.json();
  }

  async getIncidents(pendingToken: string, params: Record<string, string> = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${this.base}/incidents?${query}`, {
      headers: { Authorization: `Bearer ${pendingToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to fetch incidents' }));
      throw new Error(err.message || 'Failed to fetch incidents');
    }
    return res.json();
  }

  async createIncident(pendingToken: string, incident: { title: string; category: string; severity: string; description: string }) {
    const res = await fetch(`${this.base}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
      body: JSON.stringify(incident),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to create incident' }));
      throw new Error(err.message || 'Failed to create incident');
    }
    return res.json();
  }

  async getUsers(pendingToken: string) {
    const res = await fetch(`${this.base}/users`, {
      headers: { Authorization: `Bearer ${pendingToken}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Failed to fetch users' }));
      throw new Error(err.message || 'Failed to fetch users');
    }
    return res.json();
  }
}

export const api = new ApiClient();
