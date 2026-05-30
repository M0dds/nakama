import { createSignal, For, Match, Show, Switch } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { Check, Clock, Crown, Eye, EyeOff, ListPlus } from "lucide-solid";
import { highResCover } from "@/lib/anilist";
import { useAuth } from "@/lib/auth";
import {
  continueWatchingOptions,
  homeQueryKey,
  recentlyTickedOptions,
  upcomingEpisodesOptions,
  type ContinueItem,
  type ListAddEvent,
  type LogbookEvent,
  type MissedEvent,
  type TransferEvent,
  type UpcomingItem,
  type WatchBundle,
} from "@/lib/queries/home";
import {
  episodesQueryKey,
  markEpisodesWatchedUpTo,
} from "@/lib/queries/episodes";
import { listsQueryKey } from "@/lib/queries/lists";
import {
  dayOffset,
  episodeCode,
  formatDate,
  newReleaseLabel,
  nextLabel,
  rangeLabel,
  relTime,
  typeInitial,
  typeLabel,
} from "@/lib/format";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";

/**
 * Home dashboard — three derived modules, layout mirrors Logbook's `/`:
 *
 *   01 Was kommt   — accordion timeline of next-release-per-tracked-item
 *                    (left 2/3)
 *   02 Fortsetzen  — accordion rows for mid-watch items (left 2/3, stacked)
 *   03 Logbuch     — bundled-watch feed (right 1/3, full vertical)
 *
 * Each module owns its query + empty state. Realtime invalidates the
 * `["home"]` prefix on any episode_watches / episodes / list_items change,
 * so all three branches refetch in step.
 */
