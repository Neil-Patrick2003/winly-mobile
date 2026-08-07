import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiError } from '@/lib/api';
import {
  fetchUser,
  loginRequest,
  logoutRequest,
  registerRequest,
  resetPasswordRequest,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type User,
} from '@/lib/auth';
import { registerForPush, unregisterFromPush } from '@/lib/push';
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
  /**
   * Set a new password from an emailed code and adopt the session that comes
   * back with it.
   *
   * The server revokes every token the account had before issuing that one, so
   * this signs the user's other devices out as a side effect — which is the
   * point when the reason for resetting was that somebody else was in there.
   */
  resetPassword: (input: ResetPasswordInput) => Promise<void>;
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

  /*
   * The Expo push token this device is registered under, once it has one.
   *
   * A ref rather than state: nothing renders from it, and it is read inside
   * `logout`, which must not be rebuilt every time registration finishes.
   */
  const pushToken = useRef<string | null>(null);

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

        // A restored session is a session, and the token may have been rotated
        // or the permission revoked since the last launch — so this is asked
        // again on every start rather than only at sign-in.
        pushToken.current = await registerForPush(stored);
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

      // Not awaited: registration asks for a permission, and the app should be
      // on screen behind that prompt rather than held on a spinner behind it.
      void registerForPush(response.token).then((registered) => {
        pushToken.current = registered;
      });
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

  // Remembered without asking, like signing up: proving you hold the address
  // and choosing the password here is a more deliberate act than signing in,
  // and being asked to type the new password again immediately would read as
  // the reset not having worked.
  const resetPassword = useCallback(
    async (input: ResetPasswordInput) => adopt(await resetPasswordRequest(input), true),
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
      /*
       * Before the token is revoked, because the endpoint scopes the delete to
       * the caller — afterwards there is nothing left to say it with. A device
       * left on the list is the next person to sign in on this phone getting
       * somebody else's notifications.
       */
      if (token && pushToken.current) {
        await unregisterFromPush(pushToken.current, token);
        pushToken.current = null;
      }

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
      resetPassword,
      logout,
      refreshUser,
    }),
    [user, token, isRestoring, register, login, resetPassword, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
