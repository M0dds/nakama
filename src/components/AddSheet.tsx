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
import {
  listsQueryOptions,
  listsQueryKey,
  listItemsQueryKey,
} from "@/lib/queries/lists";
import { SelectMenu, type SelectOption } from "@/components/SelectMenu";

/**
 * Add/Search sheet. Bottom-sheet on mobile, centered modal on desktop. Flow
 * (mirrors Logbook's validated UX): pick the target list once at the top,
 * search AniList (anime + manga), tap a result to drop it into that list —
 * stay open to add several in one session.
 *
 * Liquid character: the panel slides in on mount, slides out on close (the
 * outer overlay handles the backdrop fade). No teardown-during-flight: the
 * caller (AppLayout) only unmounts AddSheet after the close animation has
 * ended, so we never see a flash of partial state. The +-button in BottomNav
 * is what opens this — when triggered from `/lists/:id` we pre-select that
 * list, so the most common path ("I'm on a list and want to add to it") is
 * a zero-decision flow.
 *
 * Search-as-you-type with a small debounce; AbortController kills in-flight
 * fetches so a fast typist doesn't get rows from an older query trail in.
 */
export function AddSheet(props: { onClose: () => void }) {
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

  /** If we opened the sheet from `/lists/<id>`, pre-select that list. */
  const listIdFromRoute = (): string | null => {
    const m = location.pathname.match(/^\/lists\/([^/]+)$/);
    return m?.[1] ?? null;
  };

  const [targetListId, setTargetListId] = createSignal<string>("");

  // Once the lists load, pick a sensible default: the route's list if we're
  // on a detail page, otherwise the first list. Only do this once, so the
  // user's manual change isn't clobbered by a later realtime refresh.
  let pickedDefault = false;
  createEffect(() => {
    if (pickedDefault) return;
    const opts = listOptions();
    if (opts.length === 0) return;
    const fromRoute = listIdFromRoute();
    const pick =
      (fromRoute && opts.find((o) => o.id === fromRoute)?.id) ?? opts[0].id;
    setTargetListId(pick);
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
    setAdded(new Set());
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
      // Counts on the overview + the items list on the detail page should
      // reflect the new row immediately.
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({
        queryKey: listItemsQueryKey(targetListId()),
      });
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

  // ── Mount: focus the input, lock scroll, esc to close ──────────────────
  let inputEl: HTMLInputElement | undefined;
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Wait a frame so the slide-in transition gets its starting state.
    requestAnimationFrame(() => inputEl?.focus());
    onCleanup(() => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      abort?.abort();
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    });
  });

  // Entry transition — render at opacity 0 / translate-y, flip to 1 / 0 on
  // next frame. Closing is symmetrical: parent unmounts after a short delay.
  const [entered, setEntered] = createSignal(false);
  onMount(() => requestAnimationFrame(() => setEntered(true)));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hinzufügen"
      class={`fixed inset-0 z-50 flex flex-col justify-end transition-opacity duration-200 ease-out md:items-center md:justify-center ${
        entered() ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Backdrop — click to close. */}
      <button
        type="button"
        aria-label="Schließen"
        onClick={props.onClose}
        class="absolute inset-0 bg-bg/80 backdrop-blur-sm"
      />

      {/* Panel — bottom-sheet on mobile, centered card on desktop. */}
      <div
        class={`relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden bg-surface shadow-floating transition-transform duration-300 [transition-timing-function:var(--ease-quart)] md:max-w-xl md:rounded-md ${
          entered() ? "translate-y-0" : "translate-y-6 md:translate-y-3"
        }`}
      >
        <header class="flex items-center justify-between gap-3 border-b border-rule px-5 py-4">
          <div class="flex items-center gap-2">
            <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
            <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
              Hinzufügen
            </span>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="Schließen"
            class="-mr-1 inline-flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-bg hover:text-text"
          >
            <X class="size-4" strokeWidth={1.75} />
          </button>
        </header>

        {/* List picker — fixed at the top so the choice is persistent across
            search churn. */}
        <div class="space-y-3 border-b border-rule px-5 py-4">
          <label class="block font-mono text-mini uppercase tracking-wider text-text-muted">
            Liste
          </label>
          <Show
            when={listOptions().length > 0}
            fallback={
              <p class="text-body text-text-muted">
                Lege erst eine Liste an, dann kannst du Einträge hinzufügen.
              </p>
            }
          >
            <SelectMenu
              value={targetListId()}
              options={listOptions()}
              onChange={setTargetListId}
              ariaLabel="Ziel-Liste"
            />
          </Show>
        </div>

        {/* Search input. */}
        <div class="border-b border-rule px-5 py-4">
          <label class="relative block">
            <span class="sr-only">Suchen</span>
            <Search
              aria-hidden
              class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
              strokeWidth={1.75}
            />
            <input
              ref={inputEl}
              type="text"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
              placeholder="Anime oder Manga suchen …"
              class="block w-full rounded-sm border border-border bg-transparent py-2 pl-9 pr-3 text-body text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
              autocomplete="off"
              spellcheck={false}
            />
          </label>
        </div>

        {/* Results. */}
        <div class="min-h-0 flex-1 overflow-y-auto">
          <ResultsBody
            query={query()}
            lastQuery={lastQuery()}
            results={results()}
            searching={searching()}
            pending={pending()}
            isAdded={(r) => added().has(addedKey(targetListId(), r.sourceId))}
            canAdd={!!targetListId() && listOptions().length > 0}
            onAdd={onAdd}
          />
        </div>
      </div>
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
  return (
    <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
      <div class="flex items-center gap-3 px-5 py-3">
        <div class="size-12 shrink-0 overflow-hidden rounded-xs border border-border bg-bg">
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
            {props.result.format ? ` · ${props.result.format}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onAdd}
          disabled={!props.canAdd || props.added || props.pending}
          aria-label={props.added ? "Hinzugefügt" : "Zur Liste hinzufügen"}
          class={`relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors ${
            props.added
              ? "border-accent bg-accent text-accent-on"
              : "border-border text-text-muted hover:border-accent hover:bg-accent hover:text-accent-on disabled:opacity-40"
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
        </button>
      </div>
    </li>
  );
}
