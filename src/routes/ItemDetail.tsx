import { createEffect, createSignal, For, Index, onCleanup, Show } from "solid-js";
import { A, useLocation, useParams } from "@solidjs/router";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { ChevronLeft, ChevronRight } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { fetchAniListDetails, type AniListDetails } from "@/lib/anilist";
import { coverFor } from "@/lib/cover";
import { fadeOnLoad } from "@/lib/image-fade";
import {
  fetchTmdbMovieDetails,
  fetchTmdbSeriesDetails,
  type TmdbCastMember,
  type TmdbSeriesDetails,
} from "@/lib/tmdb";
import {
  fetchSteamGameDetails,
  type SteamScreenshot,
} from "@/lib/steam";
import {
  itemQueryOptions,
  setItemReleaseDate,
  type ItemDetails,
} from "@/lib/queries/items";
import {
  movieSeenKey,
  movieSeenOptions,
  reconcileEpisodicCompletion,
  setItemSeen,
} from "@/lib/queries/status";
import { listsQueryKey } from "@/lib/queries/lists";
import {
  EPISODE_PAGE_SIZE,
  episodesQueryKey,
  episodesQueryOptions,
  markEpisodesWatchedUpTo,
  toggleEpisode,
  type EpisodePayload,
  type EpisodeRow,
} from "@/lib/queries/episodes";
import {
  coWatchersOptions,
  listItemByContextOptions,
  movieCoWatchersOptions,
  syncContextOptions,
  syncedListsForItemOptions,
  type CoWatcher,
} from "@/lib/queries/sharing";
import { useRealtimeInvalidation } from "@/lib/realtime";
import {
  dateLabelShortYear,
  dateLabelYear,
  dayOffset,
  snapToWeekday,
  typeInitial,
  typeLabel,
} from "@/lib/format";
import { globalDisplayPrefsOptions } from "@/lib/queries/display-prefs";
import { CoWatcherMark } from "@/components/CoWatcherMark";
import { CoverBackdrop } from "@/components/CoverBackdrop";
import { QueryErrorCard } from "@/components/QueryErrorCard";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { NotFound } from "@/components/NotFound";
import { ResetItemButton } from "@/components/ResetItemButton";
import { SyncToggle } from "@/components/SyncToggle";
import { Pager } from "@/components/Pager";
import { ItemNotes } from "@/components/ItemNotes";

/**
 * /item/:type/:slug — Item-Detail. Layout:
 *
 *   Section 01 (left 2/3, "Episoden"):
 *     Fortschritt 12 / 184           (progress bar)
 *     ──────────────────────────
 *     [one page of EPISODE_PAGE_SIZE (26) — newest on top, ticked dot right]
 *     ──────────────────────────
 *     ‹ 1 2 … 7 8 9 … 43 ›           (numbered Pager when total > one page)
 *
 *   Section 02 (right 1/3, "Details"):
 *     ┌────────┐
 *     │ cover  │   (no accent plate — sits flat in hairline border)
 *     └────────┘
 *     ──────────────
 *     Typ / Format / Quelle
 *
 * PageHeader aside carries the "Zurücksetzen" button (confirms via the
 * app-wide ConfirmDialog) when the caller has at least one watched episode.
 * Single-tap toggles an
 * episode, long-press / right-click cascades up to it; both go through
 * optimistic updates and invalidate on settle to reconcile the true
 * watched count from the server.
 */