export default function Home() {
  const auth = useAuth();

  const continueQ = createQuery(() => ({
    ...continueWatchingOptions(auth.user()!),
    enabled: !!auth.user(),
  }));
  const upcomingQ = createQuery(() => ({
    ...upcomingEpisodesOptions(auth.user()!),
    enabled: !!auth.user(),
  }));
  const logbookQ = createQuery(() => ({
    ...recentlyTickedOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  useRealtimeInvalidation("home", [
    { table: "episode_watches", invalidates: [homeQueryKey] },
    { table: "episodes", invalidates: [homeQueryKey] },
    { table: "list_items", invalidates: [homeQueryKey] },
    { table: "list_members", invalidates: [homeQueryKey] },
    { table: "list_ownership_transfers", invalidates: [homeQueryKey] },
  ]);

  return (
    <main class="w-full">
      <PageHeader title="Willkommen." aside={<TodayLabel />} />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Linke Spalte 2/3 — Was kommt + Fortsetzen stacked. */}
        <div class="md:w-2/3">
          <BentoModule
            label="Was kommt"
            number="01"
            class="border-b border-rule"
          >
            <Show when={!upcomingQ.isLoading} fallback={<LoadingLine />}>
              <Show
                when={upcomingQ.data && upcomingQ.data.length > 0}
                fallback={<EmptyUpcoming />}
              >
                <WasKommt items={upcomingQ.data!} />
              </Show>
            </Show>
          </BentoModule>

          <BentoModule label="Fortsetzen" number="02">
            <Show when={!continueQ.isLoading} fallback={<LoadingLine />}>
              <Show
                when={continueQ.data && continueQ.data.length > 0}
                fallback={<EmptyContinue />}
              >
                <Fortsetzen items={continueQ.data!} />
              </Show>
            </Show>
          </BentoModule>
        </div>

        {/* Rechte Spalte 1/3 — Logbuch. */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Logbuch" number="03">
            <Show when={!logbookQ.isLoading} fallback={<LoadingLine />}>
              <Show
                when={logbookQ.data && logbookQ.data.length > 0}
                fallback={<EmptyLogbook />}
              >
                <Logbuch events={logbookQ.data!} />
              </Show>
            </Show>
          </BentoModule>
        </div>
      </div>
    </main>
  );
}

// ── 01 · Was kommt ────────────────────────────────────────────────────

/**
 * Accordion timeline of upcoming releases. Direct port of Logbook's
 * was-kommt.tsx — same SHOWN=4, hero=2fr-1fr-1fr-1fr grid that animates the
 * template on hover, mobile vertical stack with each card in active style.
 * First click activates an inactive card; second click (same card)
 * navigates to the item.
 */
const WAS_KOMMT_SHOWN = 4;

function WasKommt(props: { items: UpcomingItem[] }) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = createSignal<string | null>(
    props.items[0]?.itemId ?? null,
  );

  const visible = () => props.items.slice(0, WAS_KOMMT_SHOWN);
  const hiddenCount = () =>
    Math.max(0, props.items.length - WAS_KOMMT_SHOWN);

  const activeIndex = () => {
    const idx = visible().findIndex((it) => it.itemId === activeId());
    return idx >= 0 ? idx : 0;
  };

  // The grid template animates on activeIndex change — the active column is
  // 2fr, the others 1fr. With fewer than four items the trailing columns
  // stay empty (the row deliberately doesn't stretch to fill).
  const gridCols = () =>
    Array.from({ length: WAS_KOMMT_SHOWN }, (_, i) =>
      i === activeIndex() ? "2fr" : "1fr",
    ).join(" ");

  return (
    <div>
      <div
        class="flex flex-col gap-3 md:grid"
        style={{
          "grid-template-columns": gridCols(),
          transition:
            "grid-template-columns 300ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onMouseLeave={() => {
          // Snap the highlight back to the first card on hover-capable
          // devices only — touch's tap-to-activate stays sticky.
          if (window.matchMedia("(hover: hover)").matches) {
            setActiveId(props.items[0]?.itemId ?? null);
          }
        }}
      >
        <For each={visible()}>
          {(item, i) => {
            const active = () => item.itemId === activeId();
            const isHero = () => i() === 0;
            return (
              <A
                href={`/item/${item.type}/${item.slug}`}
                aria-expanded={active()}
                aria-label={
                  active() ? `${item.title} öffnen` : `${item.title} ansehen`
                }
                onMouseEnter={() => setActiveId(item.itemId)}
                onClick={(e) => {
                  // First click on an inactive card just activates; second
                  // click (now active) lets the navigation through.
                  if (item.itemId !== activeId()) {
                    e.preventDefault();
                    setActiveId(item.itemId);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (item.itemId === activeId()) {
                      navigate(`/item/${item.type}/${item.slug}`);
                    } else {
                      setActiveId(item.itemId);
                    }
                  }
                }}
                class="group relative flex w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border transition-all duration-300 [transition-timing-function:var(--ease-quart)] focus:outline-none md:h-80"
                classList={{
                  "h-80 border-accent bg-accent": active(),
                  "h-44 border-border bg-bg": !active(),
                }}
              >
                {/* Cover fills above the caption; bg shows through as the
                    placeholder for items without a real cover. */}
                <div class="relative min-h-0 flex-1 overflow-hidden">
                  <Show
                    when={item.coverUrl}
                    fallback={
                      <div class="flex h-full items-center justify-center">
                        <span
                          class="font-mono text-mini font-medium opacity-60"
                          classList={{
                            "text-accent-on": active(),
                            "text-text-muted": !active(),
                          }}
                        >
                          {typeInitial(item.type)}
                        </span>
                      </div>
                    }
                  >
                    {/* Was-kommt cards display covers at up to ~250×280 px
                        (h-80 active), so the stored `/cover/medium/` URL
                        (~230 px native) pixelates badly on hover-scale.
                        highResCover swaps in the `/cover/large/` variant
                        — same URL host, larger image. */}
                    <img
                      src={highResCover(item.coverUrl)!}
                      alt=""
                      class="h-full w-full object-cover transition-transform duration-300 [transition-timing-function:var(--ease-quart)] group-hover:scale-[1.03]"
                    />
                  </Show>
                </div>

                {/* Caption */}
                <div class="shrink-0 p-3">
                  <DayTag
                    airDate={item.airDate}
                    isHero={isHero()}
                    active={active()}
                  />
                  <h3
                    class="mt-0.5 truncate text-body font-medium"
                    classList={{
                      "text-accent-on": active(),
                      "text-text": !active(),
                    }}
                  >
                    {item.title}
                  </h3>
                  <span
                    class="block font-mono text-mini"
                    classList={{
                      "text-accent-on/85": active(),
                      "text-text-muted": !active(),
                    }}
                  >
                    {episodeCode(item.episodeNumber)}
                    {active() ? ` · ${typeLabel(item.type)}` : ""}
                  </span>
                </div>
              </A>
            );
          }}
        </For>
      </div>

      <Show when={hiddenCount() > 0}>
        <p class="mt-2 flex w-full items-center justify-center rounded-xs py-2.5 font-mono text-mini uppercase tracking-wider text-text-muted">
          +{hiddenCount()} weitere
        </p>
      </Show>
    </div>
  );
}

function DayTag(props: {
  airDate: string;
  isHero: boolean;
  active: boolean;
}) {
  const offset = () => dayOffset(props.airDate);
  const dateLabel = () => formatDate(new Date(props.airDate));
  const keyword = () => {
    if (offset() === 0) return props.isHero ? "HEUTE" : "AUCH HEUTE";
    if (offset() === 1) return "MORGEN";
    return null;
  };

  return (
    <Show
      when={props.active}
      fallback={
        <span
          class="block font-mono text-mini uppercase tracking-wider"
          classList={{
            "text-accent": offset() <= 1,
            "text-text-muted": offset() > 1,
          }}
        >
          {keyword() ?? dateLabel()}
        </span>
      }
    >
      <span class="block font-mono text-mini uppercase tracking-wider text-accent-on">
        <Show when={keyword()}>
          <span>{keyword()} </span>
        </Show>
        <span class="opacity-75">{dateLabel()}</span>
      </span>
    </Show>
  );
}

function EmptyUpcoming() {
  return (
    <div class="rounded-sm border border-border px-5 py-6 text-center">
      <p class="text-body text-text">Diese Woche ruhig.</p>
      <p class="mt-1 text-body text-text-muted">
        Nichts steht in den nächsten 14 Tagen an. Stöbere in deiner Watchlist
        im <span class="font-mono">Listen</span>-Tab.
      </p>
    </div>
  );
}

// ── 02 · Fortsetzen ───────────────────────────────────────────────────

/**
 * Accordion rows for mid-watch items. The active row's cover grows (3rem×4rem
 * → 5.33rem×4rem), and a small "Anime"/"Manga"/etc. category line slides in
 * above the title. First click activates, second click (same row) opens.
 * Initially shows 4; the rest reveal via ShowMoreToggle.
 */
const FORTSETZEN_VISIBLE = 4;

function Fortsetzen(props: { items: ContinueItem[] }) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = createSignal<string | null>(
    props.items[0]?.itemId ?? null,
  );
  const [expanded, setExpanded] = createSignal(false);

  const hasMore = () => props.items.length > FORTSETZEN_VISIBLE;
  const visible = () =>
    expanded() || !hasMore()
      ? props.items
      : props.items.slice(0, FORTSETZEN_VISIBLE);
  const overflow = () => Math.max(0, props.items.length - FORTSETZEN_VISIBLE);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      // Collapsing while the active row would disappear — refocus to the top.
      if (!next) {
        const idx = props.items.findIndex((it) => it.itemId === activeId());
        if (idx >= FORTSETZEN_VISIBLE)
          setActiveId(props.items[0]?.itemId ?? null);
      }
      return next;
    });
  };

  return (
    <>
      <ul class="-mx-5">
        <For each={visible()}>
          {(item) => {
            const active = () => item.itemId === activeId();
            return (
              <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                <A
                  href={`/item/${item.type}/${item.slug}`}
                  aria-expanded={active()}
                  aria-label={
                    active() ? `${item.title} öffnen` : `${item.title} ansehen`
                  }
                  onMouseEnter={() => setActiveId(item.itemId)}
                  onClick={(e) => {
                    if (item.itemId !== activeId()) {
                      e.preventDefault();
                      setActiveId(item.itemId);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (item.itemId === activeId()) {
                        navigate(`/item/${item.type}/${item.slug}`);
                      } else {
                        setActiveId(item.itemId);
                      }
                    }
                  }}
                  class="flex cursor-pointer items-center gap-3 px-5 py-2 transition-colors hover:bg-surface focus:outline-none"
                >
                  {/* Cover — grows on active. */}
                  <div
                    class="relative shrink-0 overflow-hidden rounded-xs border border-border bg-surface transition-all duration-300 [transition-timing-function:var(--ease-quart)]"
                    style={{
                      width: active() ? "4rem" : "2.25rem",
                      height: active() ? "5.33rem" : "3rem",
                    }}
                  >
                    <Show
                      when={item.coverUrl}
                      fallback={
                        <div class="flex h-full items-center justify-center">
                          <span class="font-mono text-mini font-medium text-text-muted opacity-50">
                            {typeInitial(item.type)}
                          </span>
                        </div>
                      }
                    >
                      <img
                        src={item.coverUrl!}
                        alt=""
                        class="h-full w-full object-cover"
                      />
                    </Show>
                  </div>

                  <div class="min-w-0 flex-1">
                    {/* Category line — only meaningful weight on the active
                        hero, slides in from 0px max-height. */}
                    <span
                      class="block overflow-hidden font-mono text-mini uppercase tracking-[0.15em] text-text-muted transition-all duration-300 [transition-timing-function:var(--ease-quart)]"
                      style={{
                        "max-height": active() ? "16px" : "0px",
                        opacity: active() ? 1 : 0,
                      }}
                    >
                      {typeLabel(item.type)}
                    </span>
                    <div class="flex items-start gap-3">
                      <h3 class="min-w-0 truncate text-body font-medium text-text">
                        {item.title}
                      </h3>
                      <Show when={item.hasNewEpisode}>
                        <span class="shrink-0 font-mono text-mini uppercase text-accent">
                          {newReleaseLabel(item.type)}
                        </span>
                      </Show>
                    </div>
                    <p class="truncate font-mono text-mini text-text-muted">
                      <Show
                        when={item.nextEpisodeTitle}
                        fallback={nextLabel(item.type, item.nextEpisode)}
                      >
                        {nextLabel(item.type, item.nextEpisode)} ·{" "}
                        {item.nextEpisodeTitle}
                      </Show>
                    </p>
                  </div>

                  <div class="flex shrink-0 flex-col items-end gap-1">
                    <span class="font-mono text-mini tabular-nums text-text-muted">
                      {item.watched}/{item.total}
                    </span>
                  </div>
                </A>
              </li>
            );
          }}
        </For>
      </ul>

      <Show when={hasMore()}>
        <ShowMoreToggle
          expanded={expanded()}
          remaining={overflow()}
          onToggle={toggleExpanded}
        />
      </Show>
    </>
  );
}

