import {
  createEffect,
  createSignal,
  For,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useLocation } from "@solidjs/router";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { Check, Loader2, Lock, Minus, Plus, Search, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { searchMedia, type MediaResult } from "@/lib/search";
import { typeInitial, typeLabel } from "@/lib/format";
import type { MediaType } from "@/lib/queries/home";
import { fadeOnLoad } from "@/lib/image-fade";
import { safeAreaInset } from "@/lib/media";
import { addItemToList, removeItemFromList } from "@/lib/queries/items";
import {
  listCategoryLabel,
  listsQueryOptions,
  listsQueryKey,
  type ListCategory,
} from "@/lib/queries/lists";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";
import { Segmented } from "@/components/Segmented";

/** Media-type filter for the search panel. All five are live: anime/manga
 *  (AniList), series + movies (TMDB), games (Steam, via the dev proxy / Edge
 *  Function — see src/lib/steam.ts). */
const MEDIA_FILTERS: { value: MediaType; label: string; disabled?: boolean }[] = [
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
  { value: "series", label: "Serie" },
  { value: "movie", label: "Film" },
  { value: "game", label: "Spiel" },
];

/**
 * Add/Search sheet — two-piece layout with a liquid morph entrance.
 *
 * The visual idea (Apple-style shared-element transition):
 *
 *   Desktop (pill below card):        Mobile (pill on TOP, card below):
 *
 *   ┌─────────────────────────┐       [🔍  Anime suchen …      ]
 *   │ ●HINZUFÜGEN ZU ▾Liste ✕│       ┌─────────────────────────┐
 *   ├─────────────────────────┤       │ ●HINZUFÜGEN ZU ▾Liste ✕│
 *   │ Result rows …           │       ├─────────────────────────┤
 *   └─────────────────────────┘       │ Result rows …           │
 *   [🔍  Anime suchen …       ]       └─────────────────────────┘
 *                                      ▓▓▓▓▓▓▓ keyboard ▓▓▓▓▓▓▓
 *
 *   The Pill MORPHS from the BottomNav's `+`-button rect: it starts at that
 *   button's exact bounding rect (44×44, fully round) and animates left/top/
 *   width/height in lockstep to its target geometry. The `+` in the nav
 *   fades to opacity-0 on the same curve, so it visually reads as the
 *   button *becoming* the search tool. The Card fades in on the same timing.
 *
 * Mobile keyboard strategy: the pill is TOP-anchored, i.e. categorically out
 * of the keyboard's reach — see targetRect() for why keyboard-glued
 * positioning was abandoned (iOS pan/resize behaviors + an active iOS 26
 * visualViewport bug). The keyboard only ever shortens the results card.
 *
 * Search-as-you-type with a small debounce; AbortController kills in-flight
 * fetches so a fast typist doesn't get rows from an older query trail in.
 */
interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The sheet mounts per open, and the realtime cleanup (removeChannel) is
 *  async — a fast close→reopen would create a second channel on the SAME
 *  topic while the first is still tearing down. Unique key per mount. */
let addSheetMountSeq = 0;
export function AddSheet(props: { visible: boolean; onClose: () => void }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  // ── List picker (target) ───────────────────────────────────────────────
  const listsQuery = createQuery(() => ({
    ...listsQueryOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  // The category lock derives from this cache, and the AddSheet is the ONLY
  // enforcement layer for "was rein darf" — but the sheet can open anywhere
  // (Home, Kalender), where no realtime channel watches `lists`. A member
  // whose cache predates an owner's category change would see no lock for the
  // whole staleTime. So: refetch once per open (the sheet mounts per open,
  // cached data still paints instantly), and stay live while it's up.
  onMount(() => {
    // Skipped while any mutation is in flight: the user can pin/drag a row on
    // /lists and tap "+" inside the write's flight window — a force-refetch
    // started then reads PRE-write state and would snap the optimistic patch
    // back. Their own action just touched the cache anyway; the realtime
    // subscription below covers changes that land while the sheet is up.
    if (queryClient.isMutating() === 0)
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
  });
  useRealtimeInvalidation(`add-sheet-lists-${++addSheetMountSeq}`, [
    { table: "lists", invalidates: [listsQueryKey] },
  ]);

  /** Flatten private + shared for the SelectMenu. Order: private first,
   *  shared second — same order the user sees on /lists. The category rides
   *  along as the option's meta tag — two same-named lists ("Watchlist" for
   *  anime AND series) are otherwise indistinguishable in the picker;
   *  uncategorized ("Alle") lists stay tag-free. */
  const listOptions = (): SelectOption[] => {
    const data = listsQuery.data;
    if (!data) return [];
    return [...data.private, ...data.shared].map((l) => ({
      id: l.id,
      label: l.name,
      meta: l.category ? typeLabel(l.category) : undefined,
    }));
  };

  /** The list shortCode in the URL when we opened from `/lists/<shortCode>`,
   *  else null. Note this is the shortCode (`mystic-coral-voyager`), NOT the
   *  list UUID — it must be resolved against the loaded summaries below. */
  const shortCodeFromRoute = (): string | null => {
    const m = location.pathname.match(/^\/lists\/([^/]+)$/);
    return m?.[1] ?? null;
  };

  const [targetListId, setTargetListId] = createSignal<string>("");

  // Once the lists load, pick a sensible default: the list whose shortCode
  // matches the route (when opened from a list-detail page), otherwise the
  // first list. The route segment is a shortCode while the picker is keyed by
  // UUID, so resolve shortCode → id against the summaries before selecting —
  // matching the raw shortCode against UUIDs always missed and silently fell
  // back to the first list. Only runs once so a later realtime refresh
  // doesn't clobber a manual change.
  let pickedDefault = false;
  createEffect(() => {
    if (pickedDefault) return;
    const data = listsQuery.data;
    const opts = listOptions();
    if (!data || opts.length === 0) return;
    const code = shortCodeFromRoute();
    const all = [...data.private, ...data.shared];
    const fromRoute = code
      ? all.find((l) => l.shortCode === code)?.id
      : undefined;
    // Global "+" (no list in the route): prefer the first uncategorized ("Alle")
    // list so a quick add stays type-free by default — only fall back to the
    // very first list when every list is categorized.
    const firstFree = all.find((l) => !l.category)?.id;
    setTargetListId(fromRoute ?? firstFree ?? opts[0].id);
    pickedDefault = true;
  });

  /** The selected target list's category, or null for an "Alle" (uncategorized)
   *  list. Non-null → the panel locks its type filter to that media type. */
  const targetCategory = (): ListCategory | null => {
    const data = listsQuery.data;
    if (!data) return null;
    const all = [...data.private, ...data.shared];
    return all.find((l) => l.id === targetListId())?.category ?? null;
  };

  // ── Search ─────────────────────────────────────────────────────────────
  const [query, setQuery] = createSignal("");
  // Which media type the search targets. Drives which source searchMedia hits
  // and keeps results un-mixed (the user picks one kind at a time).
  const [mediaFilter, setMediaFilter] = createSignal<MediaType>("anime");
  const [results, setResults] = createSignal<MediaResult[]>([]);
  const [searching, setSearching] = createSignal(false);
  // The query string the current `results` were fetched for. Lets the empty-
  // state distinguish "haven't searched yet" from "no hits for this term".
  const [lastQuery, setLastQuery] = createSignal("");

  let abort: AbortController | null = null;
  let debounceTimer: number | null = null;

  // Switching the type filter clears the old type's hits immediately so a
  // "Serie" tab never shows lingering anime rows; the search effect below then
  // re-runs for the new type. `defer` skips the initial run (nothing to clear).
  // The in-flight fetch is aborted HERE, not just in the next debounce
  // callback 220 ms later — otherwise an old-type response landing in that
  // window repopulates the cleared panel (under a category lock that means
  // wrong-type rows beneath the "Nur <Kategorie>" label).
  createEffect(
    on(mediaFilter, () => {
      abort?.abort();
      setResults([]);
      setLastQuery("");
    }, { defer: true }),
  );

  // When the target list carries a category, the AddSheet is LOCKED to that
  // media type — F9's "what may go in". Force the filter to the category so the
  // search hits the right source; the Segmented is hidden (static label) below,
  // so this never fights a manual pick. An uncategorized ("Alle") list leaves
  // the filter free, exactly as before.
  createEffect(() => {
    const cat = targetCategory();
    if (cat) setMediaFilter(cat);
  });

  createEffect(() => {
    const q = query().trim();
    // Read the filter so the search re-runs against the new source when the
    // user switches type mid-query.
    const type = mediaFilter();
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (q.length < 2) {
      // Don't hammer the search providers on the first keystroke.
      abort?.abort();
      setResults([]);
      setSearching(false);
      setLastQuery("");
      return;
    }
    debounceTimer = window.setTimeout(() => {
      abort?.abort();
      const ctrl = new AbortController();
      abort = ctrl;
      setSearching(true);
      void searchMedia(q, type, ctrl.signal).then((rows) => {
        if (ctrl.signal.aborted) return;
        setResults(rows);
        setLastQuery(q);
        setSearching(false);
      });
    }, 220);
  });

  // ── Add a result ───────────────────────────────────────────────────────
  /** Maps `addedKey(listId, sourceId)` → the canonical item id of what was
   *  added in THIS session, scoped to its target list (so switching lists
   *  doesn't carry the ✓ over). The item id is kept so a mis-tap can be undone
   *  (F5) via removeItemFromList — clicking an already-added (✓) row removes it
   *  again. */
  const [added, setAdded] = createSignal<Map<string, string>>(new Map());
  // A SET, not a single id: two results can be added in quick succession, and
  // a single-string pending let the first add's onSettled clear the spinner of
  // the second (still in flight). Keyed by sourceId.
  const [pending, setPending] = createSignal<Set<string>>(new Set());

  const addedKey = (listId: string, sourceId: string) =>
    `${listId}:${sourceId}`;

  // Reset ✓ marks whenever the user changes the target list — the previous
  // ticks belong to the old list and would be misleading on the new one.
  createEffect(() => {
    void targetListId();
    setAdded(new Map<string, string>());
  });

  const addMutation = createMutation(() => ({
    // The target list is captured at mutate time and rides in the variables —
    // NOT read fresh in onSuccess, where a list switch between mutate and
    // success would book the ✓ against the wrong list.
    mutationFn: (input: { source: MediaResult; listId: string }) =>
      addItemToList({
        listId: input.listId,
        source: input.source,
        userId: auth.user()!.id,
      }),
    onSuccess: (itemId, input) => {
      setAdded((prev) => {
        const next = new Map(prev);
        next.set(addedKey(input.listId, input.source.sourceId), itemId);
        return next;
      });
      // Counts ripple across three places: the overview (listsQueryKey),
      // the items list on the detail page (listItemsQueryKey), and the
      // single-list detail header showing "Einträge: N" (listQueryKey).
      // The ["list"] prefix catches both per-shortCode entries — same item
      // can also live on another open list-detail tab.
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
    },
    onSettled: (_d, _e, input) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(input.source.sourceId);
        return next;
      });
    },
  }));

  // Undo a mis-tap (F5): remove the just-added item from the target list. The
  // item id rides in from the `added` map captured at add time, so removal
  // doesn't need to re-resolve the source.
  const removeMutation = createMutation(() => ({
    mutationFn: (input: { source: MediaResult; listId: string; itemId: string }) =>
      removeItemFromList({ listId: input.listId, itemId: input.itemId }),
    onSuccess: (_, input) => {
      setAdded((prev) => {
        const next = new Map(prev);
        next.delete(addedKey(input.listId, input.source.sourceId));
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
    },
    onSettled: (_d, _e, input) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(input.source.sourceId);
        return next;
      });
    },
  }));

  /** Results gated by the category lock. Defense-in-depth on top of the
   *  forced filter: a stale fetch (or a target-list switch mid-search) can
   *  put wrong-type rows into `results` — they must never RENDER under the
   *  lock, since the AddSheet is the only enforcement layer (no DB check). */
  const visibleResults = (): MediaResult[] => {
    const cat = targetCategory();
    return cat ? results().filter((r) => r.type === cat) : results();
  };

  // One tap on a result toggles its membership in the target list: add when
  // it's not in yet, remove (undo) when it already carries the ✓.
  const onToggle = (r: MediaResult) => {
    const listId = targetListId();
    if (!listId) return;
    // Same guard as visibleResults — belt and braces for the F9 invariant.
    const cat = targetCategory();
    if (cat && r.type !== cat) return;
    if (pending().has(r.sourceId)) return;
    const itemId = added().get(addedKey(listId, r.sourceId));
    setPending((prev) => new Set(prev).add(r.sourceId));
    if (itemId) {
      removeMutation.mutate({ source: r, listId, itemId });
    } else {
      addMutation.mutate({ source: r, listId });
    }
  };

  // ── Entry/exit transition ──────────────────────────────────────────────
  // The pill morphs from the BottomNav's pill rect to its target rect.
  // Card + backdrop fade/slide on the same 300ms ease-quart curve. The
  // open/closed state is OWNED by AppShell (props.visible) so the nav-pill
  // fade and the search-pill morph stay perfectly synced — see AppShell.tsx
  // for the two-state mount/visible split that enables that.
  const ANIM_MS = 420;
  const [origin, setOrigin] = createSignal<Rect | null>(null);
  /** Soft-keyboard inset (px from the layout-viewport bottom). On mobile it
   *  ONLY trims the results card's height — the pill itself is top-anchored
   *  there and never interacts with the keyboard (the load-bearing design
   *  decision: iOS 26 has an active WebKit bug where visualViewport values
   *  don't revert after keyboard dismissal, so anything POSITIONED off
   *  those values eventually strands — a height that's transiently a bit
   *  short is harmless). */
  const [keyboardOffset, setKeyboardOffset] = createSignal(0);
  /** Viewport size — re-evaluated on resize so the pill/card recompute
   *  their target geometry on rotation / window-resize (and, in standalone
   *  PWA mode, when iOS shrinks the layout viewport for the keyboard). */
  const [viewport, setViewport] = createSignal({
    w: typeof window !== "undefined" ? window.innerWidth : 0,
    h: typeof window !== "undefined" ? window.innerHeight : 0,
  });

  let inputEl: HTMLInputElement | undefined;

  /** Measure the BottomNav pill — that's our morph origin (and the close-
   *  morph target). Re-run on resize so a window-resize / rotation while the
   *  sheet is open keeps the close animation landing on the pill's CURRENT
   *  position instead of where it sat when the sheet opened (B5). */
  const measureOrigin = () => {
    const anchor = document.querySelector<HTMLElement>("[data-add-anchor]");
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      setOrigin({ left: r.left, top: r.top, width: r.width, height: r.height });
    }
  };

  onMount(() => {
    // 1) Measure the BottomNav pill — that's our morph origin.
    measureOrigin();

    // 2) Scroll lock + esc-to-close. `overflow: hidden` alone does NOT stop
    //    iOS touch panning — with the soft keyboard up, Safari could still
    //    drag the layout viewport around (the whole sheet slid off-screen,
    //    the pill visually "fell" below the keyboard, and everything
    //    re-settled on release). The classic position:fixed body lock makes
    //    the document genuinely unscrollable; scroll position is restored on
    //    close.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    const scrollY = window.scrollY;
    const b = document.body.style;
    const prevLock = {
      position: b.position,
      top: b.top,
      left: b.left,
      right: b.right,
      width: b.width,
      overflow: b.overflow,
    };
    b.position = "fixed";
    b.top = `-${scrollY}px`;
    b.left = "0";
    b.right = "0";
    b.width = "100%";
    b.overflow = "hidden";

    // 3) Visual-viewport tracking for the mobile soft keyboard. When it
    //    opens, vv.height shrinks below window.innerHeight; we offset the
    //    pill by the difference so it floats above the keyboard.
    const vv = window.visualViewport;
    const onResize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      measureOrigin();
      if (vv) {
        const offset = window.innerHeight - vv.height - vv.offsetTop;
        setKeyboardOffset(Math.max(0, offset));
      }
    };
    window.addEventListener("resize", onResize);
    vv?.addEventListener("resize", onResize);
    vv?.addEventListener("scroll", onResize);
    onResize();

    // 4) Focus. Coarse pointers: AppShell's openAdd focused a throwaway
    //    warm-up input synchronously inside the "+"-tap (iOS only opens the
    //    soft keyboard for a gesture-attributed focus — both a delayed focus
    //    AND a mount-time focus of this input proved too indirect). The
    //    warm-up HOLDS the focus (and the keyboard) through the morph — an
    //    immediate transfer killed the keyboard, because the real input
    //    still sat inside the opacity-0 pill and iOS drops the keyboard for
    //    an invisible focus target. Once the pill has landed (ANIM_MS) —
    //    top-anchored, always clear of the keyboard, so the hand-over can
    //    never trigger a pan — steal the focus onto the real input (the
    //    keyboard survives a focus transfer) and clean the warm-up away.
    //    preventScroll: the pill is fixed-positioned — Safari's
    //    scroll-into-view would fight the lock.
    //    Fine pointers (hardware keyboard, nothing slides up): as before.
    const warm = document.querySelector<HTMLElement>(
      "[data-add-keyboard-warmup]",
    );
    const focusTimer = window.setTimeout(
      () => {
        inputEl?.focus({ preventScroll: true });
        warm?.remove();
      },
      warm ? ANIM_MS : ANIM_MS - 50,
    );

    onCleanup(() => {
      window.clearTimeout(focusTimer);
      warm?.remove();
      document.removeEventListener("keydown", onKey);
      b.position = prevLock.position;
      b.top = prevLock.top;
      b.left = prevLock.left;
      b.right = prevLock.right;
      b.width = prevLock.width;
      b.overflow = prevLock.overflow;
      window.scrollTo(0, scrollY);
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      abort?.abort();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    });
  });

  // ── Target geometry ────────────────────────────────────────────────────
  /** Where the pill should LAND. Height matches the nav-pill exactly (so
   *  the morph never jumps in height).
   *
   *  Desktop (≥768px): centered at the nav-pill's vertical position — the
   *  classic bottom search bar; there's no soft keyboard to fight.
   *
   *  Mobile: TOP-anchored. The load-bearing decision of the 2026-07 mobile
   *  rework: every attempt to keep the pill glued to the keyboard's upper
   *  edge fought (a) Safari-tab's webview PAN when a focused input sits
   *  under the rising keyboard, (b) standalone-PWA's layout-viewport
   *  RESIZE, and (c) an active iOS 26 WebKit bug where visualViewport
   *  offsetTop/height don't revert after keyboard dismissal
   *  (developer.apple.com/forums/thread/800125). Anchored at the top — the
   *  native iOS search idiom — the pill is categorically outside the
   *  keyboard's reach: no tracking, no pan (the focused input is always
   *  visible), no PWA-vs-tab mode detection. The keyboard at most covers
   *  the tail of the scrollable results card below. */
  const targetRect = (): Rect => {
    const o = origin();
    if (!o) {
      // Sensible fallback while anchor is being measured.
      return { left: 0, top: 0, width: 0, height: 56 };
    }
    const { w, h } = viewport();
    const pillH = o.height;
    const sideGap = 16;
    if (w >= 768) {
      const width = Math.min(w - 2 * sideGap, 576);
      // If a soft keyboard does appear (touch tablets), lift above it.
      const top =
        keyboardOffset() > 0 ? h - keyboardOffset() - pillH - 16 : o.top;
      return { left: (w - width) / 2, top, width, height: pillH };
    }
    // 16px below the status bar (safe-top is 0 outside the edge-to-edge PWA).
    return {
      left: sideGap,
      top: 16 + safeAreaInset("top"),
      width: w - 2 * sideGap,
      height: pillH,
    };
  };

  /** Pill style — origin-rect while resting, target-rect while entered.
   *  Border-radius interpolates from full-pill (44/2=22 → matches the nav
   *  button) to the target's half-height pill. */
  const pillStyle = () => {
    const o = origin();
    if (!o) return { opacity: "0" };
    const r = props.visible ? targetRect() : o;
    return {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      "border-radius": "9999px", // capsule throughout — origin is round too
    };
  };

  /** Results card. Desktop: above the pill, filling up to the viewport top.
   *  Mobile: BELOW the top-anchored pill, filling the full remaining screen
   *  — deliberately NOT shortened by the keyboard (user call): the list
   *  runs on behind it, which reads calmer than a card that resizes with
   *  every keyboard show/hide. (In standalone-PWA mode iOS shrinks the
   *  layout viewport itself, so "behind the keyboard" is physically capped
   *  at its top edge there — still no resize churn from our side.) */
  const cardStyle = () => {
    const t = targetRect();
    const { w, h } = viewport();
    const innerGap = 12; // space between card and pill
    if (w >= 768) {
      const topGap = 24 + safeAreaInset("top");
      return {
        left: `${t.left}px`,
        top: `${topGap}px`,
        width: `${t.width}px`,
        // Clamped: transient mid-animation geometry must never invert
        // into a negative height.
        height: `${Math.max(0, t.top - topGap - innerGap)}px`,
      };
    }
    const top = t.top + t.height + innerGap;
    return {
      left: `${t.left}px`,
      top: `${top}px`,
      width: `${t.width}px`,
      // Bottom gap clears the home indicator in the edge-to-edge PWA.
      height: `${Math.max(0, h - top - 16 - safeAreaInset("bottom"))}px`,
    };
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Hinzufügen">
      {/* Backdrop — z-40, ABOVE the BottomNav (z-30). Together with the
          nav-pill fading to opacity-0, this makes the nav effectively
          recede into the background — the search-pill on z-50 is now the
          only active control. Color + blur transition on the same 300ms
          ease-quart as the pill morph. */}
      {/* touch-none: a drag on the backdrop must not become an iOS visual-
          viewport pan (with the keyboard up, Safari grants pan room even on
          a locked page — the sheet could be shoved around). */}
      <button
        type="button"
        aria-label="Schließen"
        onClick={props.onClose}
        class={`fixed inset-0 z-40 touch-none transition-all duration-500 [transition-timing-function:var(--ease-quart)] ${
          props.visible
            ? "bg-black/50 backdrop-blur-sm"
            : "bg-black/0 backdrop-blur-none"
        }`}
      />

      {/* Results card — z-50, above the nav. Page-tier styling: bg, hairline
          rules, hard corners. Pure opacity fade — symmetric in both
          directions, no scale/translate. Pill morph carries the spatial
          motion of the entry; the card just fades alongside it. Gated by
          <Show> on origin() so first render commits with the correct
          position/size, otherwise the cardStyle transitions would
          interpolate from their fallback zeros. */}
      <Show when={origin()}>
        <div
          class={`fixed z-50 flex flex-col overflow-hidden rounded-sm bg-bg shadow-floating transition-opacity duration-500 [transition-timing-function:var(--ease-quart)] ${
            props.visible ? "opacity-100" : "opacity-0"
          }`}
          style={cardStyle()}
        >
        <header class="flex items-center justify-between gap-3 border-b border-rule px-5 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
            <span class="shrink-0 font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
              Hinzufügen zu
            </span>
            <Show
              when={listOptions().length > 0}
              fallback={
                <span class="truncate font-mono text-mini uppercase tracking-wider text-text-muted">
                  —
                </span>
              }
            >
              <div class="min-w-0 max-w-[12rem]">
                <SelectMenu
                  ghost
                  value={targetListId()}
                  options={listOptions()}
                  onChange={setTargetListId}
                  ariaLabel="Ziel-Liste"
                />
              </div>
            </Show>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Schließen"
            class="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            <X class="size-4" strokeWidth={1.75} />
          </button>
        </header>

        {/* overscroll-contain: reaching the end of the results must not chain
            the scroll into the (locked) page — iOS would rubber-band the whole
            sheet. */}
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Show
            when={listOptions().length > 0}
            fallback={
              <p class="mx-auto max-w-xs px-5 py-10 text-center text-body text-text-muted">
                Du hast noch keine Liste. Leg im{" "}
                <span class="font-mono">Listen</span>-Tab eine an — dann kannst
                du hier Titel hinzufügen.
              </p>
            }
          >
            {/* Media-type filter — splits the panel width evenly, sticks to
                the top so it stays reachable while results scroll under it.
                A categorized target list locks the type: the Segmented gives
                way to a calm static label so only matching titles can be
                found (F9 — "was rein darf"). An "Alle" list keeps the free
                filter. */}
            <div class="sticky top-0 z-10 bg-bg px-5 py-3">
              <Show
                when={targetCategory()}
                fallback={
                  <Segmented
                    fill
                    value={mediaFilter()}
                    onChange={setMediaFilter}
                    options={MEDIA_FILTERS}
                    ariaLabel="Medientyp"
                  />
                }
              >
                {(cat) => (
                  <div class="flex items-center gap-2 rounded-sm border border-border px-3 py-2 font-mono text-mini uppercase tracking-wider text-text-muted">
                    <Lock class="size-3.5 shrink-0" strokeWidth={1.75} />
                    <span>Nur {listCategoryLabel(cat())}</span>
                  </div>
                )}
              </Show>
            </div>
            <ResultsBody
              query={query()}
              lastQuery={lastQuery()}
              results={visibleResults()}
              searching={searching()}
              isPending={(r) => pending().has(r.sourceId)}
              isAdded={(r) =>
                added().has(addedKey(targetListId(), r.sourceId))
              }
              canAdd={!!targetListId() && listOptions().length > 0}
              onToggle={onToggle}
            />
          </Show>
        </div>
        </div>
      </Show>

      {/* Search pill — z-50, nav-tier styling (inverted colors, capsule).
          MORPHS from the `+`-button rect on the BottomNav. Gated by <Show>
          on `origin()` so the pill's FIRST render commits to the origin rect
          directly — without that gate, `transition-all` would interpolate
          from the element's default position (0/0/intrinsic) to the origin,
          and the pill would glide in from the viewport corner instead of
          starting precisely on top of the `+`. */}
      <Show when={origin()}>
        <div
          class={`fixed z-50 flex touch-none items-center overflow-hidden bg-nav-bg shadow-floating ${
            props.visible ? "opacity-100" : "opacity-0"
          }`}
          style={{
            ...pillStyle(),
            // Sequential handoff (no crossfade dip): on OPEN, the search-pill
            // rises first (delay 0, dur 50) so it occludes the NavBar before
            // the NavBar fades out (delay 50). On CLOSE, the inverse — the
            // NavBar rises first (delay 400) while the search-pill is still
            // opaque, then the search-pill fades out (delay 450) with the
            // NavBar already at full opacity underneath. Either direction,
            // the combined alpha of "search-pill OR NavBar at the pill
            // location" stays at 1.0 throughout — no visible crossfade.
            transition: [
              "left 500ms var(--ease-quart)",
              "top 500ms var(--ease-quart)",
              "width 500ms var(--ease-quart)",
              "height 500ms var(--ease-quart)",
              `opacity 50ms linear ${props.visible ? "0ms" : "450ms"}`,
            ].join(", "),
          }}
        >
          <div
            class="flex w-full items-center gap-2 px-5"
            style={{
              // Open: fade in after the pill has started expanding (150ms delay).
              // Close: fade out FAST and at the very start, so the input + icon
              // are gone before the pill morphs back to the nav `+` — otherwise
              // the content visibly lingers/slides inside the still-morphing pill
              // (the documented tech-debt).
              opacity: props.visible ? "1" : "0",
              transition: props.visible
                ? "opacity 300ms ease-out 150ms"
                : "opacity 120ms ease-out 0ms",
            }}
          >
            <Search
              aria-hidden
              class="size-4 shrink-0 text-nav-fg/60"
              strokeWidth={1.75}
            />
            <input
              ref={inputEl}
              type="text"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder={`${typeLabel(mediaFilter())} suchen …`}
              class="min-w-0 flex-1 bg-transparent py-2 text-body text-nav-fg placeholder:text-nav-fg/50 focus:outline-none"
              autocomplete="off"
              spellcheck={false}
              enterkeyhint="search"
              aria-label="Suchen"
            />
          </div>
        </div>
      </Show>
    </div>
  );
}