export default function ItemDetail() {
  // shortCode is present only on the list-scoped route
  // (/lists/:shortCode/item/:type/:slug); absent on the global /item route.
  const params = useParams<{ type: string; slug: string; shortCode?: string }>();
  const auth = useAuth();
  const queryClient = useQueryClient();
  // List context (sync-instances). Two entry points:
  //   - list-scoped route → resolve the list_item from the shortCode in the
  //     URL (reload-stable, survives a refresh).
  //   - global route opened from a list row → router link-state carries the
  //     listItemId (no shortCode). Both deliberately absent on Home / Kalender
  //     / search entries → context-free global page (no sync toggle).
  const location = useLocation<{
    listItemId?: string;
    syncEnabled?: boolean;
  }>();

  // Reload-stable resolve from the URL shortCode (only on the list-scoped
  // route). Link-state is preferred when present (instant, no round-trip);
  // this is the fallback that makes a refresh work.
  const resolvedLI = createQuery(() => ({
    ...listItemByContextOptions(params.shortCode!, params.type, params.slug),
    enabled:
      !!auth.user() && !!params.shortCode && !!params.type && !!params.slug,
  }));
  const listItemId = (): string | null =>
    location.state?.listItemId ?? resolvedLI.data ?? null;

  // Sync context for that list_item — feeds the SyncToggle (shared cache key,
  // so no duplicate fetch) and, on reload, the sync flag.
  const syncCtx = createQuery(() => ({
    ...syncContextOptions(listItemId()!),
    enabled: !!auth.user() && !!listItemId(),
  }));
  // Sync flag for the active list_item. syncCtx is the LIVE truth (invalidated
  // + optimistically patched by the SyncToggle), so it takes precedence the
  // moment it's available; the link-state value is only a pre-load hint to
  // avoid a flash on navigation. (Crucial: link-state can be a STALE `false`
  // — it's a snapshot from navigation time and `history.state` survives a hard
  // reload — so we must NOT let it win via `??` after sync gets turned on.)
  const syncEnabled = (): boolean | undefined =>
    syncCtx.data?.syncEnabled ?? location.state?.syncEnabled;
  // The instance-lane id: the list_item id ONLY when sync is actually on, else
  // null (= global progress). Mirrors the RPCs' lane rule; drives which watch
  // rows the episode reads count.
  const instanceLI = (): string | null =>
    syncEnabled() && listItemId() ? listItemId() : null;
  // Whether we yet know which lane to read. A page with no list context is
  // always global → ready. With a list context we must learn the sync flag
  // first, so we don't briefly render the wrong lane's numbers: ready once
  // link-state carries it, or the resolve + sync-context queries have settled.
  const laneReady = (): boolean => {
    if (!params.shortCode && !location.state?.listItemId) return true;
    if (location.state?.syncEnabled !== undefined) return true;
    if (!listItemId()) return resolvedLI.isFetched;
    return syncCtx.isFetched;
  };
  // The list this item is opened through, if any — the scope of the shared
  // notes board (section 03). Null on the global item page (Home/search/
  // calendar entry), where there's no single list to attach notes to.
  const notesListId = (): string | null => syncCtx.data?.listId ?? null;

  // Display-weekday override of the CURRENT lane — the same value the
  // DisplayWeekdayPicker edits: synced instance → group-shared (syncContext),
  // else the viewer's per-user global override. The episode list snaps its
  // displayed dates with it, so the page agrees with Was kommt / calendar /
  // badge (which all snap already) instead of contradicting them with the
  // raw origin dates. Snapping only moves forward, so a row shown as
  // available is always really released (tickable server-side).
  const displayPrefs = createQuery(() => ({
    ...globalDisplayPrefsOptions(auth.user()!),
    enabled:
      !!auth.user() && (params.type === "anime" || params.type === "series"),
  }));
  const displayWeekday = (): number | null =>
    instanceLI()
      ? syncCtx.data?.displayWeekday ?? null
      : item.data
        ? displayPrefs.data?.get(item.data.id) ?? null
        : null;

  // Header kicker: with list context the page reads as "inside that list"
  // (matching the back target), so the line above the title carries the LIST
  // name; context-free entries keep the media-type label. Held at "…" while
  // the context resolves — otherwise the type label would flash first and
  // swap to the list name.
  const hasListContext = (): boolean =>
    !!params.shortCode || !!location.state?.listItemId;
  const kickerLabel = (): string | null => {
    if (hasListContext()) return syncCtx.data?.listName ?? null;
    return item.data ? typeLabel(item.data.type).toUpperCase() : null;
  };

  const item = createQuery(() => ({
    ...itemQueryOptions(params.type, params.slug),
    enabled: !!auth.user() && !!params.type && !!params.slug,
  }));

  // Lane hint (global page only): synced instances of this item across the
  // caller's lists. The context-free route shows the GLOBAL lane — if the item
  // is actually watched as a synced instance, the Details module says so and
  // links over (mirrors Was kommt / Fortsetzen linking sole instances
  // list-scoped). Skipped with list context (you're already in a lane).
  const syncedLists = createQuery(() => ({
    ...syncedListsForItemOptions(item.data?.id ?? ""),
    enabled: !!auth.user() && !!item.data?.id && !listItemId(),
  }));

  // Pagination — the numbered Pager swaps a fixed EPISODE_PAGE_SIZE window
  // instead of growing one long list (the One-Piece case). Each page is its
  // own cache entry (queryKey ends in page + lane), and placeholderData keeps
  // the current page visible while the next one fetches — a clean hard swap.
  const [page, setPage] = createSignal(1);

  const episodes = createQuery(() => ({
    ...episodesQueryOptions(
      auth.user()!,
      params.type,
      params.slug,
      page(),
      instanceLI(),
    ),
    enabled:
      !!auth.user() &&
      !!params.type &&
      !!params.slug &&
      params.type !== "movie" &&
      laneReady(),
    placeholderData: (prev: EpisodePayload | undefined) => prev,
  }));

  const pageCount = () =>
    Math.max(1, Math.ceil((episodes.data?.total ?? 0) / EPISODE_PAGE_SIZE));

  // Clamp if the page falls off the end (e.g. total shrank after a refetch, or
  // switching lanes/items). Keeps the Pager and the query in lockstep.
  createEffect(() => {
    if (page() > pageCount()) setPage(pageCount());
  });

  // The exact cache key the episodes query lives under right now (prefix +
  // page + lane). The optimistic patches must target THIS, not the bare prefix
  // — getQueryData/setQueryData need an exact match, and the lane is part of
  // the key. Invalidations below still use the prefix to clear every page +
  // both lanes at once.
  const epKey = () =>
    [...episodesQueryKey(params.type, params.slug), page(), instanceLI()] as const;

  // Mitseher eye — ONLY when the item is opened through a SHARED list, and only
  // for THAT list's members. A private list / the global item page / a
  // non-shared list show no eye at all (a private tracker must never reveal
  // others' progress). Lane-matched (global vs this synced instance) and gated
  // on laneReady so it never queries the wrong lane.
  // Episode ids of the page the list is currently showing — the eye reads
  // co-watch state for just this window (avoids Supabase's 1000-row cap that
  // truncated the whole-show fetch at episode 1000 on long shows).
  const visibleEpisodeIds = (): string[] =>
    (episodes.data?.episodes ?? []).map((e) => e.id);

  const coWatchers = createQuery(() => ({
    ...coWatchersOptions(
      auth.user()!,
      item.data?.id ?? "",
      syncCtx.data?.listId ?? "",
      instanceLI(),
      visibleEpisodeIds(),
    ),
    enabled:
      !!auth.user() &&
      !!item.data?.id &&
      params.type !== "movie" &&
      laneReady() &&
      !!syncCtx.data?.isShared &&
      !!syncCtx.data?.listId &&
      visibleEpisodeIds().length > 0,
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
        // Keep Home (Fortsetzen) + Kalender fresh too — they unmount here.
        ["home"],
        ["calendar"],
      ],
    },
    {
      // Films: a co-member marking this film seen updates the eye + the
      // caller's own seen-state flows the same way (own write also fires here).
      table: "item_history",
      invalidates: [["movie-co-watchers"], ["movie-seen"]],
    },
    {
      // Shared notes board: a co-member adding/removing a note updates it live.
      table: "item_notes",
      invalidates: [["item-notes"]],
    },
  ]);

  // ── Mutations ─────────────────────────────────────────────────────────
  // Single-tap toggle. Optimistic: flip the row, adjust the visible watched
  // counter; the head-count refetches via onSettled.
  const toggleMut = createMutation(() => ({
    mutationFn: (ep: EpisodeRow) => {
      const itemId = item.data?.id;
      if (!itemId) return Promise.reject(new Error("Item not loaded"));
      // Always pass the listItemId (if any) — the RPC decides global vs
      // instance from the list_item's sync flag.
      return toggleEpisode({
        itemId,
        episodeId: ep.id,
        watched: !ep.watched,
        listItemId: listItemId(),
      });
    },
    onMutate: (ep: EpisodeRow) => {
      const key = epKey();
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
      return { prev, key };
    },
    onError: (_e, _ep, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ctx.key, ctx.prev);
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
      // Home (Fortsetzen) + Kalender unmount during an item visit, so a tick
      // here would leave their caches stale until staleTime. Refresh both so
      // own progress is reflected the moment we navigate back.
      void queryClient.invalidateQueries({ queryKey: ["home"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  }));

  // Long-press cascade. Optimistic: tick all visible rows up to ep, ordered
  // by (season, episode) so per-season numbering doesn't cross seasons.
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
        listItemId: listItemId(),
      });
    },
    onMutate: (ep: EpisodeRow) => {
      const key = epKey();
      const prev = queryClient.getQueryData<EpisodePayload>(key);
      queryClient.setQueryData<EpisodePayload>(key, (old) => {
        if (!old) return old;
        let delta = 0;
        const nextEpisodes = old.episodes.map((e) => {
          // Season-aware "up to": episode_number resets per season on TMDB
          // series, so comparing the number alone would tick S2's early
          // episodes when cascading inside S1 (and miss S1's later ones).
          // Order by (season, episode) to match the server-side RPC.
          const atOrBefore =
            e.seasonNumber < ep.seasonNumber ||
            (e.seasonNumber === ep.seasonNumber &&
              e.episodeNumber <= ep.episodeNumber);
          if (atOrBefore && !e.watched) {
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
      return { prev, key };
    },
    onError: (_e, _ep, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ctx.key, ctx.prev);
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
      // Home (Fortsetzen) + Kalender unmount during an item visit, so a tick
      // here would leave their caches stale until staleTime. Refresh both so
      // own progress is reflected the moment we navigate back.
      void queryClient.invalidateQueries({ queryKey: ["home"] });
      void queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
  }));

  const onTap = (ep: EpisodeRow) => {
    completionInteracted = true;
    toggleMut.mutate(ep);
  };
  const onCascade = (ep: EpisodeRow) => {
    completionInteracted = true;
    cascadeMut.mutate(ep);
  };

  // ── Abschluss-Moment (Review P3 #2) ──────────────────────────────────
  // Completed = the current lane's watched count reaches the stored total
  // AND the source says the show is done (metadata.finished, refreshed by
  // the episode re-store). Converged into the caller's item_history
  // 'completed' row — the same stamp the movie/game seen-toggle writes —
  // which feeds the Logbuch 'status' event and the list-row marker.
  //
  // Stamping also runs PASSIVELY (visits heal: pre-feature completions,
  // partner completions via sync fan-out) — safe because a PASSIVE stamp is
  // backdated to the latest own watch, so an old finish lands outside the
  // Logbuch window instead of faking a fresh event. A LIVE completion (an
  // explicit tick here) stamps NOW instead — the effect fires off the
  // optimistic cache while the completing tick's RPC is still in flight, so
  // deriving the timestamp from episode_watches would find only the old
  // watches and silently backdate a genuinely fresh Abschluss (= no feed
  // event). RETRACTING only follows an explicit tick on this page: the
  // global lane of an instance-completed item legitimately reads 0/N, and a
  // passive delete there would wrongly tear down the instance completion.
  const episodic = () =>
    params.type === "anime" ||
    params.type === "series" ||
    params.type === "manga";
  const seenQ = createQuery(() => ({
    ...movieSeenOptions(auth.user()!, item.data?.id ?? ""),
    enabled: !!auth.user() && !!item.data && episodic(),
  }));
  let completionInteracted = false;
  let completionPending = false;
  createEffect(() => {
    const user = auth.user();
    const itemData = item.data;
    const ep = episodes.data;
    const stamped = seenQ.data;
    if (!user || !itemData || !ep || stamped === undefined) return;
    if (!episodic() || !laneReady()) return;
    const complete =
      ep.total > 0 &&
      ep.watched >= ep.total &&
      itemData.metadata?.finished === true;
    if (complete === stamped) return;
    if (!complete && !completionInteracted) return;
    if (completionPending) return;
    completionPending = true;
    reconcileEpisodicCompletion({
      user,
      itemId: itemData.id,
      complete,
      live: completionInteracted,
      instanceListItemId: instanceLI(),
    })
      .catch((e) => console.error("abschluss reconcile failed", e))
      .finally(() => {
        completionPending = false;
        void queryClient.invalidateQueries({
          queryKey: movieSeenKey(itemData.id),
        });
        // The stamp is feed + list-row material (Logbuch 'status' event,
        // "Abgeschlossen" marker).
        void queryClient.invalidateQueries({ queryKey: ["home"] });
        void queryClient.invalidateQueries({ queryKey: listsQueryKey });
        void queryClient.invalidateQueries({ queryKey: ["list"] });
      });
  });

  // Films + games have no episodes: the left column becomes a binary
  // seen/played-toggle + rich metadata (MoviePanel via TMDB, GamePanel via
  // Steam) instead of the progress bar + episode list. Keyed off the URL type
  // so it's synchronous + reload-stable. `isBinary` gathers both episode-less
  // types where they behave identically (no sync toggle, no episode fetch).
  const isMovie = () => params.type === "movie";
  const isGame = () => params.type === "game";
  const isBinary = () => isMovie() || isGame();

  const dtClass =
    "font-mono text-mini uppercase tracking-wider text-text-muted";

  return (
    <Show
      when={!notFound()}
      fallback={
        <NotFound
          kind="item"
          backHref={params.shortCode ? `/lists/${params.shortCode}` : "/"}
        />
      }
    >
    <main class="relative w-full">
      <CoverBackdrop coverUrl={item.data?.coverUrl ?? null} />
      <PageHeader
        kicker={
          <span class="truncate font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
            {kickerLabel() ?? "…"}
          </span>
        }
        title={
          <Show when={item.data} fallback={<span>…</span>}>
            {(data) => <span>{data().title}</span>}
          </Show>
        }
        backHref={params.shortCode ? `/lists/${params.shortCode}` : "/"}
        aside={
          <Show when={item.data && (episodes.data?.watched ?? 0) > 0}>
            <ResetItemButton
              itemId={item.data!.id}
              title={item.data!.title}
              type={params.type}
              slug={params.slug}
              listItemId={listItemId()}
              synced={syncEnabled() === true}
            />
          </Show>
        }
      />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Section 01 — Episode-Listing. On mobile it drops BELOW the Details
            column (so the cover sits at the top): order-2 + a top rule to
            separate it from the section above; the number flips to 02. From md
            up it returns to its native first/left slot (01, no top rule —
            the ColumnGuide handles the vertical split). */}
        <div class="order-2 border-t border-rule md:order-1 md:w-2/3 md:border-t-0">
          <BentoModule
            label={isGame() ? "Spiel" : isMovie() ? "Film" : "Episoden"}
            number="01"
            mobileNumber={notesListId() ? "03" : "02"}
          >
            <Show
              when={item.data}
              fallback={
                <p class="text-body text-text-muted">Lade …</p>
              }
            >
              {(itemData) => (
                <Show
                  when={!isBinary()}
                  fallback={
                    isGame() ? (
                      <GamePanel
                        item={itemData()}
                        listId={syncCtx.data?.listId ?? null}
                        isShared={!!syncCtx.data?.isShared}
                      />
                    ) : (
                      <MoviePanel
                        item={itemData()}
                        listId={syncCtx.data?.listId ?? null}
                        isShared={!!syncCtx.data?.isShared}
                      />
                    )
                  }
                >
                <>
                  <ProgressBar
                    watched={episodes.data?.watched ?? 0}
                    total={episodes.data?.total ?? 0}
                  />
                  {/* Error gate FIRST — a failed query must not fall through
                      to the episode empty-state or an eternal "Lade …". */}
                  <Show
                    when={!episodes.isError}
                    fallback={
                      <QueryErrorCard
                        class="mt-6"
                        onRetry={() => void episodes.refetch()}
                      />
                    }
                  >
                  <Show
                    when={!episodes.isLoading && laneReady()}
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
                        displayWeekday={displayWeekday()}
                        onTap={onTap}
                        onCascade={onCascade}
                      />
                      <Pager
                        page={page()}
                        pageCount={pageCount()}
                        onPage={setPage}
                      />
                    </Show>
                  </Show>
                  </Show>
                </>
                </Show>
              )}
            </Show>
          </BentoModule>
        </div>

        {/* Section 02 — Cover + Details. On mobile it leads (order-1, no top
            rule) so the cover is the first thing seen; the number flips to 01.
            From md up it returns to the right column (02). */}
        <div class="order-1 md:order-2 md:w-1/3">
          <BentoModule label="Details" number="02" mobileNumber="01">
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
                    fallbackLetter={typeInitial(data().type)}
                    wide={isGame()}
                  />
                  <dl class="space-y-3 border-t border-border pt-5 text-body">
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class={dtClass}>Typ</dt>
                      <dd class="text-text">{typeLabel(data().type)}</dd>
                    </div>
                    <Show when={isMovie()}>
                      <MovieFacts item={data()} />
                    </Show>
                    <Show when={isGame()}>
                      <GameFacts item={data()} />
                    </Show>
                    <Show when={metaString(data().metadata, "format")}>
                      {(fmt) => (
                        <div class="flex items-baseline justify-between gap-3">
                          <dt class={dtClass}>Format</dt>
                          <dd class="text-text">{fmt()}</dd>
                        </div>
                      )}
                    </Show>
                    {/* Genre / Studio / Erschienen for series/anime/manga — the
                        episodic counterpart to MovieFacts/GameFacts (F12). */}
                    <Show when={!isBinary()}>
                      <EpisodicFacts item={data()} />
                    </Show>
                  </dl>

                  {/* Sync toggle — only when opened with a list context
                      (list-scoped route or link-state) AND episodic. Films +
                      games track a binary state in item_history, not
                      per-episode watches, so episode-sync doesn't apply. */}
                  <Show when={!isBinary() && listItemId()}>
                    {(li) => (
                      <SyncToggle
                        listItemId={li()}
                        itemId={data().id}
                        type={params.type}
                        slug={params.slug}
                      />
                    )}
                  </Show>

                  {/* Lane hint — the SyncToggle's counterpart for the GLOBAL
                      (context-free) page: this page reads your own lane, so if
                      the item is actually watched as a synced instance, say so
                      and link over (mirrors Was kommt / Fortsetzen linking
                      sole instances list-scoped). */}
                  <Show
                    when={
                      !isBinary() &&
                      !listItemId() &&
                      (syncedLists.data?.length ?? 0) > 0
                    }
                  >
                    <div class="mt-5 border-t border-border pt-5">
                      <p class="mb-1 font-mono text-mini uppercase tracking-wider text-text-muted">
                        Gesynct geschaut in
                      </p>
                      <For each={syncedLists.data!}>
                        {(l) => (
                          <A
                            href={`/lists/${l.shortCode}/item/${params.type}/${params.slug}`}
                            state={{
                              listItemId: l.listItemId,
                              syncEnabled: true,
                            }}
                            class="block truncate text-body text-accent underline-offset-2 hover:underline"
                          >
                            {l.name}
                          </A>
                        )}
                      </For>
                      <p class="mt-2 text-mini text-text-muted">
                        Diese Seite zeigt deinen eigenen, ungeteilten Stand —
                        der gemeinsame Fortschritt lebt in der Liste.
                      </p>
                    </div>
                  </Show>

                  {/* Anzeige-Tag — DEACTIVATED (2026-07-07). The manual
                      release-day override confused more than it helped: lanes
                      could diverge, and the Was-kommt click-through landed in a
                      different lane than the entry it came from showed. The
                      picker is unmounted; migration 20260707120000 reset all
                      stored overrides. The lane plumbing (snapToWeekday,
                      DisplayLane, displayWeekday reads) stays dormant — with
                      every weekday null all snaps are no-ops. To bring it back,
                      remount <DisplayWeekdayPicker/> here (git history). */}
                </>
              )}
            </Show>
          </BentoModule>

          {/* Section 03 — shared notes (text + link blocks). Only with a list
              context: notes attach to (list, item), so the global item page
              (no single list) doesn't show it. A hairline separates it from
              Details. mobileNumber 02 — on mobile it sits between Details (01)
              and the episode/film/game section (03). */}
          <Show when={notesListId() && item.data?.id}>
            <BentoModule
              label="Notizen"
              number="03"
              mobileNumber="02"
              class="border-t border-border"
            >
              <ItemNotes listId={notesListId()!} itemId={item.data!.id} />
            </BentoModule>
          </Show>
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
function Cover(props: {
  coverUrl: string | null;
  fallbackLetter: string;
  /** Landscape source (Steam game header) → fill the full column width.
   *  Portrait posters stay height-capped so they don't swallow the screen. */
  wide?: boolean;
}) {
  // No forced aspect — the image keeps its NATURAL ratio (no crop):
  //  • wide (landscape): w-full fills the column edge-to-edge, h-auto keeps
  //    the ratio. The column is now framed/capped so "full width" is bounded.
  //  • poster (portrait): w-auto + max-w-full + max-h scale it DOWN to fit,
  //    bounding it by HEIGHT (a poster at full column width would be enormous).
  // Border sits on the <img> so it hugs the picture, not a wider box.
  return (
    <Show
      when={props.coverUrl}
      fallback={
        <div class="mb-5 flex aspect-[2/3] w-full max-w-[220px] items-center justify-center border border-border bg-bg font-mono text-mini text-text-muted">
          {props.fallbackLetter}
        </div>
      }
    >
      {/* coverFor sharpens the poster per source (AniList medium→large for a
          crisp poster, Steam header→capsule); TMDB URLs pass through. */}
      <img
        ref={fadeOnLoad}
        src={coverFor(props.coverUrl)!}
        alt=""
        class={`mb-5 block h-auto border border-border bg-bg ${
          props.wide ? "w-full" : "max-h-[460px] w-auto max-w-full"
        }`}
        loading="lazy"
      />
    </Show>
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
  /** Current lane's Anzeige-Tag override — rows snap their displayed dates. */
  displayWeekday: number | null;
  onTap: (ep: EpisodeRow) => void;
  onCascade: (ep: EpisodeRow) => void;
}) {
  // Multi-season works (TMDB series) carry real season numbers; AniList
  // anime/manga are flat (always season 1). When more than season 1 shows up,
  // group by season with a labeled divider — otherwise the episode numbering
  // silently resets (…S2E1 right after S1E10) with no visible boundary. Rows
  // arrive season-desc / episode-desc, so consecutive same-season runs are
  // already contiguous; we just slice them.
  const multiSeason = () => props.rows.some((r) => r.seasonNumber > 1);
  const groups = () => groupBySeason(props.rows);

  const row = (ep: EpisodeRow) => (
    <EpisodeListRow
      ep={ep}
      itemType={props.itemType}
      watchers={props.coWatchers[ep.id] ?? []}
      displayWeekday={props.displayWeekday}
      onTap={() => props.onTap(ep)}
      onCascade={() => props.onCascade(ep)}
    />
  );

  return (
    <Show
      when={multiSeason()}
      fallback={
        <ul class="-mx-5">
          <For each={props.rows}>{row}</For>
        </ul>
      }
    >
      {/* Index over groups (their position is stable across a tick — only an
          episode's `watched` flips), so the season blocks don't remount on
          every toggle; the inner For keys rows by reference so just the tapped
          one updates. mt-5 keeps the first "Staffel" label off the progress
          bar above it (the flat list gets that gap from the first row's py-3). */}
      <div class="-mx-5 mt-5">
        <Index each={groups()}>
          {(g, i) => (
            <div class={i > 0 ? "mt-7" : ""}>
              <div class="px-5 pb-2 font-mono text-mini uppercase tracking-wider text-text-muted">
                Staffel {g().season}
              </div>
              <ul>
                <For each={g().rows}>{row}</For>
              </ul>
            </div>
          )}
        </Index>
      </div>
    </Show>
  );
}

