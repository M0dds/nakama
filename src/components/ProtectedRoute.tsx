import { Show, type ParentProps } from "solid-js";
import { Navigate } from "@solidjs/router";
import { useAuth } from "@/lib/auth";

/**
 * Guards a route so unauthenticated users get bounced to /login. Wrap a
 * route's component with this and there's no chance of leaking protected
 * UI flashes during the initial session check:
 *
 *   {
 *     path: "/",
 *     component: () => <ProtectedRoute><Home /></ProtectedRoute>,
 *   }
 *
 * While `loading()` is true (the first getSession() resolves), we render
 * nothing — quick enough that no skeleton is needed. As soon as the auth
 * state settles, either the children render OR Navigate redirects to /login.
 */
export function ProtectedRoute(props: ParentProps) {
  const auth = useAuth();
  return (
    <Show when={!auth.loading()} fallback={null}>
      <Show when={auth.user()} fallback={<Navigate href="/login" />}>
        {props.children}
      </Show>
    </Show>
  );
}