function ResultsBody(props: {
  query: string;
  lastQuery: string;
  results: MediaResult[];
  searching: boolean;
  isPending: (r: MediaResult) => boolean;
  isAdded: (r: MediaResult) => boolean;
  canAdd: boolean;
  onToggle: (r: MediaResult) => void;
}) {
  return (
    <Show
      when={props.query.trim().length >= 2}
      fallback={
        <div class="px-5 py-10 text-center">
          <p class="text-body text-text-muted">
            Tippe einen Titel — Treffer erscheinen während du schreibst.
          </p>
        </div>
      }
    >
      <Show
        when={!props.searching || props.results.length > 0}
        fallback={
          <div class="flex items-center justify-center px-5 py-10 text-text-muted">
            <Loader2 class="mr-2 size-4 animate-spin" strokeWidth={1.75} />
            <span class="font-mono text-mini uppercase tracking-wider">
              Sucht …
            </span>
          </div>
        }
      >
        <Show
          when={props.results.length > 0}
          fallback={
            <div class="px-5 py-10 text-center">
              <p class="text-body text-text">Keine Treffer.</p>
              <p class="mt-1 text-body text-text-muted">
                Versuch's mit dem englischen oder romanisierten Titel.
              </p>
            </div>
          }
        >
          <ul>
            <For each={props.results}>
              {(r) => (
                <ResultRow
                  result={r}
                  added={props.isAdded(r)}
                  pending={props.isPending(r)}
                  canAdd={props.canAdd}
                  onToggle={() => props.onToggle(r)}
                />
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </Show>
  );
}

function ResultRow(props: {
  result: MediaResult;
  added: boolean;
  pending: boolean;
  canAdd: boolean;
  onToggle: () => void;
}) {
  // Whole row is the affordance — same shape as the list rows on /lists.
  // The indicator on the right is a visual status, not a separate button
  // (nested interactive elements aren't great for a11y anyway). Hover lifts
  // the row a tier DOWN to bg (the panel itself is on surface), and the
  // indicator flips to accent via group-hover so the action has a clear
  // pre-commit signal. Once added (✓), the row stays clickable: a second tap
  // removes it again (F5 — undo a mis-tap), with the indicator previewing a ✕
  // on hover.
  return (
    <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
      <button
        type="button"
        onClick={props.onToggle}
        // Don't steal focus from the search input: preventing mousedown's
        // default keeps the caret (and the mobile keyboard) in the field
        // while the click still fires — add a result, keep typing. Without
        // this, every add closed the keyboard and the refocus dance began.
        onMouseDown={(e) => e.preventDefault()}
        disabled={!props.canAdd || props.pending}
        aria-label={
          props.added
            ? `${props.result.title} wieder aus der Liste entfernen`
            : `${props.result.title} zur Liste hinzufügen`
        }
        class="group block w-full text-left transition-colors hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent"
      >
        <div class="flex items-center gap-3 px-5 py-3">
          <div class="size-12 shrink-0 overflow-hidden rounded-xs border border-border bg-surface">
            <Show
              when={props.result.coverUrl}
              fallback={
                <div class="flex size-full items-center justify-center font-mono text-mini text-text-muted">
                  {typeInitial(props.result.type)}
                </div>
              }
            >
              <img
                ref={fadeOnLoad}
                src={props.result.coverUrl!}
                alt=""
                class="size-full object-cover"
                loading="lazy"
              />
            </Show>
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="truncate text-body text-text">{props.result.title}</h4>
            <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
              {typeLabel(props.result.type)}
              {props.result.year ? ` · ${props.result.year}` : ""}
            </p>
          </div>
          <span
            aria-hidden
            class={`relative inline-flex size-8 shrink-0 items-center justify-center rounded-xs border transition-colors ${
              props.added
                ? "border-accent bg-accent text-accent-on"
                : "border-border text-text-muted group-hover:border-accent group-hover:bg-accent group-hover:text-accent-on"
            }`}
          >
            <Show
              when={!props.pending}
              fallback={
                <Loader2 class="size-4 animate-spin" strokeWidth={1.75} />
              }
            >
              <Show
                when={props.added}
                fallback={<Plus class="size-4" strokeWidth={1.75} />}
              >
                {/* ✓ at rest; on hover it previews a − to signal "click to
                    remove" (F5) — same primary fill as the add affordance,
                    minus instead of plus. */}
                <Check class="size-4 group-hover:hidden" strokeWidth={2} />
                <Minus class="hidden size-4 group-hover:block" strokeWidth={2} />
              </Show>
            </Show>
          </span>
        </div>
      </button>
    </li>
  );
}