function EmptyContinue() {
  return (
    <div class="rounded-sm border border-border px-5 py-6 text-center">
      <p class="text-body text-text">Alles aufgeholt.</p>
      <p class="mt-1 text-body text-text-muted">
        Zeit für etwas Neues — schau in deine Watchlist.
      </p>
    </div>
  );
}

// ── 03 · Logbuch ──────────────────────────────────────────────────────

/**
 * Bundled-watch feed. Each event is a (actor, item, session) bundle — so a
 * cascade of 1100 episodes reads as one line "Du hast E1–E1100 von One Piece
 * gesehen" instead of 1100 orphan rows that would blow the row cap and
 * surface only outliers. Initially shows 8 events with a "+ Alle Ereignisse"
 * reveal; an "Eigene ausblenden" toggle hides self-watches (persisted to
 * localStorage so the preference survives reloads).
 */
const LOGBUCH_VISIBLE = 8;
const LOGBUCH_SELF_KEY = "nakama:logbuch-self";

function Logbuch(props: { events: LogbookEvent[] }) {
  const [expanded, setExpanded] = createSignal(false);
  // Read the persisted preference synchronously at setup, not in onMount —
  // an onMount read lands AFTER the first paint, so the feed would flash the
  // default (self-events visible) for a frame before hiding them (B6).
  const [showSelf, setShowSelf] = createSignal(
    localStorage.getItem(LOGBUCH_SELF_KEY) !== "0",
  );

  const toggleSelf = () => {
    setShowSelf((prev) => {
      const next = !prev;
      localStorage.setItem(LOGBUCH_SELF_KEY, next ? "1" : "0");
      return next;
    });
  };

  // Quick-tick for `missed` events: a cascade-catch-up to the latest released
  // episode (auto-sync RPC fans out to co-members). On success we invalidate
  // the cross-cutting keys (HEALTH cache pattern) — the missed row then drops
  // out on the home refetch since the episode is now watched.
  const queryClient = useQueryClient();
  const tickMut = createMutation(() => ({
    mutationFn: (ev: MissedEvent) =>
      markEpisodesWatchedUpTo({ itemId: ev.itemId, upToEpisodeId: ev.episodeId }),
    onSuccess: (_data, ev) => {
      void queryClient.invalidateQueries({ queryKey: homeQueryKey });
      void queryClient.invalidateQueries({
        queryKey: episodesQueryKey(ev.type, ev.slug),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["list"] });
    },
  }));

  const hasSelf = () => props.events.some((e) => e.isSelf);
  const filtered = () =>
    showSelf() ? props.events : props.events.filter((e) => !e.isSelf);
  const hasMore = () => filtered().length > LOGBUCH_VISIBLE;
  const shown = () =>
    expanded() || !hasMore() ? filtered() : filtered().slice(0, LOGBUCH_VISIBLE);

  return (
    <div>
      <ul class="-mx-5">
        <For each={shown()}>
          {(ev) => (
            <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
              <div class="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface">
                <EventIcon ev={ev} />
                <div class="min-w-0 flex-1">
                  <p
                    class="text-body"
                    classList={{
                      "text-text-muted": ev.isSelf,
                      "text-text": !ev.isSelf,
                    }}
                  >
                    {ev.kind === "watch" ? (
                      <WatchSentence ev={ev} />
                    ) : ev.kind === "list_add" ? (
                      <ListAddSentence ev={ev} />
                    ) : ev.kind === "missed" ? (
                      <MissedSentence ev={ev} />
                    ) : (
                      <TransferSentence ev={ev} />
                    )}
                  </p>
                  <div class="mt-0.5 flex items-center gap-2">
                    <span class="font-mono text-mini tabular-nums text-text-muted">
                      {relTime(ev.ts)}
                    </span>
                    <Show when={ev.kind === "missed"}>
                      <button
                        type="button"
                        disabled={tickMut.isPending}
                        onClick={() =>
                          ev.kind === "missed" && tickMut.mutate(ev)
                        }
                        class="inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-mini uppercase tracking-wider text-accent transition-colors hover:bg-accent/10 disabled:opacity-50"
                      >
                        <Check class="size-3" strokeWidth={2.5} aria-hidden />
                        {tickMut.isPending &&
                        tickMut.variables?.eventId === ev.eventId
                          ? "…"
                          : "Abhaken"}
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            </li>
          )}
        </For>
        <Show when={shown().length === 0}>
          <li class="px-5 py-4 text-center text-body text-text-muted">
            Eigene Aktionen ausgeblendet.
          </li>
        </Show>
      </ul>

      {/* Footer controls — reveal-all + the self-actions toggle. */}
      <div class="mt-1 flex items-center gap-2">
        <Show when={hasMore()}>
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            aria-expanded={expanded()}
            class="flex flex-1 items-center justify-center whitespace-nowrap rounded-xs py-2 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            {expanded() ? "Weniger anzeigen" : "+ Alle Ereignisse"}
          </button>
        </Show>
        <Show when={hasSelf()}>
          <button
            type="button"
            onClick={toggleSelf}
            aria-pressed={!showSelf()}
            class="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xs py-2 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            <Show
              when={showSelf()}
              fallback={
                <>
                  <Eye class="size-3.5" strokeWidth={2} aria-hidden />
                  Eigene einblenden
                </>
              }
            >
              <EyeOff class="size-3.5" strokeWidth={2} aria-hidden />
              Eigene ausblenden
            </Show>
          </button>
        </Show>
      </div>
    </div>
  );
}

