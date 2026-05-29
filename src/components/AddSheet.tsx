import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useLocation } from "@solidjs/router";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { Check, Loader2, Plus, Search, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { searchAniList, type AniListResult } from "@/lib/anilist";
import { addItemToList } from "@/lib/queries/items";
import { listsQueryOptions, listsQueryKey } from "@/lib/queries/lists";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";

/**
 * Add/Search sheet — two-piece layout with a liquid morph entrance.
 *
 * The visual idea (Apple-style shared-element transition):
 *
 *   ┌─────────────────────────┐
 *   │ ●HINZUFÜGEN ZU ▾Liste ✕│ ← Card (page-tier: bg, hairlines, hard corners)
 *   ├─────────────────────────┤
 *   │ Result rows …           │
 *   └─────────────────────────┘
 *   [🔍  Anime suchen …       ] ← Search-Pill (nav-tier: nav-bg, capsule)
 *
 *   The Pill MORPHS from the BottomNav's `+`-button rect: it starts at that
 *   button's exact bounding rect (44×44, fully round) and animates left/top/
 *   width/height in lockstep to its target geometry above the (mobile)
 *   keyboard. The `+` in the nav fades to opacity-0 on the same curve, so
 *   it visually reads as the button *becoming* the search tool. The Card
 *   fades in from above on the same timing.
 *
 * Mobile keyboard handling: a visualViewport listener keeps the pill seated
 * above the keyboard as it slides up/down — so typing doesn't push the pill
 * off-screen and the Card resizes to match the available space.
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
export function AddSheet(props: { visible: boolean; onClose: () => void }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();

  // ── List picker (target) ───────────────────────────────────────────────
  const listsQuery = createQuery(() => ({
    ...listsQueryOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  /** Flatten private + shared for the SelectMenu. Order: private first,
   *  shared second — same order the user sees on /lists. */
  const listOptions = (): SelectOption[] => {
    const data = listsQuery.data;
    if (!data) return [];
    return [...data.private, ...data.shared].map((l) => ({
      id: l.id,
      label: l.name,
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
    const fromRoute = code
      ? [...data.private, ...data.shared].find((l) => l.shortCode === code)?.id
      : undefined;
    setTargetListId(fromRoute ?? opts[0].id);
    pickedDefault = true;
  });

  // ── Search ─────────────────────────────────────────────────────────────
  const [query, setQuery] = createSignal("");
  const [results, setResults] = createSignal<AniListResult[]>([]);
  const [searching, setSearching] = createSignal(false);
  // The query string the current `results` were fetched for. Lets the empty-
  // state distinguish "haven't searched yet" from "no hits for this term".
  const [lastQuery, setLastQuery] = createSignal("");

  let abort: AbortController | null = null;
  let debounceTimer: number | null = null;

  createEffect(() => {
    const q = query().trim();
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (q.length < 2) {
      // Don't hammer AniList on the first keystroke.
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
      void searchAniList(q, ctrl.signal).then((rows) => {
        if (ctrl.signal.aborted) return;
        setResults(rows);
        setLastQuery(q);
        setSearching(false);
      });
    }, 220);
  });

  // ── Add a result ───────────────────────────────────────────────────────
  /** Tracks which sourceIds were added in THIS session, scoped to the list
   *  they were added to (so switching lists doesn't carry the ✓ over). */
  const [added, setAdded] = createSignal<Set<string>>(new Set());
  const [pending, setPending] = createSignal<string | null>(null);

  const addedKey = (listId: string, sourceId: string) =>
    `${listId}:${sourceId}`;

  // Reset ✓ marks whenever the user changes the target list — the previous
  // ticks belong to the old list and would be misleading on the new one.
  createEffect(() => {
    void targetListId();
    setAdded(new Set<string>());
  });

  const addMutation = createMutation(() => ({
    mutationFn: (source: AniListResult) =>
      addItemToList({ listId: targetListId(), source }),
    onSuccess: (_, source) => {
      setAdded((prev) => {
        const next = new Set(prev);
        next.add(addedKey(targetListId(), source.sourceId));
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
    onSettled: () => setPending(null),
  }));

  const onAdd = (r: AniListResult) => {
    if (!targetListId()) return;
    if (added().has(addedKey(targetListId(), r.sourceId))) return;
    if (pending() === r.sourceId) return;
    setPending(r.sourceId);
    addMutation.mutate(r);
  };

  // ── Entry/exit transition ──────────────────────────────────────────────
  // The pill morphs from the BottomNav's pill rect to its target rect.
  // Card + backdrop fade/slide on the same 300ms ease-quart curve. The
  // open/closed state is OWNED by AppShell (props.visible) so the nav-pill
  // fade and the search-pill morph stay perfectly synced — see AppShell.tsx
  // for the two-state mount/visible split that enables that.
  const ANIM_MS = 420;
  const [origin, setOrigin] = createSignal<Rect | null>(null);
  /** Bottom-edge offset for the pill — reads as 0 normally, grows when the
   *  mobile soft keyboard pushes the visualViewport up. */
  const [keyboardOffset, setKeyboardOffset] = createSignal(0);
  /** Viewport size — re-evaluated on resize so the pill/card recompute
   *  their target geometry on rotation / window-resize. */
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

    // 2) Lock body scroll, esc-to-close.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

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

    // Focus the input after the morph is well underway so iOS doesn't open
    // the keyboard before the pill has reached its target — that would
    // yank vvOffset mid-transition and look jittery.
    window.setTimeout(() => inputEl?.focus(), ANIM_MS - 50);

    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onResize);
      vv?.removeEventListener("scroll", onResize);
      abort?.abort();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    });
  });

  // ── Target geometry ────────────────────────────────────────────────────
  /** Where the pill should LAND. Height + vertical position match the nav-
   *  pill exactly (so the morph is pure width-expansion, no height jump);
   *  only the width grows and the pill recenters horizontally. When the
   *  mobile soft keyboard appears, we lift the pill above it. */
  const targetRect = (): Rect => {
    const o = origin();
    if (!o) {
      // Sensible fallback while anchor is being measured.
      return { left: 0, top: 0, width: 0, height: 56 };
    }
    const { w, h } = viewport();
    const isDesktop = w >= 768;
    const pillH = o.height;
    const sideGap = 16;
    // Default: same vertical position as the nav-pill. If the keyboard is
    // up, lift the pill so it sits just above the keyboard edge.
    const top =
      keyboardOffset() > 0 ? h - keyboardOffset() - pillH - 16 : o.top;
    if (isDesktop) {
      const width = Math.min(w - 2 * sideGap, 576);
      return {
        left: (w - width) / 2,
        top,
        width,
        height: pillH,
      };
    }
    return {
      left: sideGap,
      top,
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

  /** Card sits just above the pill, fills the space up to the top of the
   *  viewport (minus a small safe-area). */
  const cardStyle = () => {
    const t = targetRect();
    const topGap = 24;
    const innerGap = 12; // space between card and pill
    return {
      left: `${t.left}px`,
      top: `${topGap}px`,
      width: `${t.width}px`,
      height: `${t.top - topGap - innerGap}px`,
    };
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Hinzufügen">
      {/* Backdrop — z-40, ABOVE the BottomNav (z-30). Together with the
          nav-pill fading to opacity-0, this makes the nav effectively
          recede into the background — the search-pill on z-50 is now the
          only active control. Color + blur transition on the same 300ms
          ease-quart as the pill morph. */}
      <button
        type="button"
        aria-label="Schließen"
        onClick={props.onClose}
        class={`fixed inset-0 z-40 transition-all duration-500 [transition-timing-function:var(--ease-quart)] ${
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

        <div class="min-h-0 flex-1 overflow-y-auto">
          <Show
            when={listOptions().length > 0}
            fallback={
              <p class="px-5 py-10 text-center text-body text-text-muted">
                Lege erst eine Liste an, dann kannst du Einträge hinzufügen.
              </p>
            }
          >
            <ResultsBody
              query={query()}
              lastQuery={lastQuery()}
              results={results()}
              searching={searching()}
              pending={pending()}
              isAdded={(r) =>
                added().has(addedKey(targetListId(), r.sourceId))
              }
              canAdd={!!targetListId() && listOptions().length > 0}
              onAdd={onAdd}
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
          class={`fixed z-50 flex items-center overflow-hidden bg-nav-bg shadow-floating ${
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
            class={`flex w-full items-center gap-2 px-5 transition-opacity duration-300 ease-out ${
              props.visible ? "opacity-100 delay-150" : "opacity-0"
            }`}
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
              placeholder="Anime oder Manga suchen …"
              class="min-w-0 flex-1 bg-transparent py-2 text-body text-nav-fg placeholder:text-nav-fg/50 focus:outline-none"
              autocomplete="off"
              spellcheck={false}
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
  results: AniListResult[];
  searching: boolean;
  pending: string | null;
  isAdded: (r: AniListResult) => boolean;
  canAdd: boolean;
  onAdd: (r: AniListResult) => void;
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
                  pending={props.pending === r.sourceId}
                  canAdd={props.canAdd}
                  onAdd={() => props.onAdd(r)}
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
  result: AniListResult;
  added: boolean;
  pending: boolean;
  canAdd: boolean;
  onAdd: () => void;
}) {
  // Whole row is the affordance — same shape as the list rows on /lists.
  // The indicator on the right is a visual status, not a separate button
  // (nested interactive elements aren't great for a11y anyway). Hover lifts
  // the row a tier DOWN to bg (the panel itself is on surface), and the
  // indicator flips to accent via group-hover so the action has a clear
  // pre-commit signal.
  return (
    <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
      <button
        type="button"
        onClick={props.onAdd}
        disabled={!props.canAdd || props.added || props.pending}
        aria-label={
          props.added
            ? `${props.result.title} – bereits hinzugefügt`
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
                  {props.result.type === "manga" ? "M" : "A"}
                </div>
              }
            >
              <img
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
              {props.result.type === "manga" ? "Manga" : "Anime"}
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
                <Check class="size-4" strokeWidth={2} />
              </Show>
            </Show>
          </span>
        </div>
      </button>
    </li>
  );
}
