import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import api from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('smartship_user')) || null;
    } catch {
      return null;
    }
  });

  const persist = (token, u) => {
    localStorage.setItem('smartship_token', token);
    localStorage.setItem('smartship_user', JSON.stringify(u));
    setUser(u);
  };

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    persist(data.token, data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    persist(data.token, data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('smartship_token');
    localStorage.removeItem('smartship_user');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      login,
      register,
      logout,
      hasRole: (...roles) => !!user && roles.includes(user.role),
      can: {
        manageShipments: !!user && ['Admin', 'Dispatcher', 'Operations'].includes(user.role),
        deleteShipments: !!user && user.role === 'Admin',
        moderateExceptions: !!user && ['Supervisor', 'Admin', 'Operations'].includes(user.role),
        escalate: !!user && ['Dispatcher', 'Supervisor', 'Admin'].includes(user.role),
        resolve: !!user && ['Supervisor', 'Operations', 'Admin'].includes(user.role),
        manageUsers: !!user && user.role === 'Admin',
      },
    }),
    [user, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