function EmptyLogbook() {
  return (
    <div class="rounded-sm border border-border px-5 py-6 text-center">
      <p class="text-body text-text">Noch nichts passiert.</p>
      <p class="mt-1 text-body text-text-muted">
        Sobald du oder Mit-Mitglieder Folgen abhaken oder neue Einträge zu
        Listen hinzufügen, siehst du es hier.
      </p>
    </div>
  );
}

/** Per-kind icon. Self-events are slightly dimmed regardless of kind so
 *  the user's own activity reads as background context next to co-member
 *  activity. Missed carries the accent (it wants the eye — it's actionable). */
function EventIcon(props: { ev: LogbookEvent }) {
  const base = "mt-0.5 size-4 shrink-0";
  return (
    <Switch>
      <Match when={props.ev.kind === "missed"}>
        <Clock class={`${base} text-accent`} strokeWidth={1.75} aria-hidden />
      </Match>
      <Match when={props.ev.kind === "ownership_transfer"}>
        <Crown
          class={`${base} text-text-muted`}
          classList={{ "opacity-60": props.ev.isSelf }}
          strokeWidth={1.75}
          aria-hidden
        />
      </Match>
      <Match when={props.ev.kind === "list_add"}>
        <ListPlus
          class={`${base} text-text-muted`}
          classList={{ "opacity-60": props.ev.isSelf }}
          strokeWidth={1.75}
          aria-hidden
        />
      </Match>
      <Match when={props.ev.kind === "watch" && props.ev.isSelf}>
        <Check
          class={`${base} text-text-muted opacity-60`}
          strokeWidth={1.75}
          aria-hidden
        />
      </Match>
      <Match when={props.ev.kind === "watch"}>
        <Eye class={`${base} text-text-muted`} strokeWidth={1.75} aria-hidden />
      </Match>
    </Switch>
  );
}

