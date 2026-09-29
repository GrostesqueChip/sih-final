import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../hooks/useApi';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('nawi_auth_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => localStorage.getItem('nawi_auth_token') || null);
  const [isLoading, setIsLoading] = useState(true);

  // Validate session on mount
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('nawi_auth_token');
      if (storedToken) {
        try {
          // Optionally verify token or user profile
          const res = await apiClient.get('/auth/me').catch(() => null);
          if (res && res.data && res.data.user) {
            setUser(res.data.user);
            localStorage.setItem('nawi_auth_user', JSON.stringify(res.data.user));
          }
        } catch {
          // If verifying fails, keep local user or let interceptor handle 401
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = useCallback(async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    const { token: jwtToken, user: authUser } = response.data;

    setToken(jwtToken);
    setUser(authUser);
    localStorage.setItem('nawi_auth_token', jwtToken);
    localStorage.setItem('nawi_auth_user', JSON.stringify(authUser));

    return authUser;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('nawi_auth_token');
    localStorage.removeItem('nawi_auth_user');
    window.location.href = '/login';
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isInspector = user?.role === 'INSPECTOR' || user?.role === 'ADMIN';
  const isViewer = user?.role === 'VIEWER';

  const value = {
    user,
    token,
    isAuthenticated: !!token && !!user,
    isLoading,
    isAdmin,
    isInspector,
    isViewer,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
