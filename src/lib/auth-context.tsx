import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiError } from '@/lib/api';
import {
  fetchUser,
  loginRequest,
  logoutRequest,
  registerRequest,
  type LoginInput,
  type RegisterInput,
  type User,
} from '@/lib/auth';
import { clearToken, loadToken, saveToken } from '@/lib/token-storage';

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** True until the stored token has been read and checked on launch. */
  isRestoring: boolean;
  register: (input: RegisterInput) => Promise<void>;
  /**
   * `remember` decides how long the session outlives the app, not how strong it
   * is. False keeps the token in memory alone: it works until the process ends,
   * and the next launch starts at the sign-in screen.
   */
  login: (input: LoginInput, remember?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Re-read the user. Counters live on that record — `wins_count`, `streak_days`
   * — so anything that moves them has to ask for it again.
   */
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Holds the signed-in user and their Sanctum token, persisted across launches.
 *
 * Reusing a stored token matters beyond convenience: each login mints another
 * token and never retires the last one, and logout only revokes the token it
 * was called with. Signing in afresh on every reload would leave a trail of
 * live tokens that nothing can revoke.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await loadToken();
        if (!stored) return;

        // The token may have been revoked from another device since it was
        // written, so it has to be exchanged for a user before being trusted.
        const restored = await fetchUser(stored);
        if (cancelled) return;

        setUser(restored);
        setToken(stored);
      } catch (caught) {
        // 401 means the token is dead — drop it. Anything else (the server
        // being unreachable, say) leaves it in place to retry next launch.
        if (caught instanceof ApiError && caught.status === 401) await clearToken();
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const adopt = useCallback(
    async (response: { user: User; token: string }, remember: boolean) => {
      await saveToken(response.token, remember);
      setUser(response.user);
      setToken(response.token);
    },
    []
  );

  // Signing up is a deliberate act on a device you have just chosen to install
  // the app on, so it is remembered without asking.
  const register = useCallback(
    async (input: RegisterInput) => adopt(await registerRequest(input), true),
    [adopt]
  );

  const login = useCallback(
    async (input: LoginInput, remember = true) => adopt(await loginRequest(input), remember),
    [adopt]
  );

  const refreshUser = useCallback(async () => {
    if (!token) return;
    try {
      setUser(await fetchUser(token));
    } catch {
      // Only counters are at stake. Failing here should not disturb a session
      // that is otherwise working, so the stale numbers simply stand.
    }
  }, [token]);

  const logout = useCallback(async () => {
    try {
      if (token) await logoutRequest(token);
    } catch {
      // A failed revoke must not strand the user in a signed-in shell. The
      // token stays live server-side, but locally we are signed out either way.
    } finally {
      await clearToken();
      setUser(null);
      setToken(null);
    }
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: token !== null,
      isRestoring,
      register,
      login,
      logout,
      refreshUser,
    }),
    [user, token, isRestoring, register, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
