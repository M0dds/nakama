import {
  createContext,
  createSignal,
  onCleanup,
  useContext,
  type Component,
  type ParentProps,
} from "solid-js";
import { Toaster } from "@/components/Toaster";

/**
 * Toast system — a tiny, dependency-free notification layer in the project's
 * own design language (liquid rise/fall, hard-ish corners, mono action label).
 * No `sonner`/`solid-sonner`: the whole UI is custom-tokened (themes, motion,
 * elevation), so a 3rd-party toaster would fight the system more than it saves.
 *
 * Context lives here (like auth.tsx); the visual stack is `components/Toaster`.
 * Mounted once via AppShell, so a toast survives route changes — which is the
 * point: the canonical trigger is an async cross-user event (an invitation
 * arriving while you're on another page), surfaced from BottomNav's global
 * invitation subscription.
 */

/** Lucide-style icon component a toast can show left of its message. */
export type ToastIcon = Component<{
  class?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  /** Lucide icon, accent-tinted, left of the message. */
  icon?: ToastIcon;
  /** A single inline action (mono-mini button). Firing it also dismisses. */
  action?: ToastAction;
  /** Auto-dismiss after this many ms. 0 = sticky (manual dismiss only).
   *  Defaults to DEFAULT_DURATION_MS. */
  durationMs?: number;
}

export interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

const DEFAULT_DURATION_MS = 5000;
/** Must match the ToastCard exit transition so the row is removed only after
 *  its fade-out has played. */
const EXIT_MS = 300;

type ToastFn = (message: string, opts?: ToastOptions) => number;

const ToastContext = createContext<{
  toast: ToastFn;
  dismiss: (id: number) => void;
}>();

export function ToastProvider(props: ParentProps) {
  const [toasts, setToasts] = createSignal<ToastItem[]>([]);
  // Ids currently animating out. Kept OUT of the toast objects so the array
  // references stay stable — a <For> keyed by object identity would otherwise
  // remount the leaving row and kill its exit transition (AGENTS.md gotcha).
  const [leaving, setLeaving] = createSignal<number[]>([]);
  let nextId = 1;
  // One live timer per toast: first the auto-dismiss timer, later replaced by
  // the post-exit removal timer. Cleared wholesale on unmount.
  const timers = new Map<number, number>();

  const remove = (id: number) => {
    const tm = timers.get(id);
    if (tm !== undefined) {
      window.clearTimeout(tm);
      timers.delete(id);
    }
    setToasts((ts) => ts.filter((t) => t.id !== id));
    setLeaving((l) => l.filter((x) => x !== id));
  };

  const dismiss = (id: number) => {
    if (leaving().includes(id)) return; // already animating out
    const tm = timers.get(id);
    if (tm !== undefined) window.clearTimeout(tm);
    setLeaving((l) => [...l, id]);
    timers.set(id, window.setTimeout(() => remove(id), EXIT_MS));
  };

  const toast: ToastFn = (message, opts = {}) => {
    const id = nextId++;
    // Resolve the duration up-front and store it on the item so the card's
    // progress bar can animate over the exact same span as the auto-dismiss.
    const durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
    setToasts((ts) => [...ts, { id, message, ...opts, durationMs }]);
    if (durationMs > 0) {
      timers.set(id, window.setTimeout(() => dismiss(id), durationMs));
    }
    return id;
  };

  onCleanup(() => {
    for (const tm of timers.values()) window.clearTimeout(tm);
  });

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {props.children}
      <Toaster toasts={toasts()} leaving={leaving()} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/** Fire toasts from anywhere inside the ToastProvider (i.e. the authed app). */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx.toast;
}
