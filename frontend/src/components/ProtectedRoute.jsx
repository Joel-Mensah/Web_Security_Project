// src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * @param {string[]} [roles] - If provided, user must have one of these roles
 */
export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (roles?.length && !roles.map(r => r.toLowerCase()).includes(user.role?.toLowerCase())) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