/** Slice season-desc/episode-desc rows into contiguous same-season groups. */
function groupBySeason(
  rows: EpisodeRow[],
): { season: number; rows: EpisodeRow[] }[] {
  const groups: { season: number; rows: EpisodeRow[] }[] = [];
  for (const ep of rows) {
    const last = groups[groups.length - 1];
    if (last && last.season === ep.seasonNumber) {
      last.rows.push(ep);
    } else {
      groups.push({ season: ep.seasonNumber, rows: [ep] });
    }
  }
  return groups;
}

const LONG_PRESS_MS = 500;

function EpisodeListRow(props: {
  ep: EpisodeRow;
  itemType: string;
  watchers: CoWatcher[];
  displayWeekday: number | null;
  onTap: () => void;
  onCascade: () => void;
}) {
  // Displayed date = the real air date snapped to the lane's Anzeige-Tag —
  // the same day this episode occupies in Was kommt / calendar / badge. The
  // row shows ONE truth with the rest of the app; the raw origin date only
  // lives on in the DB (and in the server's release gate, which the forward-
  // only snap can never contradict).
  const displayAir = () =>
    props.ep.airDate
      ? snapToWeekday(props.ep.airDate, props.displayWeekday)
      : null;

  // Day-based, matching the app-wide date-only rule: an episode counts as
  // released from the day it airs — no clock gate (drives the text dimming;
  // ticking itself is day-gated server-side in mark_episodes_watched_upto).
  const released = () => {
    const air = displayAir();
    return !air || dayOffset(air) <= 0;
  };

  // Day-bucket tag: airDate today = "Heute" all day, tomorrow = "Morgen",
  // further out = "Demnächst". Past dates get no tag.
  const tagLabel = () => {
    const air = displayAir();
    if (!air) return null;
    const offset = dayOffset(air);
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
            <span class="w-24 shrink-0 text-right text-text-muted">
              <Show when={displayAir()} fallback={<>—</>}>
                {dateLabelShortYear(displayAir()!)}
              </Show>
            </span>
          </div>
          <div class="ml-1.5 flex shrink-0 items-center gap-3">
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

// ──────────────────────────────────────────────────────────────────────
// Film detail (no episodes → seen-toggle + rich TMDB metadata)
// ──────────────────────────────────────────────────────────────────────

const DT_CLASS = "font-mono text-mini uppercase tracking-wider text-text-muted";

/** One right-aligned fact row, matching the Details column's dl rhythm. */
function Fact(props: { label: string; value: string }) {
  return (
    <div class="flex items-baseline justify-between gap-3">
      <dt class={`${DT_CLASS} shrink-0`}>{props.label}</dt>
      <dd class="min-w-0 text-right text-text">{props.value}</dd>
    </div>
  );
}

/** Live catalogue facts for the episodic types — Genre, Studio (anime) /
 *  Sender (series), Erschienen-Jahr — so series/anime/manga get the same rich
 *  Details a film/game has (F12). Not in items.metadata; fetched on demand
 *  (AniList for anime/manga, TMDB /tv for series) + cached a day. Each row only
 *  renders once its value resolves, so they fade in without a layout gap; manga
 *  simply has no studio row. */
function episodicDetailsQueryOptions(item: ItemDetails) {
  const isSeries = item.type === "series";
  return {
    queryKey: ["episodic-details", item.source, item.sourceId] as const,
    // Explicit union return — the conditional otherwise infers as just the
    // AniList shape and the TMDB branch fails to assign.
    queryFn: (): Promise<AniListDetails | TmdbSeriesDetails | null> =>
      isSeries
        ? fetchTmdbSeriesDetails(item.sourceId)
        : fetchAniListDetails(item.sourceId),
    enabled: !!item.sourceId,
    staleTime: 1000 * 60 * 60 * 24,
  };
}

function EpisodicFacts(props: { item: ItemDetails }) {
  const q = createQuery(() => episodicDetailsQueryOptions(props.item));
  const isSeries = () => props.item.type === "series";
  const genres = () => q.data?.genres ?? [];
  // Studio (anime) vs broadcasting network (series); manga has neither. `in`
  // narrows the union without an unsafe cast between the two shapes.
  const org = () => {
    const d = q.data;
    if (!d) return null;
    if ("networks" in d) return d.networks[0] ?? null;
    if ("studios" in d) return d.studios[0] ?? null;
    return null;
  };
  const year = () => (q.data?.year != null ? String(q.data.year) : null);

  return (
    <>
      <Show when={year()}>
        {(y) => <Fact label="Erschienen" value={y()} />}
      </Show>
      <Show when={genres().length > 0}>
        <Fact label="Genre" value={genres().slice(0, 3).join(", ")} />
      </Show>
      <Show when={org()}>
        {(o) => <Fact label={isSeries() ? "Sender" : "Studio"} value={o()} />}
      </Show>
    </>
  );
}

/** The binary status-toggle — echoes the episode-tick optic: a full-bleed
 *  tappable row with the accent dot on the right that fills when done. Label
 *  flips so a single binary reads unambiguously (episodes keep a static label +
 *  dot, but here there's no episode number to anchor the state). `verb` is the
 *  German past participle ("gesehen" for films, "gespielt" for games) — the
 *  done-label is its capitalized form, the toggle reads "Als {verb} markieren". */
function BinaryStatusRow(props: {
  done: boolean;
  verb: "gesehen" | "gespielt";
  watchers: CoWatcher[];
  releaseDate: string | null;
  onToggle: () => void;
}) {
  const doneLabel = () =>
    props.verb.charAt(0).toUpperCase() + props.verb.slice(1); // "Gesehen"/"Gespielt"
  // Day-bucket tag, same wording as the episode rows — but "Demnächst" only
  // inside a 2-week window (a release 8 months out shouldn't read as imminent).
  // Past releases get no tag, just the date. Date-only → no time.
  const tag = () => {
    if (!props.releaseDate) return null;
    const offset = dayOffset(props.releaseDate);
    if (offset === 0) return "Heute";
    if (offset === 1) return "Morgen";
    if (offset > 1 && offset <= 14) return "Demnächst";
    return null;
  };

  return (
    <div class="-mx-5">
      <button
        type="button"
        onClick={props.onToggle}
        aria-pressed={props.done}
        aria-label={
          props.done
            ? `Als un${props.verb} markieren`
            : `Als ${props.verb} markieren`
        }
        class="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface"
      >
        <span class="min-w-0 flex-1 text-body text-text">
          {props.done ? doneLabel() : `Als ${props.verb} markieren`}
        </span>
        {/* Release date + day-tag — same cluster as an episode row's air date. */}
        <Show when={props.releaseDate}>
          <div class="flex shrink-0 items-baseline gap-3 font-mono text-mini uppercase tracking-wider tabular-nums">
            <Show when={tag()}>
              <span class="text-accent">{tag()}</span>
            </Show>
            <span class="text-right text-text-muted">
              {dateLabelYear(props.releaseDate!)}
            </span>
          </div>
        </Show>
        {/* Mitseher eye + status dot — same right cluster as an episode row. */}
        <div class="flex shrink-0 items-center gap-2">
          <CoWatcherMark watchers={props.watchers} />
          <span
            aria-hidden
            class={`size-2.5 rounded-full transition-colors ${
              props.done
                ? "bg-accent"
                : "bg-transparent ring-1 ring-border group-hover:ring-text-muted"
            }`}
          />
        </div>
      </button>
    </div>
  );
}

/** Shared TMDB movie-details query — both the left panel (overview + cast) and
 *  the right Details column (facts) read it under the same key, so TanStack
 *  serves both from one fetch. Credits don't change → a day-long staleTime. */
function movieDetailsQueryOptions(source: string, sourceId: string) {
  return {
    queryKey: ["tmdb-movie", sourceId] as const,
    queryFn: () => fetchTmdbMovieDetails(sourceId),
    enabled: source === "tmdb" && !!sourceId,
    staleTime: 1000 * 60 * 60 * 24,
  };
}

/**
 * Left-column body for a film. Seen-toggle at the top (item_history), then the
 * "meaty" TMDB material that earns the column's width: the description (with
 * tagline) and the cast with headshots + character names. The short facts
 * (Regie, Laufzeit, Genres, Kinostart, FSK) live in the right Details column
 * instead — they read as facts, like a series' Typ/Format/Quelle.
 *
 * Details are fetched live from TMDB (not stored): credits don't change, so
 * TanStack's cache + a day-long staleTime is enough and items stays lean.
 */
function MoviePanel(props: {
  item: ItemDetails;
  listId: string | null;
  isShared: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const seen = createQuery(() => ({
    ...movieSeenOptions(auth.user()!, props.item.id),
    enabled: !!auth.user(),
  }));

  // Mitseher — only when the film is opened through a SHARED list, only that
  // list's members. Mirrors the episode eye's privacy gate (RLS +
  // item_history_select_co make co-members' rows visible at all).
  const coWatchers = createQuery(() => ({
    ...movieCoWatchersOptions(auth.user()!, props.item.id, props.listId ?? ""),
    enabled:
      !!auth.user() && !!props.item.id && props.isShared && !!props.listId,
  }));

  const details = createQuery(() =>
    movieDetailsQueryOptions(props.item.source, props.item.sourceId),
  );

  // Backfill the German release date into items.metadata once TMDB resolves it
  // — so "Was kommt" reads the right date even for films added before the DE
  // date was known (or whose date TMDB later corrected). Fire-and-forget, once.
  // Guard per item id, NOT a one-shot boolean: this panel instance stays
  // mounted across warm-cached navigations (the <Show> stays truthy), so a
  // boolean would early-return for every item after the first and the second
  // film/game would never get its releaseDate stamped → missing from "Was
  // kommt" until a fresh page load.
  let backfilledFor: string | null = null;
  createEffect(() => {
    const rel = details.data?.releaseDate;
    if (!rel || backfilledFor === props.item.id) return;
    const current = (props.item.metadata as Record<string, unknown> | null)
      ?.releaseDate;
    if (current === rel) return;
    backfilledFor = props.item.id;
    setItemReleaseDate(props.item.id, props.item.metadata, rel)
      .then(() => queryClient.invalidateQueries({ queryKey: ["home"] }))
      .catch(() => {});
  });

  const seenMut = createMutation(() => ({
    mutationFn: (next: boolean) =>
      setItemSeen({ user: auth.user()!, itemId: props.item.id, seen: next }),
    onMutate: async (next) => {
      const key = movieSeenKey(props.item.id);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData(key, next);
      return { prev, key };
    },
    onError: (_e, _n, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: movieSeenKey(props.item.id),
      });
      // The stamp also drives the list-row done-marker + the Logbuch
      // 'status' event — refresh both surfaces' caches.
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  }));

  const isSeen = () => seen.data ?? false;

  return (
    <>
      <Show when={props.item.source === "tmdb"}>
        <Show
          when={details.data}
          fallback={
            <p class="text-body text-text-muted">
              {details.isLoading
                ? "Lade Filmdaten …"
                : "Keine Zusatzinfos verfügbar."}
            </p>
          }
        >
          {(d) => (
            <div class="space-y-6">
              <Show when={d().tagline || d().overview}>
                <div class="space-y-2">
                  <Show when={d().tagline}>
                    {(line) => (
                      <p class="text-body-lg italic text-text-muted">
                        {line()}
                      </p>
                    )}
                  </Show>
                  <Show when={d().overview}>
                    {(text) => (
                      <p class="text-body leading-relaxed text-text">
                        {text()}
                      </p>
                    )}
                  </Show>
                </div>
              </Show>

              <Show when={d().cast.length > 0}>
                <div class="border-t border-border pt-5">
                  <div class={`${DT_CLASS} mb-3`}>Besetzung</div>
                  {/* Auto-FIT grid: empty trailing columns collapse, so the
                      cards stretch via 1fr to fill the row edge-to-edge (equal
                      padding to both column edges). 5rem floor sets how many
                      fit before wrapping; a partial last row stays left-aligned.
                      (auto-fill would leave phantom columns → a gap at the
                      right edge.) */}
                  <ul class="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-x-4 gap-y-5">
                    <For each={d().cast}>{(c) => <CastRow member={c} />}</For>
                  </ul>
                </div>
              </Show>
            </div>
          )}
        </Show>
      </Show>

      {/* Seen-toggle below the content, matching the game panel: the binary
          state is the actionable footer of the panel. */}
      <div class="mt-6 border-t border-border">
        <BinaryStatusRow
          done={isSeen()}
          verb="gesehen"
          watchers={coWatchers.data ?? []}
          releaseDate={details.data?.releaseDate ?? null}
          onToggle={() => seenMut.mutate(!isSeen())}
        />
      </div>
    </>
  );
}

/** One cast card — a portrait headshot (2:3, like a filmstrip frame) with name
 *  + character beneath. Cards sit in a flex-wrap row, so they fill a line and
 *  wrap to the next. Initial-letter fallback when TMDB has no photo. */
function CastRow(props: { member: TmdbCastMember }) {
  return (
    <li>
      <div class="aspect-[2/3] w-full overflow-hidden rounded-xs border border-border bg-surface">
        <Show
          when={props.member.profileUrl}
          fallback={
            <div class="flex size-full items-center justify-center font-mono text-mini text-text-muted">
              {props.member.name.charAt(0)}
            </div>
          }
        >
          <img
            ref={fadeOnLoad}
            src={props.member.profileUrl!}
            alt=""
            class="size-full object-cover"
            loading="lazy"
          />
        </Show>
      </div>
      <p class="mt-1.5 line-clamp-2 text-body leading-tight text-text">
        {props.member.name}
      </p>
      <Show when={props.member.character}>
        {(role) => (
          <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
            {role()}
          </p>
        )}
      </Show>
    </li>
  );
}

/** Movie facts for the right Details column — Regie/Laufzeit/Genres/Kinostart/
 *  FSK. Reads the same shared movie-details cache as the left MoviePanel, so
 *  no second fetch. */
/** German full-date label for a film's release ("15. März 2024"). UTC-midnight
 *  ISO renders on the correct local day for DE (+TZ); see format.ts note. */
function releaseLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function MovieFacts(props: { item: ItemDetails }) {
  const details = createQuery(() =>
    movieDetailsQueryOptions(props.item.source, props.item.sourceId),
  );
  return (
    <Show when={details.data}>
      {(d) => (
        <>
          <Show when={d().directors.length > 0}>
            <Fact label="Regie" value={d().directors.join(", ")} />
          </Show>
          <Show when={d().runtime}>
            {(rt) => <Fact label="Laufzeit" value={`${rt()} Min.`} />}
          </Show>
          <Show when={d().genres.length > 0}>
            <Fact label="Genres" value={d().genres.join(" · ")} />
          </Show>
          {/* Release date as a fact too (it also sits in the seen-row on the
              left, but that's easy to miss). Full date with year here; label
              flips on whether the film is still upcoming. */}
          <Show when={d().releaseDate}>
            {(rd) => (
              <Fact
                label={new Date(rd()) > new Date() ? "Kinostart" : "Erschienen"}
                value={releaseLabel(rd())}
              />
            )}
          </Show>
          <Show when={d().certification}>
            {(fsk) => <Fact label="FSK" value={fsk()} />}
          </Show>
        </>
      )}
    </Show>
  );
}

/** Shared Steam game-details query — the left panel (description) and the right
 *  Details column (facts) read it under one key, so TanStack serves both from a
 *  single fetch. Store data rarely changes → a day-long staleTime. */
function steamDetailsQueryOptions(source: string, sourceId: string) {
  return {
    queryKey: ["steam-game", sourceId] as const,
    queryFn: () => fetchSteamGameDetails(sourceId),
    enabled: source === "steam" && !!sourceId,
    staleTime: 1000 * 60 * 60 * 24,
  };
}

/**
 * Left-column body for a game — the episode-less, Steam-backed twin of
 * MoviePanel. Played-toggle at the top (item_history, binary, reusing the same
 * movieSeen* machinery), then the short store description. Facts (Entwickler,
 * Publisher, Genres, Release, Metacritic) live in the right Details column.
 *
 * Details are fetched live from Steam (via the proxy), not stored — same
 * rationale as films. The release date is backfilled into items.metadata once
 * resolved (Steam search carries no date) so "Was kommt" can surface an
 * upcoming game, mirroring MoviePanel.
 */
function GamePanel(props: {
  item: ItemDetails;
  listId: string | null;
  isShared: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const played = createQuery(() => ({
    ...movieSeenOptions(auth.user()!, props.item.id),
    enabled: !!auth.user(),
  }));

  const coWatchers = createQuery(() => ({
    ...movieCoWatchersOptions(auth.user()!, props.item.id, props.listId ?? ""),
    enabled:
      !!auth.user() && !!props.item.id && props.isShared && !!props.listId,
  }));

  const details = createQuery(() =>
    steamDetailsQueryOptions(props.item.source, props.item.sourceId),
  );

  // Backfill the ISO release date into items.metadata once Steam resolves it
  // (only when the store string parsed to a real date — fuzzy "Q2 2025" stays
  // null). Fire-and-forget, once. Same pattern as MoviePanel.
  // Guard per item id, NOT a one-shot boolean: this panel instance stays
  // mounted across warm-cached navigations (the <Show> stays truthy), so a
  // boolean would early-return for every item after the first and the second
  // film/game would never get its releaseDate stamped → missing from "Was
  // kommt" until a fresh page load.
  let backfilledFor: string | null = null;
  createEffect(() => {
    const rel = details.data?.releaseDate;
    if (!rel || backfilledFor === props.item.id) return;
    const current = (props.item.metadata as Record<string, unknown> | null)
      ?.releaseDate;
    if (current === rel) return;
    backfilledFor = props.item.id;
    setItemReleaseDate(props.item.id, props.item.metadata, rel)
      .then(() => queryClient.invalidateQueries({ queryKey: ["home"] }))
      .catch(() => {});
  });

  const playedMut = createMutation(() => ({
    mutationFn: (next: boolean) =>
      setItemSeen({ user: auth.user()!, itemId: props.item.id, seen: next }),
    onMutate: async (next) => {
      const key = movieSeenKey(props.item.id);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData(key, next);
      return { prev, key };
    },
    onError: (_e, _n, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: movieSeenKey(props.item.id),
      });
      // The stamp also drives the list-row done-marker + the Logbuch
      // 'status' event — refresh both surfaces' caches.
      void queryClient.invalidateQueries({ queryKey: ["list"] });
      void queryClient.invalidateQueries({ queryKey: ["home"] });
    },
  }));

  const isPlayed = () => played.data ?? false;

  return (
    <>
      <Show when={props.item.source === "steam"}>
        <Show
          when={details.data}
          fallback={
            <p class="text-body text-text-muted">
              {details.isLoading
                ? "Lade Spieldaten …"
                : "Keine Zusatzinfos verfügbar."}
            </p>
          }
        >
          {(d) => (
            <div class="space-y-6">
              <Show when={d().screenshots.length > 0}>
                <ScreenshotGallery shots={d().screenshots} />
              </Show>
              <Show when={d().description}>
                {(text) => (
                  <p class="text-body leading-relaxed text-text">{text()}</p>
                )}
              </Show>
            </div>
          )}
        </Show>
      </Show>

      {/* Played-toggle below the content: for a game the binary state is
          secondary to the screenshots + description. A top divider sets it
          apart as the actionable footer of the panel. */}
      <div class="mt-6 border-t border-border">
        <BinaryStatusRow
          done={isPlayed()}
          verb="gespielt"
          watchers={coWatchers.data ?? []}
          releaseDate={details.data?.releaseDate ?? null}
          onToggle={() => playedMut.mutate(!isPlayed())}
        />
      </div>
    </>
  );
}

/**
 * Screenshot gallery for the game panel — a large hero image with a thumbnail
 * strip beneath, flanked by prev/next arrows. Arrows step the selection
 * (clamped at the ends); clicking a thumbnail jumps to it. The active thumb
 * scrolls into view so the strip follows the selection. The hero re-mounts on
 * change (keyed Show) so fadeOnLoad fades each new shot in.
 */
function ScreenshotGallery(props: { shots: SteamScreenshot[] }) {
  const [sel, setSel] = createSignal(0);
  const thumbEls: (HTMLButtonElement | undefined)[] = [];

  const count = () => props.shots.length;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(count() - 1, i));
    setSel(next);
    thumbEls[next]?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  };

  return (
    <div class="space-y-2">
      {/* Hero — keyed so each selection re-mounts the img → fadeOnLoad fires. */}
      <div class="relative aspect-video w-full overflow-hidden border border-border bg-bg">
        <Show when={props.shots[sel()]} keyed>
          {(shot) => (
            <img
              ref={fadeOnLoad}
              src={shot.full}
              alt=""
              class="absolute inset-0 size-full object-cover"
            />
          )}
        </Show>
      </div>

      {/* Thumbnail strip flanked by arrows. Hidden when there's only one shot. */}
      <Show when={count() > 1}>
        <div class="flex items-center gap-2">
          <GalleryArrow
            dir="prev"
            disabled={sel() === 0}
            onClick={() => go(sel() - 1)}
          />
          <div class="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-none">
            <Index each={props.shots}>
              {(shot, i) => (
                <button
                  ref={(el) => (thumbEls[i] = el)}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Screenshot ${i + 1}`}
                  aria-pressed={sel() === i}
                  class={`relative aspect-video w-20 shrink-0 overflow-hidden border transition-opacity [transition-timing-function:var(--ease-quart)] ${
                    sel() === i
                      ? "border-accent"
                      : "border-border opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={shot().thumb}
                    alt=""
                    class="absolute inset-0 size-full object-cover"
                    loading="lazy"
                  />
                </button>
              )}
            </Index>
          </div>
          <GalleryArrow
            dir="next"
            disabled={sel() === count() - 1}
            onClick={() => go(sel() + 1)}
          />
        </div>
      </Show>
    </div>
  );
}

