import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { deleteToken, extractAuthToken, getToken, saveToken } from '../services/api';
import type { User } from '../types/models';

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: User | null;
  signIn: (token: unknown, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      try {
        const storedToken = await getToken();
        setToken(storedToken);
      } catch {
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, []);

  const signIn = useCallback(async (nextToken: unknown, nextUser: User) => {
    const tokenValue =
      typeof nextToken === 'string' && nextToken.trim().length > 0
        ? nextToken.trim()
        : extractAuthToken(nextToken);

    if (!tokenValue) {
      throw new Error('Token must be a string or an object containing a token');
    }

    await saveToken(tokenValue);
    setToken(String(tokenValue));
    setUser(nextUser);
  }, []);

  const signOut = useCallback(async () => {
    await deleteToken();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: Boolean(token),
      user,
      signIn,
      signOut,
      setUser,
    }),
    [isLoading, token, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
