import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearToken,
  getMe,
  getToken,
  login as apiLogin,
  register as apiRegister,
  setToken,
  verifyLoginOtp as apiVerifyLoginOtp,
  resendLoginOtp as apiResendLoginOtp,
} from '../api/client';
import type { LoginChallengeResponse, User } from '../types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<User | LoginChallengeResponse>;
  verifyLoginOtp: (challengeToken: string, code: string) => Promise<User>;
  resendLoginOtp: (challengeToken: string) => Promise<LoginChallengeResponse>;
  register: (
    name: string,
    email: string,
    phone: string,
    password: string,
  ) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const profile = await getMe();
      setUser(profile);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin({ email, password });
    if ('login_challenge_token' in response) {
      return response;
    }
    setToken(response.access_token);
    setUser(response.user);
    return response.user;
  }, []);

  const verifyLoginOtp = useCallback(
    async (challengeToken: string, code: string) => {
      const response = await apiVerifyLoginOtp({
        login_challenge_token: challengeToken,
        code,
      });
      setToken(response.access_token);
      setUser(response.user);
      return response.user;
    },
    [],
  );

  const resendLoginOtp = useCallback(async (challengeToken: string) => {
    return apiResendLoginOtp({ login_challenge_token: challengeToken });
  }, []);

  const register = useCallback(
    async (
      name: string,
      email: string,
      phone: string,
      password: string,
    ) => {
      const response = await apiRegister({ name, email, phone, password });
      setToken(response.access_token);
      setUser(response.user);
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      verifyLoginOtp,
      resendLoginOtp,
      register,
      logout,
      refresh,
    }),
    [
      user,
      loading,
      login,
      verifyLoginOtp,
      resendLoginOtp,
      register,
      logout,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return context;
}
