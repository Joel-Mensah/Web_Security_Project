// src/components/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ScrollText, LogOut, Shield, ChevronLeft, ChevronRight,
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

export default function Sidebar() {
  const { user, logout, hasRole } = useAuth();
  const navigate                  = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = [
    { to: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard',       always: true },
    { to: '/users',           icon: Users,            label: 'User Management', roles: ['manager', 'admin', 'administrator'] },
    { to: '/audit',           icon: ScrollText,       label: 'Audit Logs',      roles: ['administrator'] },
  ].filter(item => item.always || hasRole(...(item.roles || [])));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className={`flex flex-col bg-navy-950/80 backdrop-blur-md border-r border-white/5 h-screen sticky top-0 transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
        <div className="flex-shrink-0 w-8 h-8 bg-emerald-500/20 rounded-xl flex items-center justify-center">
          <Shield className="w-4 h-4 text-emerald-400" />
        </div>
        {!collapsed && <span className="font-bold text-white tracking-tight">EnterpriseAuth</span>}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="ml-auto text-slate-500 hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-2' : ''}`
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-white/5 p-3 space-y-2">
        {!collapsed && user && (
          <div className="px-2 py-2">
            <p className="text-sm font-medium text-white truncate">{user.username}</p>
            <span className={`role-badge mt-1 ${ROLE_COLORS[user.role] || 'bg-slate-500/20 text-slate-300'}`}>
              {ROLE_LABELS[user.role] || user.role}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={`nav-item w-full ${collapsed ? 'justify-center px-2' : ''} hover:bg-red-500/10 hover:text-red-400`}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