/** "Du hast Frieren E07 gesehen." / "@aki hat One Piece E37–E1163 gesehen." */
function WatchSentence(props: { ev: WatchBundle }) {
  return (
    <>
      <span class="font-medium">
        {props.ev.isSelf ? "Du" : props.ev.actorName ?? "Jemand"}
      </span>{" "}
      {props.ev.isSelf ? "hast" : "hat"}{" "}
      <A
        href={`/item/${props.ev.type}/${props.ev.slug}`}
        class="font-medium underline-offset-2 hover:underline"
      >
        {props.ev.title}
      </A>{" "}
      <span class="font-mono text-mini uppercase tracking-wider">
        {rangeLabel(props.ev.type, props.ev.minEpisode, props.ev.maxEpisode)}
      </span>{" "}
      gesehen.
    </>
  );
}

/** "Du hast Frieren zu Lieblings-Anime hinzugefügt." */
function ListAddSentence(props: { ev: ListAddEvent }) {
  return (
    <>
      <span class="font-medium">
        {props.ev.isSelf ? "Du" : props.ev.actorName ?? "Jemand"}
      </span>{" "}
      {props.ev.isSelf ? "hast" : "hat"}{" "}
      <A
        href={`/item/${props.ev.type}/${props.ev.slug}`}
        class="font-medium underline-offset-2 hover:underline"
      >
        {props.ev.title}
      </A>{" "}
      zu{" "}
      <A
        href={`/lists/${props.ev.listShortCode}`}
        class="underline-offset-2 hover:underline"
      >
        {props.ev.listName}
      </A>{" "}
      hinzugefügt.
    </>
  );
}

