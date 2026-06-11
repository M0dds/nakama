import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { ArrowRightLeft, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import {
  listCategoryLabel,
  listItemsQueryKey,
  listsQueryKey,
  listsQueryOptions,
  moveListItem,
  type ListSummary,
} from "@/lib/queries/lists";
import { useToast } from "@/lib/toast";

/**
 * Modal list-picker for moving a list_items row to another list. Same
 * concept as Logbook's MoveItemDialog, Nakama-styled:
 *
 *   ● VERSCHIEBEN                                              ✕
 *   Item-Titel
 *   ──────────────────────────────────────────────────────────────
 *   Wähl die Ziel-Liste. Der Sync-Status wird zurückgesetzt —
 *   in der neuen Liste kannst du ihn neu aktivieren.
 *
 *     Liste A                                Privat   ⇄
 *     Liste B                                Geteilt  ⇄
 *     …
 *
 * Backdrop click + Escape close. The current list is filtered out of the
 * picker. Each row is a self-contained submit — tapping a list runs the
 * move and closes; while it's in flight, the entries dim. If the caller
 * has no other lists, we render an empty hint instead of an empty list.
 */
interface Props {
  /** list_items.id to move. */
  listItemId: string;
  itemTitle: string;
  /** The item's media type — compared against the target list's category for
   *  the dulden+warnen toast (F9: a move is the second way an item enters a
   *  list; it stays as permissive as re-categorizing, but never silent). */
  itemType: string;
  /** The list the item is currently in — excluded from the picker, and
   *  the invalidation key for the source list's items cache. */
  currentListShortCode: string;
  open: boolean;
  onClose: () => void;
}

/** Open/close transition duration. Mirrors AddSheet's 500 ms fade — the
 *  dialog appears alongside the backdrop's blur/dim and the card's opacity
 *  ramps in on the same curve, so the two reads as one motion. */
const ANIM_MS = 500;

export function MoveItemDialog(props: Props) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  // Two-signal mount/visible pattern (same as AppShell ↔ AddSheet):
  //   `mounted` controls whether the dialog is in the DOM. Flips on first,
  //   off after ANIM_MS so the closing animation can play out.
  //   `visible` controls the actual opacity/blur classes. Lags `mounted`
  //   by two rAFs on open (so the browser paints the initial opacity-0
  //   state before the transition triggers — without that double-rAF,
  //   Solid's render loop can merge mount + class-flip into one paint
  //   frame and the transition never animates).
  //
  // `snap` keeps a local copy of the visible-content props (currently just
  // the item title) for the lifetime of one open cycle. The parent owns
  // these via the "currently-moving entry" signal, and it typically nulls
  // that signal the moment `onClose` fires — without the snapshot, the
  // title would empty out instantly, the h2 collapses, and you see the
  // card shrink/title pop while the rest of it is still fading.
  const [mounted, setMounted] = createSignal(false);
  const [visible, setVisible] = createSignal(false);
  const [snap, setSnap] = createSignal<{ itemTitle: string } | null>(null);
  let closeTimer: number | null = null;

  createEffect(() => {
    if (props.open) {
      if (closeTimer !== null) {
        window.clearTimeout(closeTimer);
        closeTimer = null;
      }
      setSnap({ itemTitle: props.itemTitle });
      setMounted(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
    } else {
      setVisible(false);
      if (closeTimer !== null) window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        setMounted(false);
        setSnap(null);
        closeTimer = null;
      }, ANIM_MS);
    }
  });

  onCleanup(() => {
    if (closeTimer !== null) window.clearTimeout(closeTimer);
  });

  const listsQuery = createQuery(() => ({
    ...listsQueryOptions(auth.user()!),
    enabled: !!auth.user() && props.open,
  }));

  const otherLists = (): ListSummary[] => {
    const data = listsQuery.data;
    if (!data) return [];
    return [...data.private, ...data.shared].filter(
      (l) => l.shortCode !== props.currentListShortCode,
    );
  };

  const moveMut = createMutation(() => ({
    // BOTH halves of the mismatch comparison ride in the variables, captured
    // at click time: the target's category could be swapped by a refetch
    // mid-flight, and props.itemType is a live getter the parent nulls to ""
    // the moment onClose fires — the dialog stays dismissable while the move
    // is in flight, so a live read would fire a spurious mismatch toast.
    mutationFn: (target: {
      id: string;
      category: ListSummary["category"];
      itemType: string;
    }) => moveListItem({ listItemId: props.listItemId, targetListId: target.id }),
    onSuccess: (_d, target) => {
      // dulden + warnen (F9): the move goes through even when the item doesn't
      // match the target list's category — but never silently, mirroring the
      // re-categorize toast on the detail page.
      if (target.category && target.itemType !== target.category) {
        toast(
          `Passt nicht zu „${listCategoryLabel(target.category)}“ — der Eintrag bleibt trotzdem in der Liste.`,
        );
      }
      // Source list loses an item — invalidate its items cache and the
      // overview (itemCount on both source + target cards drifts).
      void queryClient.invalidateQueries({
        queryKey: listItemsQueryKey(props.currentListShortCode),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      // Target list's items cache: we don't have the target shortCode in
      // scope here, so broad-invalidate via the "list" prefix. Cheap —
      // the user is mid-move and won't have many per-list caches warm.
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      props.onClose();
    },
  }));

  // Body-scroll lock + Escape-to-close. Gated on `mounted` (not `props.open`)
  // so the page underneath stays locked through the close animation — no
  // half-second flash of scrollability while the dialog is fading.
  createEffect(() => {
    if (!mounted()) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    });
  });

  return (
    <Show when={mounted()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-item-title"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop — same fade as AddSheet: bg-black/0 → bg-black/50 and
            backdrop-blur-none → backdrop-blur-sm in lockstep on the
            500 ms ease-quart curve, so the dim + blur read as a single
            "world-recedes" motion. */}
        <button
          type="button"
          aria-label="Abbrechen"
          onClick={props.onClose}
          class={`absolute inset-0 transition-all duration-500 [transition-timing-function:var(--ease-quart)] ${
            visible()
              ? "bg-black/50 backdrop-blur-sm"
              : "bg-black/0 backdrop-blur-none"
          }`}
        />
        {/* Card — pure opacity fade on the same curve. AddSheet's card also
            uses pure opacity (the search-pill carries the spatial motion
            there); the consistency makes both dialogs read as the same
            opening gesture. */}
        <div
          class={`relative flex w-full max-w-sm flex-col overflow-hidden rounded-sm bg-bg dark:bg-surface shadow-floating transition-opacity duration-500 [transition-timing-function:var(--ease-quart)] ${
            visible() ? "opacity-100" : "opacity-0"
          }`}
        >
          <header class="flex items-start justify-between gap-3 border-b border-rule px-6 pb-4 pt-5">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  aria-hidden
                  class="size-2 shrink-0 rounded-full bg-accent"
                />
                <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
                  Verschieben
                </span>
              </div>
              <h2
                id="move-item-title"
                class="mt-1 truncate text-heading font-medium tracking-tight text-text"
              >
                {snap()?.itemTitle ?? ""}
              </h2>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              aria-label="Schließen"
              class="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface dark:hover:bg-white/[0.07] hover:text-text"
            >
              <X class="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          </header>

          <Show
            when={!listsQuery.isLoading}
            fallback={
              <p class="px-6 py-8 text-body text-text-muted">Lade Listen …</p>
            }
          >
            <Show
              when={otherLists().length > 0}
              fallback={
                <p class="px-6 py-8 text-body text-text-muted">
                  Du hast noch keine andere Liste. Leg erst eine zweite an —
                  dann kannst du den Eintrag rüberschieben.
                </p>
              }
            >
              <p class="px-6 pt-4 text-body text-text-muted">
                Wähl die Ziel-Liste. Der Sync-Status wird zurückgesetzt — in
                der neuen Liste kannst du ihn neu aktivieren.
              </p>
              <ul class="mt-3 pb-2">
                <For each={otherLists()}>
                  {(l) => (
                    <li class="relative after:absolute after:inset-x-6 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                      <button
                        type="button"
                        onClick={() =>
                          moveMut.mutate({
                            id: l.id,
                            category: l.category,
                            itemType: props.itemType,
                          })
                        }
                        disabled={moveMut.isPending}
                        class="group flex w-full items-center justify-between gap-3 px-6 py-3 text-left transition-colors hover:bg-surface dark:hover:bg-white/[0.06] disabled:cursor-default disabled:opacity-50"
                      >
                        <span class="min-w-0 truncate text-body font-medium text-text">
                          {l.name}
                        </span>
                        <span class="flex shrink-0 items-center gap-2 font-mono text-mini uppercase tracking-wider text-text-muted">
                          {/* Category marker so a mismatched target is visible
                              BEFORE the tap, not only via the toast after. */}
                          {l.isShared ? "Geteilt" : "Privat"}
                          {l.category
                            ? ` · ${listCategoryLabel(l.category)}`
                            : ""}
                          <ArrowRightLeft
                            class="size-3.5 transition-colors group-hover:text-accent"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  );
}
