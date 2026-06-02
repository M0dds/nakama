import { createEffect, createSignal, For, Match, on, Show, Switch } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import {
  Check,
  Clock,
  Crown,
  Eye,
  EyeOff,
  Film,
  Gamepad2,
  ListPlus,
  RefreshCw,
} from "lucide-solid";
import { highResCover } from "@/lib/anilist";
import { fadeOnLoad } from "@/lib/image-fade";
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
  type StatusEvent,
  type TransferEvent,
  type UpcomingItem,
  type WatchBundle,
} from "@/lib/queries/home";
import { listsQueryOptions } from "@/lib/queries/lists";
import {
  airDateHasClock,
  dateLabel,
  dayOffset,
  episodeCode,
  formatDate,
  hasAirTime,
  newReleaseLabel,
  nextLabel,
  relTime,
  seasonEpisodeLabel,
  seasonRangeLabel,
  timeLabel,
  typeInitial,
  typeLabel,
} from "@/lib/format";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/Skeleton";
import { Pager } from "@/components/Pager";
import { UserChip } from "@/components/UserChip";

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
  // Whether the user owns ANY list yet. Drives the "first run" empty-state copy
  // (explain the section + point to the Listen tab to create a first list) vs
  // the "quiet day" copy (has lists, just nothing in this section right now).
  // Stays false while loading so an established user never flashes onboarding
  // copy; a brand-new user's lists query resolves to empty → firstRun true.
  const listsQ = createQuery(() => ({
    ...listsQueryOptions(auth.user()!),
    enabled: !!auth.user(),
  }));
  const firstRun = () =>
    !!listsQ.data &&
    listsQ.data.private.length === 0 &&
    listsQ.data.shared.length === 0;

  useRealtimeInvalidation("home", [
    { table: "episode_watches", invalidates: [homeQueryKey] },
    { table: "episodes", invalidates: [homeQueryKey] },
    { table: "list_items", invalidates: [homeQueryKey] },
    { table: "list_members", invalidates: [homeQueryKey] },
    { table: "list_ownership_transfers", invalidates: [homeQueryKey] },
    { table: "item_history", invalidates: [homeQueryKey] },
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
            <Show when={!upcomingQ.isLoading} fallback={<WasKommtSkeleton />}>
              <Show
                when={upcomingQ.data && upcomingQ.data.length > 0}
                fallback={<EmptyUpcoming firstRun={firstRun()} />}
              >
                <WasKommt items={upcomingQ.data!} />
              </Show>
            </Show>
          </BentoModule>

          <BentoModule label="Fortsetzen" number="02">
            <Show when={!continueQ.isLoading} fallback={<FortsetzenSkeleton />}>
              <Show
                when={continueQ.data && continueQ.data.length > 0}
                fallback={<EmptyContinue firstRun={firstRun()} />}
              >
                <Fortsetzen items={continueQ.data!} />
              </Show>
            </Show>
          </BentoModule>
        </div>

        {/* Rechte Spalte 1/3 — Logbuch. */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Logbuch" number="03">
            <Show when={!logbookQ.isLoading} fallback={<LogbuchSkeleton />}>
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
const WAS_KOMMT_SHOWN = 4; // desktop page size + mobile initial count
const WAS_KOMMT_ROW = 2; // mobile: cards revealed per "weitere"-tap (one row)

function WasKommt(props: { items: UpcomingItem[] }) {
  const navigate = useNavigate();
  const [activeId, setActiveId] = createSignal<string | null>(
    props.items[0]?.itemId ?? null,
  );

  // Desktop pages through groups of 4 (numbered Pager, like Fortsetzen);
  // mobile reveals one more row (2 cards) per tap on the "+N weitere" button.
  // Two independent models, but only one layout is visible at a time.
  const [page, setPage] = createSignal(1);
  const [shown, setShown] = createSignal(WAS_KOMMT_SHOWN);

  const pageCount = () =>
    Math.max(1, Math.ceil(props.items.length / WAS_KOMMT_SHOWN));
  const desktopVisible = () => {
    const start = (page() - 1) * WAS_KOMMT_SHOWN;
    return props.items.slice(start, start + WAS_KOMMT_SHOWN);
  };
  const mobileVisible = () => props.items.slice(0, shown());
  const mobileRemaining = () => Math.max(0, props.items.length - shown());

  // Desktop: on a page change focus the first card of the new page. Deferred so
  // it fires only on navigation, not on every realtime refetch (which would
  // clobber the user's selection). Mirrors Fortsetzen.
  createEffect(
    on(
      page,
      () => setActiveId(desktopVisible()[0]?.itemId ?? null),
      { defer: true },
    ),
  );

  const activeIndex = () => {
    const idx = desktopVisible().findIndex((it) => it.itemId === activeId());
    return idx >= 0 ? idx : 0;
  };

  // The grid template animates on activeIndex change — the active column is
  // 2fr, the others 1fr. With fewer than four items the trailing columns
  // stay empty (the row deliberately doesn't stretch to fill).
  const gridCols = () =>
    Array.from({ length: WAS_KOMMT_SHOWN }, (_, i) =>
      i === activeIndex() ? "2fr" : "1fr",
    ).join(" ");

  // Mobile: a 2-up grid laid out in rows of two. Within each row the active
  // card's column springs to 2fr (the others 1fr) — the same liquid accordion
  // as the desktop single row, just wrapped two-up so portrait covers get
  // width instead of being squashed flat across the full screen width.
  const rows = () => {
    const v = mobileVisible();
    const out: UpcomingItem[][] = [];
    for (let i = 0; i < v.length; i += 2) out.push(v.slice(i, i + 2));
    return out;
  };
  const rowCols = (row: UpcomingItem[]) => {
    const cols = row.map((it) => (it.itemId === activeId() ? "2fr" : "1fr"));
    // A lone trailing card (odd count) gets a padded 2-column track: it keeps a
    // normal column width (and still widens to 2fr when active) instead of
    // stretching full-width; the second column stays empty.
    if (cols.length === 1) cols.push("1fr");
    return cols.join(" ");
  };
  // Exactly one "hero" (the globally-first item) so only it says "HEUTE".
  const isHeroItem = (item: UpcomingItem) =>
    item.itemId === props.items[0]?.itemId;

  const SPRING = "grid-template-columns 420ms cubic-bezier(0.22, 1.2, 0.36, 1)";
  const COLOR_T =
    "border-color 260ms cubic-bezier(0.16, 1, 0.3, 1), " +
    "background-color 260ms cubic-bezier(0.16, 1, 0.3, 1)";

  // Shared tap/keyboard/hover semantics for every card. First tap on an
  // inactive card activates it (preventing nav); a second tap (now active)
  // navigates. Hover-activate is gated to pointer devices — on touch a tap
  // fires a synthetic mouseenter BEFORE the click, which would otherwise
  // pre-activate the card and let the first tap navigate.
  const onCardClick = (item: UpcomingItem, e: MouseEvent) => {
    if (item.itemId !== activeId()) {
      e.preventDefault();
      setActiveId(item.itemId);
    }
  };
  const onCardKey = (item: UpcomingItem, e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (item.itemId === activeId()) {
        navigate(`/item/${item.type}/${item.slug}`);
      } else {
        setActiveId(item.itemId);
      }
    }
  };
  const onCardEnter = (item: UpcomingItem) => {
    if (window.matchMedia("(hover: hover)").matches) setActiveId(item.itemId);
  };

  return (
    <div>
      {/* ── Desktop: single-row 2fr-1fr-1fr-1fr accordion ──────────── */}
      <div
        class="hidden gap-3 md:grid"
        style={{ "grid-template-columns": gridCols(), transition: SPRING }}
        onMouseLeave={() => {
          // Snap the highlight back to the first card on hover-capable
          // devices only — touch's tap-to-activate stays sticky.
          if (window.matchMedia("(hover: hover)").matches) {
            setActiveId(props.items[0]?.itemId ?? null);
          }
        }}
      >
        <For each={desktopVisible()}>
          {(item, i) => {
            const active = () => item.itemId === activeId();
            return (
              <A
                href={`/item/${item.type}/${item.slug}`}
                aria-expanded={active()}
                aria-label={
                  active() ? `${item.title} öffnen` : `${item.title} ansehen`
                }
                onMouseEnter={() => onCardEnter(item)}
                onClick={(e) => onCardClick(item, e)}
                onKeyDown={(e) => onCardKey(item, e)}
                class="group relative flex h-96 w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border focus:outline-none"
                classList={{
                  "border-accent bg-accent": active(),
                  "border-border bg-bg": !active(),
                }}
                style={{ transition: COLOR_T }}
              >
                <WasKommtCardFace
                  item={item}
                  active={active()}
                  isHero={i() === 0}
                  coverClass="relative min-h-0 flex-1 overflow-hidden"
                />
              </A>
            );
          }}
        </For>
      </div>

      {/* ── Mobile: 2-up grid, rows of two; active card springs wider ─ */}
      <div class="flex flex-col gap-3 md:hidden">
        <For each={rows()}>
          {(row) => (
            <div
              class="grid gap-3"
              style={{ "grid-template-columns": rowCols(row), transition: SPRING }}
            >
              <For each={row}>
                {(item) => {
                  const active = () => item.itemId === activeId();
                  return (
                    <A
                      href={`/item/${item.type}/${item.slug}`}
                      aria-expanded={active()}
                      aria-label={
                        active()
                          ? `${item.title} öffnen`
                          : `${item.title} ansehen`
                      }
                      onMouseEnter={() => onCardEnter(item)}
                      onClick={(e) => onCardClick(item, e)}
                      onKeyDown={(e) => onCardKey(item, e)}
                      // Fixed height (like the desktop h-80 cards) → only the
                      // WIDTH springs, so every card stays the same height and
                      // the 2×2 always reads as a filled rectangle, never a gap.
                      // The cover fills via object-cover: active (wide) ≈ square,
                      // inactive (narrow) ≈ portrait.
                      class="group relative flex h-72 w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border focus:outline-none"
                      classList={{
                        "border-accent bg-accent": active(),
                        "border-border bg-bg": !active(),
                      }}
                      style={{ transition: COLOR_T }}
                    >
                      <WasKommtCardFace
                        item={item}
                        active={active()}
                        isHero={isHeroItem(item)}
                        coverClass="relative min-h-0 flex-1 overflow-hidden"
                      />
                    </A>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </div>

      {/* Desktop: numbered Pager (4 per page, like Fortsetzen). */}
      <div class="hidden md:block">
        <Pager page={page()} pageCount={pageCount()} onPage={setPage} />
      </div>

      {/* Mobile: reveal one more row (2 cards) per tap. */}
      <Show when={mobileRemaining() > 0}>
        <button
          type="button"
          onClick={() => setShown((s) => s + WAS_KOMMT_ROW)}
          class="mt-3 flex w-full items-center justify-center rounded-xs py-2.5 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text md:hidden"
        >
          +{mobileRemaining()} weitere
        </button>
      </Show>
    </div>
  );
}

/**
 * The cover + caption shared by every Was-kommt card. The cover-box sizing is
 * passed in (`coverClass`): desktop fills the card height (flex-1), the mobile
 * 2-up cards are 2:3 portrait — so covers keep a real aspect on each surface
 * instead of being squashed flat.
 */
function WasKommtCardFace(props: {
  item: UpcomingItem;
  active: boolean;
  isHero: boolean;
  coverClass: string;
}) {
  return (
    <>
      {/* Cover above the caption; bg shows through as the placeholder for
          items without a real cover. highResCover swaps the stored
          `/cover/medium/` URL for the larger variant (same host) so it stays
          crisp at hero size / on hover-scale. */}
      <div class={props.coverClass}>
        <Show
          when={props.item.coverUrl}
          fallback={
            <div class="flex h-full items-center justify-center">
              <span
                class="font-mono text-mini font-medium opacity-60"
                classList={{
                  "text-accent-on": props.active,
                  "text-text-muted": !props.active,
                }}
              >
                {typeInitial(props.item.type)}
              </span>
            </div>
          }
        >
          <img
            ref={fadeOnLoad}
            src={highResCover(props.item.coverUrl)!}
            alt=""
            class="h-full w-full object-cover transition-transform duration-300 [transition-timing-function:var(--ease-quart)] group-hover:scale-[1.03]"
          />
        </Show>
      </div>

      <div class="shrink-0 p-3">
        <DayTag
          airDate={props.item.airDate}
          type={props.item.type}
          isHero={props.isHero}
          active={props.active}
        />
        <h3
          class="mt-0.5 truncate text-body font-medium"
          classList={{
            "text-accent-on": props.active,
            "text-text": !props.active,
          }}
        >
          {props.item.title}
        </h3>
        <span
          class="block truncate font-mono text-mini"
          classList={{
            "text-accent-on/85": props.active,
            "text-text-muted": !props.active,
          }}
        >
          {/* Movies have no episode number → just the type label. */}
          <Show
            when={props.item.episodeNumber !== undefined}
            fallback={typeLabel(props.item.type)}
          >
            {episodeCode(props.item.episodeNumber!)}
            {props.active ? ` · ${typeLabel(props.item.type)}` : ""}
          </Show>
        </span>
      </div>
    </>
  );
}

function DayTag(props: {
  airDate: string;
  type: string;
  isHero: boolean;
  active: boolean;
}) {
  const offset = () => dayOffset(props.airDate);
  const weekdayDate = () => formatDate(new Date(props.airDate)); // "SA · 30. Mai"
  const time = () =>
    hasAirTime(props.airDate) && airDateHasClock(props.type)
      ? timeLabel(props.airDate)
      : null;
  const keyword = () => {
    if (offset() === 0) return props.isHero ? "HEUTE" : "AUCH HEUTE";
    if (offset() === 1) return "MORGEN";
    return null;
  };

  // Hover/active detail after the keyword. Today/tomorrow drop the weekday —
  // "HEUTE" already says the day — and read "30. Mai · 17:00"; other days keep
  // the weekday and just gain the time → "MO · 01. Jun · 17:00". The air time
  // is omitted for date-only entries (no real airing schedule).
  const detail = () => {
    const t = time();
    const date = keyword() ? dateLabel(props.airDate) : weekdayDate();
    return t ? `${date} · ${t}` : date;
  };

  return (
    <Show
      when={props.active}
      fallback={
        <span
          class="block truncate font-mono text-mini uppercase tracking-wider"
          classList={{
            "text-accent": offset() <= 1,
            "text-text-muted": offset() > 1,
          }}
        >
          {keyword() ?? weekdayDate()}
        </span>
      }
    >
      <span class="block truncate font-mono text-mini uppercase tracking-wider text-accent-on">
        <Show when={keyword()}>
          <span>{keyword()} · </span>
        </Show>
        <span class="opacity-75">{detail()}</span>
      </span>
    </Show>
  );
}

function EmptyUpcoming(props: { firstRun: boolean }) {
  return (
    <div class="rounded-sm border border-border px-5 py-6 text-center">
      <Show
        when={props.firstRun}
        fallback={
          <>
            <p class="text-body text-text">Diese Woche ruhig.</p>
            <p class="mt-1 text-body text-text-muted">
              In den nächsten 14 Tagen steht nichts an.
            </p>
          </>
        }
      >
        <p class="text-body text-text">Hier wird's bald voll.</p>
        <p class="mx-auto mt-1 max-w-md text-body text-text-muted">
          Sobald du Serien, Filme oder Spiele verfolgst, erscheinen hier die
          nächsten Folgen und Releases. Leg dafür im{" "}
          <A
            href="/lists"
            class="text-accent underline-offset-2 hover:underline"
          >
            Listen-Tab
          </A>{" "}
          deine erste Liste an.
        </p>
      </Show>
    </div>
  );
}

// ── 02 · Fortsetzen ───────────────────────────────────────────────────

/**
 * Accordion rows for mid-watch items. The active row's cover grows (3rem×4rem
 * → 5.33rem×4rem), and a small "Anime"/"Manga"/etc. category line slides in
 * above the title. First click activates, second click (same row) opens.
 * Shows 4 per page; the numbered Pager swaps to the next 4 (no growing list).
 */
const FORTSETZEN_PER_PAGE = 4;

/** Row identity: a sync instance and the global entry of the same item are two
 *  distinct rows, so we key on listItemId when present (not just itemId). */
const rowKey = (it: ContinueItem) => it.listItemId ?? it.itemId;

function Fortsetzen(props: { items: ContinueItem[] }) {
  const navigate = useNavigate();
  const [page, setPage] = createSignal(1);

  const pageCount = () =>
    Math.max(1, Math.ceil(props.items.length / FORTSETZEN_PER_PAGE));
  const visible = () => {
    const start = (page() - 1) * FORTSETZEN_PER_PAGE;
    return props.items.slice(start, start + FORTSETZEN_PER_PAGE);
  };

  const [activeId, setActiveId] = createSignal<string | null>(
    props.items[0] ? rowKey(props.items[0]) : null,
  );
  // On a page change, focus the first row of the new page. Deferred so it only
  // fires on navigation — NOT on every data refetch (which would clobber the
  // user's in-page selection when realtime re-slices the list).
  createEffect(
    on(
      page,
      () => {
        const first = visible()[0];
        setActiveId(first ? rowKey(first) : null);
      },
      { defer: true },
    ),
  );

  return (
    <>
      <ul class="-mx-5">
        <For each={visible()}>
          {(item) => {
            const key = rowKey(item);
            const active = () => key === activeId();
            // Instance entry → list-scoped route (+ link-state for instant lane
            // + sync flag); global entry → the context-free item page.
            const href = item.listItemId
              ? `/lists/${item.listShortCode}/item/${item.type}/${item.slug}`
              : `/item/${item.type}/${item.slug}`;
            const linkState = item.listItemId
              ? { listItemId: item.listItemId, syncEnabled: true }
              : undefined;
            return (
              <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
                <A
                  href={href}
                  state={linkState}
                  aria-expanded={active()}
                  aria-label={
                    active() ? `${item.title} öffnen` : `${item.title} ansehen`
                  }
                  // Hover-activate on pointer devices only — see WasKommt:
                  // touch's pre-click mouseenter would otherwise make the first
                  // tap navigate instead of expanding the row.
                  onMouseEnter={() => {
                    if (window.matchMedia("(hover: hover)").matches) {
                      setActiveId(key);
                    }
                  }}
                  onClick={(e) => {
                    if (key !== activeId()) {
                      e.preventDefault();
                      setActiveId(key);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (key === activeId()) {
                        navigate(href, { state: linkState });
                      } else {
                        setActiveId(key);
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
                        ref={fadeOnLoad}
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
                          {newReleaseLabel(item.type, item.newEpisodeCount)}
                        </span>
                      </Show>
                    </div>
                    <p class="truncate font-mono text-mini text-text-muted">
                      <Show
                        when={item.nextEpisodeTitle}
                        fallback={seasonEpisodeLabel(
                          item.type,
                          item.nextSeason,
                          item.nextEpisode,
                        )}
                      >
                        {seasonEpisodeLabel(
                          item.type,
                          item.nextSeason,
                          item.nextEpisode,
                        )}{" "}
                        · {item.nextEpisodeTitle}
                      </Show>
                    </p>
                  </div>

                  <div class="flex shrink-0 items-center gap-1.5 font-mono text-mini text-text-muted">
                    {/* Sync-instance marker, left of the count and dot-joined:
                        "⟳ Reisegruppe · 3/23". Absent for global entries. */}
                    <Show when={item.listName}>
                      <RefreshCw
                        class="size-3 shrink-0"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span class="max-w-[8rem] truncate uppercase">
                        {item.listName}
                      </span>
                      <span aria-hidden>·</span>
                    </Show>
                    <span class="tabular-nums">
                      {item.watched}/{item.total}
                    </span>
                  </div>
                </A>
              </li>
            );
          }}
        </For>
      </ul>

      <Pager page={page()} pageCount={pageCount()} onPage={setPage} />
    </>
  );
}

function EmptyContinue(props: { firstRun: boolean }) {
  return (
    <div class="rounded-sm border border-border px-5 py-6 text-center">
      <Show
        when={props.firstRun}
        fallback={
          <>
            <p class="text-body text-text">Alles aufgeholt.</p>
            <p class="mt-1 text-body text-text-muted">Zeit für etwas Neues.</p>
          </>
        }
      >
        <p class="text-body text-text">Noch nichts begonnen.</p>
        <p class="mx-auto mt-1 max-w-md text-body text-text-muted">
          Was du gerade schaust oder spielst, taucht hier auf — mit dem Tipp,
          wo du weitermachst. Fang mit deiner ersten Liste im{" "}
          <A
            href="/lists"
            class="text-accent underline-offset-2 hover:underline"
          >
            Listen-Tab
          </A>{" "}
          an.
        </p>
      </Show>
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
              <div class="group/row relative isolate flex items-start gap-3 px-5 py-3">
                {/* Hover fill as its own layer, inset 1px on the LEFT so it
                    stops at the column guide (the viewport-fixed 1px line at
                    the 2/3 boundary, parked behind content) instead of
                    painting over it. Bleeds right to the viewport edge, where
                    there's no outline. isolate + -z-10 keeps it behind the
                    glyph/text but in front of the guide. */}
                <span
                  aria-hidden
                  class="pointer-events-none absolute inset-y-0 left-px right-0 -z-10 bg-surface opacity-0 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] group-hover/row:opacity-100"
                />
                <EventGlyph ev={ev} />
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
                    ) : ev.kind === "status" ? (
                      <StatusSentence ev={ev} />
                    ) : (
                      <TransferSentence ev={ev} />
                    )}
                  </p>
                  <span class="mt-0.5 block font-mono text-mini tabular-nums text-text-muted">
                    {relTime(ev.ts)}
                  </span>
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

/** Left-slot glyph. Co-member events wear the actor's face (with a small
 *  kind-badge so the eye still reads what happened); the user's own events and
 *  the actor-less `missed` nudge keep the bare kind icon. Fixed 24px slot keeps
 *  the sentence left-edge flush across mixed rows. */
function EventGlyph(props: { ev: LogbookEvent }) {
  const showAvatar = () =>
    !props.ev.isSelf && props.ev.kind !== "missed";
  return (
    <div class="flex w-6 shrink-0 justify-center pt-0.5">
      <Show when={showAvatar()} fallback={<EventIcon ev={props.ev} />}>
        <div class="relative">
          <Avatar
            handle={props.ev.actorName ?? "?"}
            avatarUrl={props.ev.actorAvatarUrl}
            size={24}
          />
          <span class="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border border-border bg-surface">
            <KindBadge ev={props.ev} />
          </span>
        </div>
      </Show>
    </div>
  );
}

/** The tiny corner badge on a co-member avatar — same icon vocabulary as the
 *  bare EventIcon, minus the self/missed cases that never reach the avatar. */
function KindBadge(props: { ev: LogbookEvent }) {
  const cls = "size-2.5 text-text-muted";
  return (
    <Switch>
      <Match when={props.ev.kind === "ownership_transfer"}>
        <Crown class={cls} strokeWidth={2} aria-hidden />
      </Match>
      <Match when={props.ev.kind === "list_add"}>
        <ListPlus class={cls} strokeWidth={2} aria-hidden />
      </Match>
      <Match when={props.ev.kind === "status"}>
        <StatusKindIcon
          type={(props.ev as StatusEvent).type}
          class={cls}
          strokeWidth={2}
        />
      </Match>
      <Match when={props.ev.kind === "watch"}>
        <Eye class={cls} strokeWidth={2} aria-hidden />
      </Match>
    </Switch>
  );
}

/** Per-kind icon. Self-events are slightly dimmed regardless of kind so
 *  the user's own activity reads as background context next to co-member
 *  activity. Missed carries the accent (it wants the eye — it's actionable). */
/** Movie/game completion icon — Film for movies, Gamepad for games. Shared by
 *  the bare EventIcon and the co-member avatar's KindBadge. */
function StatusKindIcon(props: {
  type: string;
  class: string;
  strokeWidth: number;
}) {
  return props.type === "game" ? (
    <Gamepad2 class={props.class} strokeWidth={props.strokeWidth} aria-hidden />
  ) : (
    <Film class={props.class} strokeWidth={props.strokeWidth} aria-hidden />
  );
}

function EventIcon(props: { ev: LogbookEvent }) {
  const base = "size-4 shrink-0";
  return (
    <Switch>
      <Match when={props.ev.kind === "missed"}>
        <Clock class={`${base} text-accent`} strokeWidth={1.75} aria-hidden />
      </Match>
      <Match when={props.ev.kind === "status"}>
        {/* EventIcon only renders for self-events (co-members get the avatar +
            KindBadge), so a completion here is always the user's own → dimmed,
            matching the self-watch treatment. */}
        <StatusKindIcon
          type={(props.ev as StatusEvent).type}
          class={`${base} text-text-muted opacity-60`}
          strokeWidth={1.75}
        />
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

/** The actor's name in a Logbuch sentence: plain "Du" for self, plain "Jemand"
 *  for an unresolved actor, else a UserChip whose hover card reveals avatar +
 *  display name + @handle (anti-spoofing: the @handle is the unique identity). */
function ActorName(props: {
  isSelf: boolean;
  name: string | null;
  handle: string | null;
  avatarUrl: string | null;
}) {
  if (props.isSelf) return <span class="font-medium">Du</span>;
  if (!props.name) return <span class="font-medium">Jemand</span>;
  return (
    <UserChip name={props.name} handle={props.handle} avatarUrl={props.avatarUrl}>
      <span class="font-medium underline decoration-border decoration-dotted underline-offset-2">
        {props.name}
      </span>
    </UserChip>
  );
}

/** "Du hast Frieren E07 gesehen." / "@aki hat One Piece E37–E1163 gesehen."
 *  Read-only — the Logbuch is a pure indicator, nothing links anywhere. */
function WatchSentence(props: { ev: WatchBundle }) {
  return (
    <>
      <ActorName
        isSelf={props.ev.isSelf}
        name={props.ev.actorName}
        handle={props.ev.actorHandle}
        avatarUrl={props.ev.actorAvatarUrl}
      />{" "}
      {props.ev.isSelf ? "hast" : "hat"}{" "}
      <span class="font-medium">{props.ev.title}</span>{" "}
      <span class="font-mono text-mini uppercase tracking-wider">
        {seasonRangeLabel(
          props.ev.type,
          props.ev.season,
          props.ev.minEpisode,
          props.ev.maxEpisode,
        )}
      </span>{" "}
      gesehen.
    </>
  );
}

/** "Du hast Frieren zu Lieblings-Anime hinzugefügt." */
function ListAddSentence(props: { ev: ListAddEvent }) {
  return (
    <>
      <ActorName
        isSelf={props.ev.isSelf}
        name={props.ev.actorName}
        handle={props.ev.actorHandle}
        avatarUrl={props.ev.actorAvatarUrl}
      />{" "}
      {props.ev.isSelf ? "hast" : "hat"}{" "}
      <span class="font-medium">{props.ev.title}</span> zu{" "}
      <span class="font-medium">{props.ev.listName}</span> hinzugefügt.
    </>
  );
}

/** "Du hast Dune gesehen." / "@aki hat Elden Ring gespielt." — movie/game
 *  completion. Verb branches on type (movie → gesehen, game → gespielt),
 *  matching the detail-page "Gesehen"/"Gespielt" toggles. Read-only. */
function StatusSentence(props: { ev: StatusEvent }) {
  return (
    <>
      <ActorName
        isSelf={props.ev.isSelf}
        name={props.ev.actorName}
        handle={props.ev.actorHandle}
        avatarUrl={props.ev.actorAvatarUrl}
      />{" "}
      {props.ev.isSelf ? "hast" : "hat"}{" "}
      <span class="font-medium">{props.ev.title}</span>{" "}
      {props.ev.type === "game" ? "gespielt" : "gesehen"}.
    </>
  );
}

/** "Frieren E08 ist erschienen." — a pure "something new dropped" indicator
 *  (no quick-tick, no link). */
function MissedSentence(props: { ev: MissedEvent }) {
  return (
    <>
      <span class="font-medium">{props.ev.title}</span>{" "}
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
      <ActorName
        isSelf={props.ev.isSelf}
        name={props.ev.actorName}
        handle={props.ev.actorHandle}
        avatarUrl={props.ev.actorAvatarUrl}
      />{" "}
      {props.ev.isSelf ? "hast" : "hat"}{" "}
      <span class="font-medium">{props.ev.listName}</span> an{" "}
      {props.ev.recipientIsMe ? (
        <span class="font-medium">dich</span>
      ) : (
        <ActorName
          isSelf={false}
          name={props.ev.recipientName}
          handle={props.ev.recipientHandle}
          avatarUrl={props.ev.recipientAvatarUrl}
        />
      )}{" "}
      übergeben.
    </>
  );
}


// ── Skeleton placeholders ─────────────────────────────────────────────
// Each mirrors its module's content shape so the real data drops in without
// a layout shift — the frame stays, only the fill swaps.

/** Was-kommt: the hero(2fr)+3 card row on desktop; 2-up portrait grid on
 *  mobile — each skeleton mirrors the layout it replaces so the fill drops in
 *  without a shift. */
function WasKommtSkeleton() {
  return (
    <div>
      <div
        class="hidden gap-3 md:grid"
        style={{ "grid-template-columns": "2fr 1fr 1fr 1fr" }}
      >
        <For each={Array.from({ length: WAS_KOMMT_SHOWN })}>
          {() => <Skeleton class="h-96 w-full" />}
        </For>
      </div>
      <div class="grid grid-cols-2 gap-3 md:hidden">
        <For each={Array.from({ length: WAS_KOMMT_SHOWN })}>
          {() => <Skeleton class="h-72 w-full" />}
        </For>
      </div>
    </div>
  );
}

/** Fortsetzen: cover + title/meta + count rows. */
function FortsetzenSkeleton() {
  return (
    <ul class="-mx-5">
      <For each={Array.from({ length: FORTSETZEN_PER_PAGE })}>
        {() => (
          <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
            <div class="flex items-center gap-3 px-5 py-2">
              <Skeleton class="h-12 w-9 shrink-0" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-40" />
                <Skeleton class="mt-1.5 h-3 w-24" />
              </div>
              <Skeleton class="h-3 w-8 shrink-0" />
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}

/** Logbuch: glyph + sentence/timestamp feed rows. */
function LogbuchSkeleton() {
  return (
    <ul class="-mx-5">
      <For each={Array.from({ length: LOGBUCH_VISIBLE })}>
        {() => (
          <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
            <div class="flex items-start gap-3 px-5 py-3">
              <Skeleton class="size-7 shrink-0" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-full max-w-[11rem]" />
                <Skeleton class="mt-1.5 h-3 w-14" />
              </div>
            </div>
          </li>
        )}
      </For>
    </ul>
  );
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

