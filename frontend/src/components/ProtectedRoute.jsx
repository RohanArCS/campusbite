import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ROLE_HOME, useAuth } from '../context/AuthContext.jsx';

/**
 * Guards a group of routes. Unauthenticated users go to /login (and come back afterwards);
 * users with the wrong role are sent to their own home page.
 * NOTE: this is UX only - the backend enforces the same rules on every API call.
 */
export default function ProtectedRoute({ roles }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role] || '/'} replace />;
  }
  return <Outlet />;
}