/** Prev/next arrow for the screenshot strip — hard-cornered icon button, muted
 *  at the ends. Matches the app's icon-button language (rounded-xs). */
function GalleryArrow(props: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.dir === "prev" ? "Vorheriges Bild" : "Nächstes Bild"}
      class="inline-flex size-8 shrink-0 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      {props.dir === "prev" ? (
        <ChevronLeft class="size-4" strokeWidth={1.75} aria-hidden />
      ) : (
        <ChevronRight class="size-4" strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}

/** Game facts for the right Details column — Entwickler/Publisher/Genres/
 *  Release/Metacritic. Reads the same shared Steam-details cache as the left
 *  GamePanel, so both render from one fetch. */
function GameFacts(props: { item: ItemDetails }) {
  const details = createQuery(() =>
    steamDetailsQueryOptions(props.item.source, props.item.sourceId),
  );
  return (
    <Show when={details.data}>
      {(d) => (
        <>
          <Show when={d().developers.length > 0}>
            <Fact label="Entwickler" value={d().developers.join(", ")} />
          </Show>
          <Show when={d().publishers.length > 0}>
            <Fact label="Publisher" value={d().publishers.join(", ")} />
          </Show>
          <Show when={d().genres.length > 0}>
            <Fact label="Genres" value={d().genres.join(" · ")} />
          </Show>
          {/* Release: prefer the parsed full date (with year); else the raw
              store string ("Q2 2025", "Demnächst"). Label flips on coming_soon. */}
          <Show when={d().releaseDate || d().releaseDateRaw}>
            <Fact
              label={d().comingSoon ? "Erscheint" : "Erschienen"}
              value={
                d().releaseDate
                  ? releaseLabel(d().releaseDate!)
                  : d().releaseDateRaw!
              }
            />
          </Show>
          <Show when={d().metacritic !== null}>
            <Fact label="Metacritic" value={String(d().metacritic)} />
          </Show>
        </>
      )}
    </Show>
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
