import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('medilance_user');
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback((userData, password) => {
    localStorage.setItem('medilance_user', JSON.stringify(userData));
    if (password) sessionStorage.setItem('medilance_cred', password);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('medilance_user');
    sessionStorage.removeItem('medilance_cred');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
