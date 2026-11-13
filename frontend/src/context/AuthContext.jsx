import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, TOKEN_KEY, USER_KEY } from '../api/client.js';

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => (localStorage.getItem(TOKEN_KEY) ? readStoredUser() : null));

  const persist = useCallback((data) => {
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email, password) => persist(await authApi.login(email, password)), [persist]);
  const register = useCallback(async (payload) => persist(await authApi.register(payload)), [persist]);

  const updateUser = useCallback((nextUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  // Log out automatically if any API call reports the token is invalid/expired.
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('campusbite:unauthorized', handler);
    return () => window.removeEventListener('campusbite:unauthorized', handler);
  }, [logout]);

  // Re-validate the stored token once on load.
  useEffect(() => {
    if (!token) return;
    authApi.me().then(updateUser).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({ user, token, isAuthenticated: Boolean(token && user), login, register, logout, updateUser }),
    [user, token, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const ROLE_HOME = {
  customer: '/restaurants',
  restaurant_owner: '/owner',
  delivery_partner: '/delivery',
};

export const ROLE_LABEL = {
  customer: 'Customer',
  restaurant_owner: 'Restaurant Owner',
  delivery_partner: 'Delivery Partner',
};
