// src/App.jsx — Router configuration
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute  from './components/ProtectedRoute';
import Sidebar         from './components/Sidebar';
import LoginPage       from './pages/LoginPage';
import DashboardPage   from './pages/DashboardPage';
import UserManagementPage from './pages/UserManagementPage';
import AuditLogsPage from './pages/AuditLogsPage';
import SetupPasswordPage from './pages/SetupPasswordPage';
import IncidentsPage from './pages/IncidentsPage';
import SystemOperationsPage from './pages/SystemOperationsPage';
import IntegrationsPage from './pages/IntegrationsPage';
import HelpBot from './components/HelpBot';

// Layout wrapper for authenticated pages
function AppLayout() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <Sidebar />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <HelpBot />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup-password" element={<SetupPasswordPage />} />

          {/* Protected layout */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/incidents" element={<IncidentsPage />} />
            <Route path="/incidents/:id" element={<IncidentsPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route
              path="/system"
              element={
                <ProtectedRoute roles={['administrator']}>
                  <SystemOperationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/audit"
              element={
                <ProtectedRoute roles={['administrator']}>
                  <AuditLogsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute roles={['manager', 'admin', 'administrator']}>
                  <UserManagementPage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
