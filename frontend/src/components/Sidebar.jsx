// src/components/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ScrollText, LogOut, Shield, ChevronLeft, ChevronRight, AlertTriangle,
  Menu, X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const ROLE_COLORS = {
  inputer:       'bg-slate-500/20 text-slate-300',
  manager:       'bg-blue-500/20 text-blue-300',
  admin:         'bg-amber-500/20 text-amber-300',
  administrator: 'bg-emerald-500/20 text-emerald-400',
};

const ROLE_LABELS = {
  inputer:       'Inputer',
  manager:       'Manager',
  admin:         'Admin',
  administrator: 'Administrator',
};

const localSyncEnabled = import.meta.env.VITE_LOCAL_SYNC_ENABLED !== 'false';

export default function Sidebar() {
  const { user, logout, hasRole } = useAuth();
  const navigate                  = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard',       always: true },
    { to: '/users',           icon: Users,            label: 'User Management', roles: ['manager', 'admin', 'administrator'] },
    { to: '/audit',           icon: ScrollText,       label: 'Audit Logs',      roles: ['administrator'] },
    ...(localSyncEnabled
      ? [{ to: '/sync-conflicts', icon: AlertTriangle, label: 'Sync Conflicts', roles: ['administrator'] }]
      : []),
  ].filter(item => item.always || hasRole(...(item.roles || [])));

  const handleLogout = async () => {
    await logout();
    setMobileOpen(false);
    navigate('/login');
  };

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/5 bg-navy-950/90 px-4 py-3 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="truncate font-bold tracking-tight text-white">EnterpriseAuth</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(open => !open)}
          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-white/5 bg-navy-950 shadow-2xl transition-transform duration-300 md:sticky md:top-0 md:z-auto md:h-screen md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none ${collapsed ? 'md:w-16' : 'md:w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:flex`}>
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          {!collapsed && <span className="truncate font-bold tracking-tight text-white">EnterpriseAuth</span>}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white md:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(value => !value)}
            className="ml-auto hidden text-slate-500 transition-colors hover:text-white md:block"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'md:justify-center md:px-2' : ''}`
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-white/5 p-3">
          {user && (
            <div className={`px-2 py-2 ${collapsed ? 'md:hidden' : ''}`}>
              <p className="truncate text-sm font-medium text-white">{user.username}</p>
              <span className={`role-badge mt-1 ${ROLE_COLORS[user.role] || 'bg-slate-500/20 text-slate-300'}`}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className={`nav-item w-full hover:bg-red-500/10 hover:text-red-400 ${collapsed ? 'md:justify-center md:px-2' : ''}`}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={collapsed ? 'md:hidden' : ''}>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
