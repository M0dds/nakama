import { createSignal, For, onCleanup, Show } from "solid-js";
import { useLocation, useParams } from "@solidjs/router";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { ChevronDown, Loader2 } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { highResCover } from "@/lib/anilist";
import { itemQueryOptions } from "@/lib/queries/items";
import { listsQueryKey } from "@/lib/queries/lists";
import {
  episodesQueryKey,
  episodesQueryOptions,
  markEpisodesWatchedUpTo,
  toggleEpisode,
  type EpisodePayload,
  type EpisodeRow,
} from "@/lib/queries/episodes";
import {
  coWatchersOptions,
  type CoWatcher,
} from "@/lib/queries/sharing";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { dateLabel, dayOffset, typeLabel } from "@/lib/format";
import { CoWatcherMark } from "@/components/CoWatcherMark";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { NotFound } from "@/components/NotFound";
import { ResetItemButton } from "@/components/ResetItemButton";
import { SyncToggle } from "@/components/SyncToggle";

const PAGE_SIZE = 26;

/**
 * /item/:type/:slug — Item-Detail. Layout:
 *
 *   Section 01 (left 2/3, "Episoden"):
 *     Fortschritt 12 / 184           (progress bar)
 *     ──────────────────────────
 *     [latest PAGE_SIZE (26) episodes — newest on top, ticked dot right]
 *     ──────────────────────────
 *     ↓  Weitere laden               (when total > loaded)
 *
 *   Section 02 (right 1/3, "Details"):
 *     ┌────────┐
 *     │ cover  │   (no accent plate — sits flat in hairline border)
 *     └────────┘
 *     ──────────────
 *     Typ / Format / Quelle
 *
 * PageHeader aside carries the inline-confirm "Zurücksetzen" button when
 * the caller has at least one watched episode. Single-tap toggles an
 * episode, long-press / right-click cascades up to it; both go through
 * optimistic updates and invalidate on settle to reconcile the true
 * watched count from the server.
 */
