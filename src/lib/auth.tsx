import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type ParentProps,
} from "solid-js";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Auth state lives in a single Solid signal exposed via context. Every page
 * + every query that needs the caller's identity reads `useAuth().user()`,
 * which is reactive — when the session changes, dependent components
 * re-render on the changed fields only (Solid's fine-grained reactivity).
 *
 * The Supabase client maintains the session itself (persistSession in
 * src/lib/supabase.ts); we just subscribe to its changes via
 * onAuthStateChange() and push them into our signal.
 *
 * `loading` is true until the initial getSession() resolves — useful for
 * ProtectedRoute to avoid a flash-of-login-page on first paint.
 */

interface AuthContextValue {
  session: () => Session | null;
  user: () => User | null;
  loading: () => boolean;
}

const AuthContext = createContext<AuthContextValue>();

export function AuthProvider(props: ParentProps) {
  const [session, setSession] = createSignal<Session | null>(null);
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    // Read the persisted session once on mount. Supabase's local-storage cache
    // makes this near-instant — no network roundtrip unless refresh kicks in.
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setLoading(false);
  });

  onMount(() => {
    // Live updates: login / logout / refresh-token rotation all flow through
    // here. The same client + same callback so we keep one source of truth.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    onCleanup(() => data.subscription.unsubscribe());
  });

  const value: AuthContextValue = {
    session,
    user: () => session()?.user ?? null,
    loading,
  };

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

/** Consume the auth state. Throws if used outside <AuthProvider> — that's a
 *  programmer error (top-level provider missing in src/index.tsx). */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx)
    throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
