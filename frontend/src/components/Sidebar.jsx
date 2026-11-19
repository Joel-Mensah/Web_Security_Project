// src/components/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ScrollText, LogOut, Shield, ChevronLeft, ChevronRight,
  ClipboardList, Plug2,
  Menu, X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from './ThemeToggle';

const ROLE_COLORS = {
  inputer:       'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300',
  manager:       'bg-blue-50 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
  admin:         'bg-amber-50 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  administrator: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400',
};

const ROLE_LABELS = {
  inputer:       'Inputer',
  manager:       'Manager',
  admin:         'Admin',
  administrator: 'Administrator',
};

export default function Sidebar() {
  const { user, logout, hasRole } = useAuth();
  const navigate                  = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { to: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard',       always: true },
    { to: '/incidents',       icon: ClipboardList,    label: 'Incident reports', always: true },
    { to: '/integrations',    icon: Plug2,            label: 'Integrations',   always: true },
    { to: '/users',           icon: Users,            label: 'User Management', roles: ['manager', 'admin', 'administrator'] },
    { to: '/audit',           icon: ScrollText,       label: 'Audit Logs',      roles: ['administrator'] },
    { to: '/system',          icon: Shield,            label: 'System operations', roles: ['administrator'] },
  ].filter(item => item.always || hasRole(...(item.roles || [])));

  const handleLogout = async () => {
    await logout();
    setMobileOpen(false);
    navigate('/login');
  };

  return (
    <>
      <header className="flex items-center justify-between border-b border-black/5 bg-white/90 px-4 py-3 dark:border-white/5 dark:bg-navy-950/90 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          <span className="truncate font-bold tracking-tight text-slate-900 dark:text-white">EnterpriseAuth</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle compact />
          <button
            type="button"
            onClick={() => setMobileOpen(open => !open)}
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 dark:border-white/5 dark:bg-navy-950 md:sticky md:top-0 md:z-auto md:h-screen md:max-w-none md:shrink-0 md:translate-x-0 md:shadow-none ${collapsed ? 'md:w-16' : 'md:w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:flex`}
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-5">
          {/* Jewel logo badge */}
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(5,150,105,0.1) 100%)',
              border: '1px solid rgba(16,185,129,0.4)',
              boxShadow: '0 0 16px rgba(16,185,129,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}
          >
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          {!collapsed && (
            <span className="truncate font-bold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-500 bg-clip-text text-transparent">
              EnterpriseAuth
            </span>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
          className="ml-auto rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white md:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(value => !value)}
            className="ml-auto hidden text-slate-500 transition-colors hover:text-slate-900 dark:hover:text-white md:block"
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
                `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'md:justify-center md:px-2' : ''} glamour-card-hover relative`
              }
              title={collapsed ? label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={collapsed ? 'md:hidden' : ''}>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-black/5 p-3 dark:border-white/5">
          {!collapsed && (
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Theme</span>
              <ThemeToggle compact />
            </div>
          )}
          {collapsed && (
            <div className="hidden justify-center md:flex">
              <ThemeToggle compact />
            </div>
          )}
          {user && (
            <div className={`px-2 py-2 ${collapsed ? 'md:hidden' : ''}`}>
              <p className="truncate text-sm font-medium text-white">{user.username}</p>
              {/* Role badge with glow */}
              <span
                className={`role-badge mt-1 ${ROLE_COLORS[user.role] || 'bg-slate-500/20 text-slate-300'}`}
                style={{ boxShadow: '0 0 8px rgba(16,185,129,0.15)' }}
              >
                {ROLE_LABELS[user.role] || user.role}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className={`nav-item w-full hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10 dark:hover:text-red-400 ${collapsed ? 'md:justify-center md:px-2' : ''}`}
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