export default function ItemDetail() {
  const params = useParams<{ type: string; slug: string }>();
  const auth = useAuth();
  const queryClient = useQueryClient();
  // List context carried via router link state when the item was opened from a
  // list row (see ListDetail). Drives the per-item sync toggle — absent on
  // deep-links / Home / Kalender entries, which deliberately show no toggle.
  const location = useLocation<{ listItemId?: string }>();

  const item = createQuery(() => ({
    ...itemQueryOptions(params.type, params.slug),
    enabled: !!auth.user() && !!params.type && !!params.slug,
  }));

  // Pagination — limit grows by PAGE_SIZE on each "Weitere laden". Each step
  // is its own cache entry (queryKey ends in the limit), so flipping the
  // limit doesn't re-fetch from zero — TanStack keeps the previous payload
  // visible via placeholderData while the next chunk arrives.
  const [limit, setLimit] = createSignal(PAGE_SIZE);

  const episodes = createQuery(() => ({
    ...episodesQueryOptions(auth.user()!, params.type, params.slug, limit()),
    enabled: !!auth.user() && !!params.type && !!params.slug,
    placeholderData: (prev: EpisodePayload | undefined) => prev,
  }));

  // Mitseher: who among the caller's co-members has watched each episode.
  // Keyed by item id; empty for the solo case. Drives the per-row eye marker.
  const coWatchers = createQuery(() => ({
    ...coWatchersOptions(auth.user()!, item.data?.id ?? ""),
    enabled: !!auth.user() && !!item.data?.id,
  }));

  // Item resolved-but-null → render the NotFound surface inline (items are
  // public-ish — the message is just "Eintrag nicht gefunden", no privacy
  // qualifier needed). Replaces the previous silent navigate("/lists")
  // bounce that hid the failure.
  const notFound = () => !item.isLoading && item.data === null;

  // Live updates: a partner ticking an episode (same item, shared list once
  // Phase 7 lands) or a backfill on this item refreshes the local cache.
  // Channel + invalidation key both keyed on (type, slug) — static from
  // params, so safe to register onMount even before item.data lands.
  //
  // Why the lists keys are also invalidated here: the "Neue Folge" badge
  // on /lists rows and /lists/:shortCode item rows is derived from this
  // item's air dates × the caller's watches. Ticking an episode here
  // changes both surfaces' badges; without an invalidation those caches
  // stay stale up to query-client.ts's 5-min staleTime. Prefix ["list"]
  // also catches the single listQueryKey — minor extra refetch, accepted.
  useRealtimeInvalidation(`item-${params.type}-${params.slug}`, [
    {
      table: "episodes",
      invalidates: [
        episodesQueryKey(params.type, params.slug),
        listsQueryKey,
        ["list"],
      ],
    },
    {
      table: "episode_watches",
      invalidates: [
        episodesQueryKey(params.type, params.slug),
        listsQueryKey,
        ["list"],
        // A co-member ticking this item updates the Mitseher overlay.
        ["co-watchers"],
      ],
    },
  ]);

  // ── Mutations ─────────────────────────────────────────────────────────
  // Single-tap toggle. Optimistic: flip the row, adjust the visible watched
  // counter; the head-count refetches via onSettled.
  const toggleMut = createMutation(() => ({
    mutationFn: (ep: EpisodeRow) => {
      const itemId = item.data?.id;
      if (!itemId) return Promise.reject(new Error("Item not loaded"));
      return toggleEpisode({ itemId, episodeId: ep.id, watched: !ep.watched });
    },
    onMutate: (ep: EpisodeRow) => {
      const key = episodesQueryKey(params.type, params.slug);
      const prev = queryClient.getQueryData<EpisodePayload>(key);
      queryClient.setQueryData<EpisodePayload>(key, (old) => {
        if (!old) return old;
        const target = !ep.watched;
        // Exactly one of the two states flips per click: watched→unwatched
        // is -1, unwatched→watched is +1. The previous ternary-on-ternary
        // expanded to the same result through two unreachable branches.
        const delta = ep.watched ? -1 : 1;
        return {
          ...old,
          episodes: old.episodes.map((e) =>
            e.id === ep.id ? { ...e, watched: target } : e,
          ),
          watched: Math.max(0, old.watched + delta),
        };
      });
      return { prev };
    },
    onError: (_e, _ep, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(episodesQueryKey(params.type, params.slug), ctx.prev);
    },
    onSettled: () => {
      // Episode tick + cascade both ripple to: this item's episodes query,
      // the lists overview (newCounts), and every list-detail items query
      // (per-row hasNewEpisode). Prefix ["list"] covers all listItemsQueryKey
      // shortCodes — same item can live in multiple lists.
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(params.type, params.slug),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
    },
  }));

  // Long-press cascade. Optimistic: tick all visible rows ≤ ep.episodeNumber.
  // Note that "visible rows" is only the latest `limit` window (default 26)
  // — so cascading from a recent episode UP doesn't optimistically reflect
  // older episodes outside the window. The server-side RPC marks them all,
  // and onSettled's invalidation pulls the true watched count back. Brief
  // visual flash where the watched counter is lower than reality until the
  // refetch lands; deliberate (estimating the off-window delta from cache
  // would be wrong anyway because cache doesn't carry older watch state).
  //
  // RPC needs the items.id UUID — pulled from item.data, guaranteed loaded
  // by the time an episode row is interactive (EpisodeList only renders
  // when episodes.data is present, which requires the item to resolve).
  const cascadeMut = createMutation(() => ({
    mutationFn: (ep: EpisodeRow) => {
      const itemId = item.data?.id;
      if (!itemId) return Promise.reject(new Error("Item not loaded"));
      return markEpisodesWatchedUpTo({
        itemId,
        upToEpisodeId: ep.id,
      });
    },
    onMutate: (ep: EpisodeRow) => {
      const key = episodesQueryKey(params.type, params.slug);
      const prev = queryClient.getQueryData<EpisodePayload>(key);
      queryClient.setQueryData<EpisodePayload>(key, (old) => {
        if (!old) return old;
        let delta = 0;
        const nextEpisodes = old.episodes.map((e) => {
          if (e.episodeNumber <= ep.episodeNumber && !e.watched) {
            delta += 1;
            return { ...e, watched: true };
          }
          return e;
        });
        return {
          ...old,
          episodes: nextEpisodes,
          watched: old.watched + delta,
        };
      });
      return { prev };
    },
    onError: (_e, _ep, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(episodesQueryKey(params.type, params.slug), ctx.prev);
    },
    onSettled: () => {
      // Episode tick + cascade both ripple to: this item's episodes query,
      // the lists overview (newCounts), and every list-detail items query
      // (per-row hasNewEpisode). Prefix ["list"] covers all listItemsQueryKey
      // shortCodes — same item can live in multiple lists.
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(params.type, params.slug),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
    },
  }));

  const onTap = (ep: EpisodeRow) => toggleMut.mutate(ep);
  const onCascade = (ep: EpisodeRow) => cascadeMut.mutate(ep);

  const dtClass =
    "font-mono text-mini uppercase tracking-wider text-text-muted";

  return (
    <Show when={!notFound()} fallback={<NotFound kind="item" />}>
    <main class="w-full">
      <PageHeader
        kicker={
          <Show
            when={item.data}
            fallback={
              <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
                …
              </span>
            }
          >
            {(data) => (
              <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
                {typeLabel(data().type).toUpperCase()}
              </span>
            )}
          </Show>
        }
        title={
          <Show when={item.data} fallback={<span>…</span>}>
            {(data) => <span>{data().title}</span>}
          </Show>
        }
        backHref="/lists"
        aside={
          <Show when={item.data && (episodes.data?.watched ?? 0) > 0}>
            <ResetItemButton
              itemId={item.data!.id}
              type={params.type}
              slug={params.slug}
            />
          </Show>
        }
      />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Section 01 — Episode-Listing */}
        <div class="md:w-2/3">
          <BentoModule label="Episoden" number="01">
            <Show
              when={item.data}
              fallback={
                <p class="text-body text-text-muted">Lade …</p>
              }
            >
              {(itemData) => (
                <>
                  <ProgressBar
                    watched={episodes.data?.watched ?? 0}
                    total={episodes.data?.total ?? 0}
                  />
                  <Show
                    when={!episodes.isLoading}
                    fallback={
                      <p class="mt-6 text-body text-text-muted">
                        Lade Episoden …
                      </p>
                    }
                  >
                    <Show
                      when={
                        episodes.data && episodes.data.episodes.length > 0
                      }
                      fallback={
                        <EpisodesEmpty
                          fetchable={episodes.data?.fetchable ?? false}
                          type={itemData().type}
                        />
                      }
                    >
                      <EpisodeList
                        rows={episodes.data!.episodes}
                        itemType={params.type}
                        coWatchers={coWatchers.data ?? {}}
                        onTap={onTap}
                        onCascade={onCascade}
                      />
                      <Show
                        when={
                          episodes.data!.total >
                          episodes.data!.episodes.length
                        }
                      >
                        <LoadMore
                          loading={episodes.isFetching}
                          onLoad={() => setLimit((l) => l + PAGE_SIZE)}
                        />
                      </Show>
                    </Show>
                  </Show>
                </>
              )}
            </Show>
          </BentoModule>
        </div>

        {/* Section 02 — Cover + Details */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Details" number="02">
            <Show
              when={item.data}
              fallback={
                <p class="text-body text-text-muted">Lade …</p>
              }
            >
              {(data) => (
                <>
                  <Cover
                    coverUrl={data().coverUrl}
                    fallbackLetter={data().type === "manga" ? "M" : "A"}
                  />
                  <dl class="space-y-3 border-t border-border pt-5 text-body">
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class={dtClass}>Typ</dt>
                      <dd class="text-text">{typeLabel(data().type)}</dd>
                    </div>
                    <Show when={metaString(data().metadata, "format")}>
                      {(fmt) => (
                        <div class="flex items-baseline justify-between gap-3">
                          <dt class={dtClass}>Format</dt>
                          <dd class="text-text">{fmt()}</dd>
                        </div>
                      )}
                    </Show>
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class={`${dtClass} shrink-0`}>Quelle</dt>
                      <dd class="min-w-0 truncate text-right font-mono text-mini uppercase tracking-wider text-text">
                        {data().source} · {data().sourceId}
                      </dd>
                    </div>
                  </dl>

                  {/* Sync toggle — only when opened via a shared list (the
                      SyncToggle self-gates on isShared && memberCount > 1). */}
                  <Show when={location.state?.listItemId}>
                    {(listItemId) => (
                      <SyncToggle
                        listItemId={listItemId()}
                        itemId={data().id}
                        type={params.type}
                        slug={params.slug}
                      />
                    )}
                  </Show>
                </>
              )}
            </Show>
          </BentoModule>
        </div>
      </div>
    </main>
    </Show>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Local primitives
// ──────────────────────────────────────────────────────────────────────

/**
 * Cover — flat, hairline-bordered, hard corners. Sits at the top of the
 * Details column and uses the column's full reading width (cap at 220 px so
 * it doesn't grow ridiculous on very wide layouts). No accent, no shadow —
 * the cover is the visual anchor by virtue of being the only image on the
 * page, not by chrome.
 */
function Cover(props: { coverUrl: string | null; fallbackLetter: string }) {
  return (
    <div class="mb-5 aspect-[2/3] w-full max-w-[220px] overflow-hidden border border-border bg-bg">
      <Show
        when={props.coverUrl}
        fallback={
          <div class="flex size-full items-center justify-center font-mono text-mini text-text-muted">
            {props.fallbackLetter}
          </div>
        }
      >
        {/* Up to 220 px wide, so the stored `/cover/medium/` URL (~230 px
            native) tips into pixelated territory on retina. highResCover
            swaps in `/cover/large/` (~430 px) — same host. */}
        <img
          src={highResCover(props.coverUrl)!}
          alt=""
          class="size-full object-cover"
          loading="lazy"
        />
      </Show>
    </div>
  );
}

/**
 * Thin progress strip — hairline track (border-tier) with accent fill. Mono
 * caption row above. When total is unknown (Episode-Layer not yet wired),
 * `total` is 0; we show "—" instead of "0" and render an empty track.
 */
function ProgressBar(props: { watched: number; total: number }) {
  const pct = () =>
    props.total > 0 ? Math.round((props.watched / props.total) * 100) : 0;
  return (
    <div>
      <div class="flex items-baseline justify-between gap-3">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          Fortschritt
        </span>
        <span class="font-mono text-mini tabular-nums text-text">
          {props.watched}/{props.total > 0 ? props.total : "—"}
          <Show when={props.total > 0}>
            <span class="text-text-muted"> · {pct()} %</span>
          </Show>
        </span>
      </div>
      <div
        class="mt-2 h-1 w-full overflow-hidden bg-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={props.total || undefined}
        aria-valuenow={props.watched}
      >
        <div
          class="h-full bg-accent transition-all duration-300 ease-quart"
          style={{ width: `${pct()}%` }}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function metaString(
  metadata: Record<string, unknown> | null,
  key: string,
): string | null {
  const v = metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

// ──────────────────────────────────────────────────────────────────────
// Episode list
// ──────────────────────────────────────────────────────────────────────

/**
 * Latest 12 episodes/chapters, newest on top. Each row is a button:
 *   - Tap (or click) → toggle just this episode
 *   - Long-press 500 ms (or right-click on desktop) → cascade-mark all
 *     episodes ≤ this one as watched (the "bis hier alles" gesture)
 *
 * Hover bg bleeds to the column edge (-mx-5 ul), hairlines between rows,
 * accent dot right-aligned for watched state.
 */
function EpisodeList(props: {
  rows: EpisodeRow[];
  itemType: string;
  coWatchers: Record<string, CoWatcher[]>;
  onTap: (ep: EpisodeRow) => void;
  onCascade: (ep: EpisodeRow) => void;
}) {
  return (
    <ul class="-mx-5">
      <For each={props.rows}>
        {(ep) => (
          <EpisodeListRow
            ep={ep}
            itemType={props.itemType}
            watchers={props.coWatchers[ep.id] ?? []}
            onTap={() => props.onTap(ep)}
            onCascade={() => props.onCascade(ep)}
          />
        )}
      </For>
    </ul>
  );
}

const LONG_PRESS_MS = 500;

function EpisodeListRow(props: {
  ep: EpisodeRow;
  itemType: string;
  watchers: CoWatcher[];
  onTap: () => void;
  onCascade: () => void;
}) {
  const released = () =>
    !props.ep.airDate || new Date(props.ep.airDate) <= new Date();

  // Day-bucket tag, based on calendar-day offset (NOT clock time): airDate
  // today = "Heute" even if it already aired this morning; tomorrow = "Morgen";
  // further out = "Demnächst". Past dates get no tag. Independent of the
  // released() check above which still drives the text-muted dimming.
  const tagLabel = () => {
    if (!props.ep.airDate) return null;
    const offset = dayOffset(props.ep.airDate);
    if (offset === 0) return "Heute";
    if (offset === 1) return "Morgen";
    if (offset > 1) return "Demnächst";
    return null;
  };

  // Long-press machinery — pointer events so touch + mouse + stylus share
  // one event stream (no duplicate-fire from iOS's synthetic click after
  // touchend). `fired` lets the subsequent click event know that the
  // long-press already handled the press and the click should no-op.
  let timer: number | null = null;
  let fired = false;
  const [pressing, setPressing] = createSignal(false);

  const cancelTimer = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    // Ignore right-button mouse downs — they go through onContextMenu
    // instead, which fires the cascade directly without the 500 ms wait.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    fired = false;
    setPressing(true);
    cancelTimer();
    timer = window.setTimeout(() => {
      fired = true;
      timer = null;
      setPressing(false);
      props.onCascade();
    }, LONG_PRESS_MS);
  };

  const stopPress = () => {
    cancelTimer();
    setPressing(false);
  };

  const onClick = (e: MouseEvent) => {
    // If the long-press already fired, swallow the trailing click so we
    // don't also tap the row.
    if (fired) {
      e.preventDefault();
      fired = false;
      return;
    }
    props.onTap();
  };

  const onContextMenu = (e: MouseEvent) => {
    // Power-user shortcut on desktop: right-click cascades immediately.
    e.preventDefault();
    cancelTimer();
    setPressing(false);
    fired = true; // suppress the click that may follow
    props.onCascade();
  };

  onCleanup(cancelTimer);

  return (
    <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={stopPress}
        onPointerLeave={stopPress}
        onPointerCancel={stopPress}
        onClick={onClick}
        onContextMenu={onContextMenu}
        aria-label={
          props.ep.watched
            ? `Episode ${props.ep.episodeNumber}, gesehen. Tippen zum Entfernen, lang halten für „bis hier alles"`
            : `Episode ${props.ep.episodeNumber}. Tippen zum Markieren, lang halten für „bis hier alles"`
        }
        class="group block w-full text-left transition-colors hover:bg-surface"
        classList={{ "bg-surface": pressing() }}
      >
        <div class="flex items-center gap-3 px-5 py-3">
          <span
            class={`w-8 shrink-0 font-mono text-mini font-medium tabular-nums tracking-wider ${
              released() ? "text-text" : "text-text-muted"
            }`}
          >
            {String(props.ep.episodeNumber).padStart(2, "0")}
          </span>
          <span
            class={`min-w-0 flex-1 truncate text-body ${
              released() ? "text-text" : "text-text-muted"
            }`}
          >
            {/* Title fallback splits by release status: released-without-title
                stays a placeholder em-dash (old anime where the data source
                just doesn't have it), unreleased gets a sentence so the user
                knows it's a "will be revealed" gap, not a data hole. */}
            <Show
              when={props.ep.title}
              fallback={
                released() ? (
                  <span class="font-mono text-mini text-text-muted">—</span>
                ) : (
                  <span class="text-text-muted">
                    {unknownTitleLabel(props.itemType)}
                  </span>
                )
              }
            >
              {props.ep.title}
            </Show>
          </span>
          {/* Right cluster — tag (variable, possibly absent) + a FIXED-WIDTH
              date column so the tag's right edge sits at the same x across
              every row. Without the fixed date width the tag floated left/right
              depending on the date's character count. */}
          <div class="flex shrink-0 items-baseline gap-3 font-mono text-mini uppercase tracking-wider tabular-nums">
            <Show when={tagLabel()}>
              <span class="text-accent">{tagLabel()}</span>
            </Show>
            <span class="w-20 shrink-0 text-right text-text-muted">
              <Show when={props.ep.airDate} fallback={<>—</>}>
                {dateLabel(props.ep.airDate!)}
              </Show>
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <CoWatcherMark watchers={props.watchers} />
            <span
              aria-hidden
              class={`size-2 shrink-0 rounded-full transition-colors ${
                props.ep.watched
                  ? "bg-accent"
                  : "bg-transparent ring-1 ring-border"
              }`}
            />
          </div>
        </div>
      </button>
    </li>
  );
}

/** "Weitere laden" — sits BELOW the EpisodeList. The wrapping div bleeds
 *  to the column edges (-mx-5) so the inner button's hover bg fills the
 *  full row width, matching the list-row hover bleed. The button itself
 *  is intentionally NOT shaped like a Button primitive: just centered mono
 *  caption + chevron, with bg-surface on hover — visually a continuation
 *  of the list, not a CTA. */
function LoadMore(props: { loading: boolean; onLoad: () => void }) {
  return (
    <div class="-mx-5">
      <button
        type="button"
        onClick={props.onLoad}
        disabled={props.loading}
        class="block w-full px-5 py-3.5 transition-colors hover:bg-surface disabled:cursor-default disabled:opacity-60"
      >
        <div class="flex items-center justify-center gap-2 font-mono text-mini uppercase tracking-wider text-text-muted">
          <Show
            when={props.loading}
            fallback={
              <ChevronDown class="size-3.5" strokeWidth={1.75} />
            }
          >
            <Loader2 class="size-3.5 animate-spin" strokeWidth={1.75} />
          </Show>
          <span>{props.loading ? "Lädt …" : "Weitere laden"}</span>
        </div>
      </button>
    </div>
  );
}

function EpisodesEmpty(props: { fetchable: boolean; type: string }) {
  return (
    <div class="mt-6 px-4 py-8">
      <Show
        when={props.fetchable}
        fallback={
          <>
            <p class="text-body text-text">Episoden noch nicht verfügbar.</p>
            <p class="mt-1.5 max-w-md text-body text-text-muted">
              Für{" "}
              {props.type === "movie"
                ? "Filme"
                : props.type === "game"
                  ? "Spiele"
                  : "diesen Typ"}{" "}
              landet die Status-Anzeige in einer der nächsten Iterationen.
            </p>
          </>
        }
      >
        <p class="text-body text-text">Noch keine Episoden.</p>
        <p class="mt-1.5 max-w-md text-body text-text-muted">
          AniList hat aktuell keine zählbaren Folgen für diesen Eintrag —
          kann passieren bei sehr neuen oder noch unangekündigten Werken.
        </p>
      </Show>
    </div>
  );
}

/** Fallback for unreleased episodes with no title yet — AniList only fills
 *  streamingEpisodes.title once the episode actually airs, so future rows
 *  almost always have title=null. The em-dash placeholder was honest but
 *  cold; this reads as "title will follow" instead of "data hole". Manga
 *  uses des-Kapitels grammar, otherwise der-Folge. */
function unknownTitleLabel(type: string): string {
  return type === "manga"
    ? "Name des Kapitels ist noch nicht bekannt"
    : "Name der Folge ist noch nicht bekannt";
}
