import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('medilance_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('medilance_token') || null;
  });

  const login = useCallback((userData, authToken) => {
    localStorage.setItem('medilance_user', JSON.stringify(userData));
    if (authToken) {
      localStorage.setItem('medilance_token', authToken);
      setToken(authToken);
    }
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('medilance_user');
    localStorage.removeItem('medilance_token');
    sessionStorage.removeItem('medilance_cred');
    setUser(null);
    setToken(null);
  }, []);

  const getAuthHeaders = useCallback((customHeaders = {}) => {
    const headers = { ...customHeaders };
    const currentToken = token || localStorage.getItem('medilance_token');
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }
    if (user?.username) {
      headers['x-username'] = user.username;
      if (user.isMasterAdmin) {
        headers['x-admin-user'] = user.username;
      }
    }
    return headers;
  }, [token, user]);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, getAuthHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