/** "Frieren E08 ist erschienen." — paired with the inline Abhaken quick-tick
 *  in the meta line below it. Always co-styled (never dimmed) since it's an
 *  actionable nudge, not the user's own logged action. */
function MissedSentence(props: { ev: MissedEvent }) {
  return (
    <>
      <A
        href={`/item/${props.ev.type}/${props.ev.slug}`}
        class="font-medium underline-offset-2 hover:underline"
      >
        {props.ev.title}
      </A>{" "}
      <span class="font-mono text-mini uppercase tracking-wider">
        {nextLabel(props.ev.type, props.ev.episodeNumber)}
      </span>{" "}
      ist erschienen.
    </>
  );
}

/** "Du hast <Liste> an @aki übergeben." / "@aki hat <Liste> an dich
 *  übergeben." / "@aki hat <Liste> an @lisa übergeben." */
function TransferSentence(props: { ev: TransferEvent }) {
  return (
    <>
      <span class="font-medium">
        {props.ev.isSelf ? "Du" : props.ev.actorName ?? "Jemand"}
      </span>{" "}
      {props.ev.isSelf ? "hast" : "hat"}{" "}
      <A
        href={`/lists/${props.ev.listShortCode}`}
        class="font-medium underline-offset-2 hover:underline"
      >
        {props.ev.listName}
      </A>{" "}
      an{" "}
      <span class="font-medium">
        {props.ev.recipientIsMe ? "dich" : props.ev.recipientName ?? "Jemand"}
      </span>{" "}
      übergeben.
    </>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────

function ShowMoreToggle(props: {
  expanded: boolean;
  remaining: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-expanded={props.expanded}
      class="mt-1 flex w-full items-center justify-center rounded-xs py-2 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
    >
      {props.expanded ? "Weniger anzeigen" : `+${props.remaining} weitere`}
    </button>
  );
}

function LoadingLine() {
  return <p class="text-body text-text-muted">Lade …</p>;
}

/** "MI · 27.05." — mono mini-caps in the PageHeader aside; matches Logbook so
 *  the rhythm reads identically across the two apps. */
function TodayLabel() {
  const d = new Date();
  const wd = d
    .toLocaleDateString("de-DE", { weekday: "short" })
    .replace(".", "")
    .toUpperCase();
  const dm = d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
  return (
    <span class="font-mono text-mini uppercase tracking-wider tabular-nums text-text-muted">
      {wd} · {dm}
    </span>
  );
}

