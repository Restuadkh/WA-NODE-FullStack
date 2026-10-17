import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearSession, getStoredUser, getToken, saveSession, setUnauthorizedHandler } from "./api";
import { closeSocket } from "./socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null));

  const logout = useCallback(() => {
    closeSocket();
    clearSession();
    setUser(null);
  }, []);

  // Token kedaluwarsa / tidak valid -> otomatis keluar
  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    saveSession(res.token, res.user);
    setUser(res.user);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
