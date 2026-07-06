import {
  createEffect,
  createSignal,
  For,
  Index,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
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
  List,
  ListPlus,
} from "lucide-solid";
import { coverFor } from "@/lib/cover";
import { fadeOnLoad } from "@/lib/image-fade";
import { useAuth } from "@/lib/auth";
import {
  continueWatchingOptions,
  homeQueryKey,
  nextUpOptions,
  recentlyTickedOptions,
  upcomingEpisodesOptions,
  type ContinueItem,
  type ListAddEvent,
  type LogbookEvent,
  type MissedEvent,
  type NextUpItem,
  type StatusEvent,
  type TransferEvent,
  type UpcomingItem,
  type WatchBundle,
} from "@/lib/queries/home";
import { listsQueryOptions } from "@/lib/queries/lists";
import { myProfileOptions } from "@/lib/queries/profile";
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
import { PinBadge } from "@/components/GeneratedCover";
import { CoverBackdrop } from "@/components/CoverBackdrop";
import { QueryErrorCard } from "@/components/QueryErrorCard";
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

  // "Als Nächstes" — unstarted entries from tracked lists, pinned first. Only
  // fetched once Fortsetzen has resolved EMPTY (the strip lives inside the
  // caught-up empty state; an active watcher never pays for the query).
  const nextUpQ = createQuery(() => ({
    ...nextUpOptions(auth.user()!),
    enabled: !!auth.user() && continueQ.data?.length === 0,
  }));

  // Greeting name for the header. The AppLayout gate already preloads this same
  // query (onboarding check), so it's warm in cache → no flash. Display name is
  // the app-wide primary label; fall back to the @handle, then to a bare
  // "Willkommen." while loading or if neither is set.
  const profileQ = createQuery(() => ({
    ...myProfileOptions(auth.user()!),
    enabled: !!auth.user(),
  }));
  const greetingName = () =>
    profileQ.data?.displayName?.trim() || profileQ.data?.username?.trim() || null;

  // Home's ambient cover-art backdrop follows the focused "Was kommt" card: on
  // desktop, hovering a card activates it, so the wash drifts to whatever the
  // user is eyeing (crossfading via CoverBackdrop). WasKommt reports its active
  // cover up through onActiveCover; null (no upcoming items) → no backdrop.
  // The "Als Nächstes" strip reports hovers through its own signal that WINS
  // while set — leaving the strip falls back to WasKommt's active card, so the
  // two sections never fight over the wash.
  const [washCover, setWashCover] = createSignal<string | null>(null);
  const [nextUpCover, setNextUpCover] = createSignal<string | null>(null);

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
      <CoverBackdrop coverUrl={nextUpCover() ?? washCover()} />
      <PageHeader
        title={
          <Show when={greetingName()} fallback={<>Willkommen.</>}>
            {(name) => <>Willkommen, {name()}.</>}
          </Show>
        }
        aside={<TodayLabel />}
      />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Linke Spalte 2/3 — Was kommt + Fortsetzen stacked. */}
        <div class="md:w-2/3">
          <BentoModule
            label="Was kommt"
            number="01"
            class="border-b border-rule"
          >
            {/* Error gate FIRST — a failed query must not fall through to the
                truthful-sounding empty copy ("Diese Woche ruhig."). */}
            <Show
              when={!upcomingQ.isError}
              fallback={
                <QueryErrorCard onRetry={() => void upcomingQ.refetch()} />
              }
            >
              <Show when={!upcomingQ.isLoading} fallback={<WasKommtSkeleton />}>
                <Show
                  when={upcomingQ.data && upcomingQ.data.length > 0}
                  fallback={<EmptyUpcoming firstRun={firstRun()} />}
                >
                  <WasKommt
                    items={upcomingQ.data!}
                    onActiveCover={setWashCover}
                  />
                </Show>
              </Show>
            </Show>
          </BentoModule>

          <BentoModule label="Fortsetzen" number="02">
            <Show
              when={!continueQ.isError}
              fallback={
                <QueryErrorCard onRetry={() => void continueQ.refetch()} />
              }
            >
              <Show
                when={!continueQ.isLoading}
                fallback={<FortsetzenSkeleton />}
              >
                <Show
                  when={continueQ.data && continueQ.data.length > 0}
                  fallback={
                    <EmptyContinue
                      firstRun={firstRun()}
                      nextUp={nextUpQ.data ?? []}
                      onActiveCover={setNextUpCover}
                    />
                  }
                >
                  <Fortsetzen items={continueQ.data!} />
                </Show>
              </Show>
            </Show>
          </BentoModule>
        </div>

        {/* Rechte Spalte 1/3 — Logbuch. */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Logbuch" number="03">
            <Show
              when={!logbookQ.isError}
              fallback={
                <QueryErrorCard onRetry={() => void logbookQ.refetch()} />
              }
            >
              <Show when={!logbookQ.isLoading} fallback={<LogbuchSkeleton />}>
                <Show
                  when={logbookQ.data && logbookQ.data.length > 0}
                  fallback={<EmptyLogbook />}
                >
                  <Logbuch events={logbookQ.data!} />
                </Show>
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

function WasKommt(props: {
  items: UpcomingItem[];
  /** Reports the focused card's resolved cover URL up to Home, which paints it
   *  as the ambient backdrop. Fires on hover/activation + page changes. */
  onActiveCover?: (url: string | null) => void;
}) {
  const navigate = useNavigate();
  // Identity is per ENTRY, not per item: an item with diverging lanes (own Mo
  // vs synced Fr) appears more than once, so keying on itemId alone would
  // activate both copies together. itemId|airDate is unique (split entries
  // differ by date).
  const entryKey = (it?: UpcomingItem): string | null =>
    it ? `${it.itemId}|${it.airDate}` : null;
  const [activeId, setActiveId] = createSignal<string | null>(
    entryKey(props.items[0]),
  );

  // Push the focused card's cover up to Home for the ambient backdrop. Tracks
  // activeId + items, so it follows desktop hover (which activates the card)
  // and page changes; coverFor sharpens the stored URL.
  createEffect(() => {
    const active = props.items.find((it) => entryKey(it) === activeId());
    props.onActiveCover?.(active ? coverFor(active.coverUrl) ?? null : null);
  });
  // Clear the backdrop if WasKommt unmounts (upcoming list went empty), so a
  // stale cover doesn't linger behind the empty state.
  onCleanup(() => props.onActiveCover?.(null));

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
      () => setActiveId(entryKey(desktopVisible()[0])),
      { defer: true },
    ),
  );

  // Animate the desktop Pager page-swap HORIZONTALLY, following the paging
  // direction: forward (next page) the cards slide in from the RIGHT, backward
  // from the LEFT — opacity-in + a slight overshoot past the resting point (the
  // "bounce"). `on(page, (p, prev) => …)` hands us the previous page so we know
  // the direction. Deferred → the first render doesn't animate, only genuine
  // page changes; reduced-motion-aware. transform is safe here — the grid has no
  // position:fixed descendants (the ColumnGuide lives at the Home level), and
  // body has overflow-x:clip so the transient X-shift adds no scrollbar.
  let desktopGridEl: HTMLDivElement | undefined;
  createEffect(
    on(
      page,
      (p, prev) => {
        if (
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
          !desktopGridEl
        )
          return;
        const forward = p >= (prev ?? p);
        const fromX = forward ? 28 : -28; // start to the right (fwd) / left (back)
        desktopGridEl.animate(
          [
            { opacity: 0, transform: `translateX(${fromX}px)` },
            { opacity: 1, transform: "translateX(0)" },
          ],
          {
            duration: 420,
            easing: "cubic-bezier(0.34, 1.5, 0.5, 1)",
            fill: "backwards",
          },
        );
      },
      { defer: true },
    ),
  );

  const activeIndex = () => {
    const idx = desktopVisible().findIndex((it) => entryKey(it) === activeId());
    return idx >= 0 ? idx : 0;
  };

  // The grid template animates on activeIndex change — the active column is
  // 2fr, the others 1fr. With fewer than four items the trailing columns
  // stay empty (the row deliberately doesn't stretch to fill).
  // Active card stays the clear focus (widest) but no longer hogs 2fr — at 2fr
  // it grew almost landscape and object-cover zoomed the poster past recognition.
  // 1.4fr keeps it the widest while staying close to the cover's portrait format,
  // so its cover crops far less, and hands the freed width to the other cards.
  const gridCols = () =>
    Array.from({ length: WAS_KOMMT_SHOWN }, (_, i) =>
      i === activeIndex() ? "1.4fr" : "1fr",
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
    const cols = row.map((it) => (entryKey(it) === activeId() ? "2fr" : "1fr"));
    // A lone trailing card (odd count) gets a padded 2-column track: it keeps a
    // normal column width (and still widens to 2fr when active) instead of
    // stretching full-width; the second column stays empty.
    if (cols.length === 1) cols.push("1fr");
    return cols.join(" ");
  };
  // Exactly one "hero" (the globally-first entry) so only it says "HEUTE".
  const isHeroItem = (item: UpcomingItem) =>
    entryKey(item) === entryKey(props.items[0]);

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
    if (entryKey(item) !== activeId()) {
      e.preventDefault();
      setActiveId(entryKey(item));
    }
  };
  const onCardKey = (item: UpcomingItem, e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (entryKey(item) === activeId()) {
        navigate(`/item/${item.type}/${item.slug}`);
      } else {
        setActiveId(entryKey(item));
      }
    }
  };
  const onCardEnter = (item: UpcomingItem) => {
    if (window.matchMedia("(hover: hover)").matches) setActiveId(entryKey(item));
  };

  return (
    <div>
      {/* ── Desktop: single-row 2fr-1fr-1fr-1fr accordion ──────────── */}
      <div
        ref={desktopGridEl}
        class="hidden gap-3 md:grid"
        style={{ "grid-template-columns": gridCols(), transition: SPRING }}
        onMouseLeave={() => {
          // Snap the highlight back to the first card ON THIS PAGE on
          // hover-capable devices only — touch's tap-to-activate stays
          // sticky. items[0] would point at page 1's card, which isn't
          // rendered on page ≥2: no card would carry the active state and
          // the backdrop would follow an invisible cover.
          if (window.matchMedia("(hover: hover)").matches) {
            setActiveId(entryKey(desktopVisible()[0]));
          }
        }}
      >
        <For each={desktopVisible()}>
          {(item, i) => {
            const active = () => entryKey(item) === activeId();
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
                class="group relative flex h-[26rem] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border bg-bg focus:outline-none"
                classList={{
                  "border-accent": active(),
                  "border-border": !active(),
                }}
                style={{ transition: COLOR_T }}
              >
                <WasKommtCardFace
                  item={item}
                  active={active()}
                  isHero={i() === 0}
                />
              </A>
            );
          }}
        </For>
      </div>

      {/* ── Mobile: 2-up grid, rows of two; active card springs wider ─ */}
      {/* <Index> (keys by POSITION) not <For> (keys by reference): rows() is a
          fresh array of fresh slices on every reveal, so <For> would remount
          ALL rows (covers re-fade = flash). With <Index> the existing rows stay
          mounted and only a newly-revealed index mounts — and the inner <For>
          still keys by item reference (stable across reveals), so the cards
          persist too. The new row's onMount then plays the enter animation. */}
      <div class="flex flex-col gap-3 md:hidden">
        <Index each={rows()}>
          {(row, i) => {
            let rowEl: HTMLDivElement | undefined;
            // Animate rows revealed AFTER the initial render (index past the
            // initial WAS_KOMMT_SHOWN rows) — they slide in from ABOVE and
            // settle down (von oben nach unten), the vertical counterpart to the
            // desktop pager's horizontal swap. Initial rows + reduced-motion
            // skip it. onMount fires only for freshly-mounted indices (Index),
            // so this targets exactly the newly-loaded row.
            onMount(() => {
              if (
                i < WAS_KOMMT_SHOWN / WAS_KOMMT_ROW ||
                window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
                !rowEl
              )
                return;
              rowEl.animate(
                [
                  { opacity: 0, transform: "translateY(-14px)" },
                  { opacity: 1, transform: "translateY(0)" },
                ],
                {
                  duration: 420,
                  easing: "cubic-bezier(0.34, 1.5, 0.5, 1)",
                  fill: "backwards",
                },
              );
            });
            return (
            <div
              ref={rowEl}
              class="grid gap-3"
              style={{
                "grid-template-columns": rowCols(row()),
                transition: SPRING,
              }}
            >
              <For each={row()}>
                {(item) => {
                  const active = () => entryKey(item) === activeId();
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
                      // Fixed height → only the WIDTH springs, so every card
                      // stays the same height and the 2×2 always reads as a
                      // filled rectangle. The cover fills the whole card via
                      // object-cover; the caption floats over it in a glass box.
                      class="group relative flex h-80 w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border bg-bg focus:outline-none"
                      classList={{
                        "border-accent": active(),
                        "border-border": !active(),
                      }}
                      style={{ transition: COLOR_T }}
                    >
                      <WasKommtCardFace
                        item={item}
                        active={active()}
                        isHero={isHeroItem(item)}
                      />
                    </A>
                  );
                }}
              </For>
            </div>
            );
          }}
        </Index>
      </div>

      {/* Desktop: numbered Pager (4 per page, like Fortsetzen). */}
      <div class="hidden md:block">
        <Pager page={page()} pageCount={pageCount()} onPage={setPage} />
      </div>

      {/* Mobile: reveal one more row (2 cards) per tap, and collapse back to the
          initial count once expanded. */}
      <Show when={mobileRemaining() > 0 || shown() > WAS_KOMMT_SHOWN}>
        <div class="mt-3 flex items-center gap-2 md:hidden">
          <Show when={mobileRemaining() > 0}>
            <button
              type="button"
              onClick={() => setShown((s) => s + WAS_KOMMT_ROW)}
              class="flex flex-1 items-center justify-center whitespace-nowrap rounded-xs py-2.5 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
            >
              +{mobileRemaining()} weitere
            </button>
          </Show>
          <Show when={shown() > WAS_KOMMT_SHOWN}>
            <button
              type="button"
              onClick={() => setShown(WAS_KOMMT_SHOWN)}
              class="flex flex-1 items-center justify-center whitespace-nowrap rounded-xs py-2.5 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
            >
              Weniger anzeigen
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/**
 * The card face shared by every Was-kommt card (desktop + mobile). The cover
 * fills the whole card (object-cover) and the caption floats over its lower edge
 * in a frosted glass box — accent-tinted when the card is active, neutral
 * otherwise. Replaces the old cover-on-top / caption-below-it split, so the card
 * reads as a poster with a glass label instead of an image with a footer.
 */
function WasKommtCardFace(props: {
  item: UpcomingItem;
  active: boolean;
  isHero: boolean;
}) {
  const cover = () =>
    props.item.coverUrl ? coverFor(props.item.coverUrl) ?? null : null;

  return (
    <>
      {/* Cover area — the cover fills the whole card width (object-cover), no
          side gaps. It crops to fit; the solid footer below carries the caption. */}
      <div class="relative min-h-0 flex-1 overflow-hidden">
        <Show
          when={cover()}
          fallback={
            <div class="flex h-full items-center justify-center">
              <span class="font-mono text-mini font-medium text-text-muted opacity-60">
                {typeInitial(props.item.type)}
              </span>
            </div>
          }
        >
          {(src) => (
            <img
              ref={fadeOnLoad}
              src={src()}
              alt=""
              class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 [transition-timing-function:var(--ease-quart)] group-hover:scale-[1.03]"
            />
          )}
        </Show>
      </div>

      {/* Footer — a clean solid panel below the cover: accent when the card is
          active, neutral (with a hairline off the cover) otherwise. The frosted
          mirrored-cover treatment was removed — glass stays reserved for the
          ambient depth layers, not micro-elements. */}
      <div
        class="shrink-0 border-t p-3"
        classList={{
          "border-accent bg-accent": props.active,
          "border-border bg-bg": !props.active,
        }}
      >
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
          {/* Lane label — only set when this item also appears on a different
              day for another lane (synced list vs own); names the synced one. */}
          <Show when={props.item.laneLabel}>
            {(l) => <span> · {l()}</span>}
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
                    {/* One line-1 companion on mobile (the count), everything
                        else folds into the meta line below — on a 390px
                        viewport the badge + list marker + count side by side
                        squeezed the title to nothing (REVIEW-2026-07 W1).
                        Desktop keeps badge-beside-title + the right block. */}
                    <div class="flex items-start gap-3">
                      <h3 class="min-w-0 truncate text-body font-medium text-text">
                        {item.title}
                      </h3>
                      <Show when={item.hasNewEpisode}>
                        <span class="hidden shrink-0 font-mono text-mini uppercase text-accent md:inline">
                          {newReleaseLabel(item.type, item.newEpisodeCount)}
                        </span>
                      </Show>
                    </div>
                    {/* Meta line. Mobile prefixes: NEUE FOLGE · ▤ LISTE ·
                        then season/episode · episode title. Right-truncating,
                        so the expendable episode-title tail clips first and
                        the disambiguators up front survive (two rows of the
                        same title = global + sync instance). */}
                    <p class="truncate font-mono text-mini text-text-muted">
                      <Show when={item.hasNewEpisode}>
                        <span class="uppercase text-accent md:hidden">
                          {newReleaseLabel(item.type, item.newEpisodeCount)}
                          {" · "}
                        </span>
                      </Show>
                      <Show when={item.listName}>
                        <span class="uppercase md:hidden">
                          <List
                            class="inline size-3 align-[-1.5px]"
                            strokeWidth={2}
                            aria-hidden
                          />{" "}
                          {item.listName}
                          {" · "}
                        </span>
                      </Show>
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
                        "▤ Reisegruppe · 3/23" — a list icon (this entry belongs
                        to that shared list). Absent for global entries; folded
                        into the meta line on mobile (see above). */}
                    <Show when={item.listName}>
                      <span class="hidden items-center gap-1.5 md:flex">
                        <List
                          class="size-3 shrink-0"
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span class="max-w-[8rem] truncate uppercase">
                          {item.listName}
                        </span>
                        <span aria-hidden>·</span>
                      </span>
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

function EmptyContinue(props: {
  firstRun: boolean;
  nextUp: NextUpItem[];
  onActiveCover: (url: string | null) => void;
}) {
  return (
    <div class="rounded-sm border border-border px-5 py-6">
      <Show
        when={props.firstRun}
        fallback={
          <div class="text-center">
            <p class="text-body text-text">Alles aufgeholt.</p>
            <p class="mt-1 text-body text-text-muted">Zeit für etwas Neues.</p>
          </div>
        }
      >
        <div class="text-center">
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
        </div>
      </Show>
      <Show when={props.nextUp.length > 0}>
        <NextUpStrip items={props.nextUp} onActiveCover={props.onActiveCover} />
      </Show>
    </div>
  );
}

/** Dock magnification tiers — width of a cover by its distance to the active
 *  tile (0 = active, 1 = direct neighbour, rest = base). The wave rides plain
 *  CSS width transitions with the WasKommt back-out bounce; siblings get
 *  pushed aside, which IS the dock read. */
const NEXT_UP_W = ["7rem", "5rem", "4rem"] as const;

/**
 * "Als Nächstes" — the answer to "Zeit für etwas Neues": unstarted entries
 * from the user's tracked lists as a macOS-dock-style cover shelf, pinned
 * first (item pins live on the shared list_items row — a couple that pins,
 * plans). Each tile links into the list-scoped item route, so sync toggle /
 * notes / co-watchers are right there to start the thing together.
 *
 * One tile is always ACTIVE (magnified): the FIRST one at rest — the sort is
 * pinned-first, so the resting magnification presents the group's top pick,
 * and the shelf always stands at full height (no gap jumps on first hover).
 * Hover moves the magnification (direct neighbours get a mid tier — the dock
 * wave); leaving snaps back to the first. Covers are bottom-aligned like a
 * dock shelf, and
 * the caption below always describes the active tile (full width — no
 * per-tile truncation), hard content swap per the motion language.
 *
 * Touch mirrors the "Was kommt" cards: first tap activates (preventing nav),
 * a second tap on the active tile navigates. Hover-activate is gated to
 * hover-capable devices (a tap fires a synthetic mouseenter first, which
 * would otherwise let the first tap navigate blind).
 *
 * Hovering also drives the page's ambient CoverBackdrop through
 * onActiveCover — the same "the atmosphere follows your eye" read as the
 * "Was kommt" cards. Only while the pointer is inside the shelf: the resting
 * middle-magnification deliberately does NOT claim the wash, so WasKommt's
 * active card keeps it at rest; leaving the shelf hands it back (null).
 */
function NextUpStrip(props: {
  items: NextUpItem[];
  onActiveCover: (url: string | null) => void;
}) {
  // Realtime can shrink the list mid-session — clamp so the shelf never ends
  // up with no active (= full-size) tile.
  const [active, setActive] = createSignal(0);
  const activeIdx = () => Math.min(active(), props.items.length - 1);
  const activeItem = () => props.items[activeIdx()];
  const hoverCapable = () => window.matchMedia("(hover: hover)").matches;

  // The shelf's box is FIXED so nothing outside it ever moves: height pinned
  // to the active tile's (mid-wave both movers dip below full size — an auto
  // height would wobble every layout below on each hover step), width pinned
  // to the interior-active sum (an edge-active tile has only ONE mid-tier
  // neighbour → 1rem less content; without a fixed width mx-auto would
  // re-center the whole row on every edge hover). The wave plays inside a
  // static frame; only the tiles themselves slide.
  const shelfWidth = () => {
    const n = props.items.length;
    const tiles = n >= 3 ? 7 + 2 * 5 + (n - 3) * 4 : n === 2 ? 7 + 5 : 7;
    return `${tiles + 0.75 * (n - 1)}rem`;
  };

  // The strip can unmount mid-hover (a partner's tick fills Fortsetzen via
  // realtime) — release the wash so no stale cover lingers.
  onCleanup(() => props.onActiveCover(null));

  return (
    <div class="mt-6">
      <p class="text-center font-mono text-mini uppercase tracking-wider text-text-muted">
        Als Nächstes
      </p>
      {/* Shelf height = active tile (10.5rem) + 0.5rem headroom: the bounce
          overshoots the width and (via aspect ratio) the height for a beat —
          without the slack the overflow container clips the cover's top edge
          mid-wave. mt-2 + the slack ≈ the old mt-4 visual gap. */}
      <div class="scrollbar-none -mx-1 mt-2 overflow-x-auto px-1">
        <ul
          class="mx-auto flex h-[11rem] items-end gap-3"
          style={{ width: shelfWidth() }}
          onMouseLeave={() => {
            props.onActiveCover(null);
            if (hoverCapable()) setActive(0);
          }}
        >
          <For each={props.items}>
          {(item, i) => {
            const tier = () => Math.min(Math.abs(i() - activeIdx()), 2);
            const isActive = () => i() === activeIdx();
            return (
              <li class="shrink-0">
                <A
                  href={`/lists/${item.listShortCode}/item/${item.type}/${item.slug}`}
                  class="group block"
                  aria-label={
                    isActive() ? `${item.title} öffnen` : `${item.title} ansehen`
                  }
                  onClick={(e: MouseEvent) => {
                    // First tap on an inactive tile activates instead of
                    // navigating (touch path; on desktop hover already
                    // activated it, so clicks always navigate there).
                    if (!isActive()) {
                      e.preventDefault();
                      setActive(i());
                    }
                  }}
                  onMouseEnter={() => {
                    props.onActiveCover(item.coverUrl);
                    if (hoverCapable()) setActive(i());
                  }}
                  onFocus={() => {
                    props.onActiveCover(item.coverUrl);
                    setActive(i());
                  }}
                >
                  <div
                    class="relative aspect-[2/3] overflow-hidden rounded-xs border bg-surface group-active:scale-[0.97]"
                    classList={{
                      "border-accent": isActive(),
                      "border-border": !isActive(),
                    }}
                    style={{
                      width: NEXT_UP_W[tier()],
                      // Back-out bounce on the wave (same recipe as the
                      // WasKommt pager swap); border-color stays ease-quart —
                      // overshooting a color reads as a flash, not a bounce.
                      transition:
                        "width 300ms cubic-bezier(0.34, 1.5, 0.5, 1), border-color 300ms var(--ease-quart)",
                    }}
                  >
                    <Show
                      when={item.coverUrl}
                      fallback={
                        <div class="flex size-full items-center justify-center font-mono text-mini text-text-muted">
                          {typeInitial(item.type)}
                        </div>
                      }
                    >
                      <img
                        ref={fadeOnLoad}
                        src={coverFor(item.coverUrl)!}
                        alt=""
                        class="size-full object-cover"
                        loading="lazy"
                      />
                    </Show>
                    <Show when={item.pinned}>
                      <PinBadge />
                    </Show>
                  </div>
                </A>
              </li>
            );
          }}
          </For>
        </ul>
      </div>
      {/* Caption — always the active tile's identity, full width so nothing
          truncates. Hard swap (content), only the shelf itself is liquid. */}
      <Show when={activeItem()}>
        {(item) => (
          <div class="mt-3 text-center">
            <p class="truncate text-body text-text" title={item().title}>
              {item().title}
            </p>
            <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
              {item().listName}
            </p>
          </div>
        )}
      </Show>
    </div>
  );
}

// ── 03 · Logbuch ──────────────────────────────────────────────────────

/**
 * Bundled-watch feed. Each event is a (actor, item, session) bundle — so a
 * cascade of 1100 episodes reads as one line "Du hast E1–E1100 von One Piece
 * gesehen" instead of 1100 orphan rows that would blow the row cap and surface
 * only outliers. Three independent filter toggles (Releases / Aktivität /
 * Eigene, tab-switcher look) pick which buckets show; the numbered Pager
 * (8/page) walks the rest. The active set persists to localStorage.
 */
const LOGBUCH_PER_PAGE = 12;
const LOGBUCH_FILTERS_KEY = "nakama:logbuch-filters";

/** The feed partitions into three NON-overlapping buckets, each toggled by its
 *  own button (multi-select): "releases" = the missed-release nudges (never
 *  self); "aktivitaet" = OTHER members' activity (watches, adds, completions,
 *  transfers); "eigene" = your own such activity. An event shows when its
 *  bucket is active. */
type LogbuchBucket = "releases" | "aktivitaet" | "eigene";

const LOGBUCH_BUCKETS: { key: LogbuchBucket; label: string }[] = [
  { key: "releases", label: "Releases" },
  { key: "aktivitaet", label: "Aktivität" },
  { key: "eigene", label: "Eigene" },
];

const bucketOf = (e: LogbookEvent): LogbuchBucket =>
  e.kind === "missed" ? "releases" : e.isSelf ? "eigene" : "aktivitaet";

/** One-time reduced-motion read — the bucket toggles just fade their fill
 *  (no scale bounce) when the user prefers reduced motion. */
const BUCKET_REDUCE_MOTION =
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Logbuch(props: { events: LogbookEvent[] }) {
  // Active buckets — read synchronously at setup (not onMount) so the feed
  // never flashes the default for a frame before the persisted choice applies.
  // No stored value → all three on (show everything); a stored empty string is
  // a valid "all off".
  const stored = localStorage.getItem(LOGBUCH_FILTERS_KEY);
  const initial: Set<LogbuchBucket> =
    stored === null
      ? new Set<LogbuchBucket>(["releases", "aktivitaet", "eigene"])
      : new Set(
          stored
            .split(",")
            .filter(
              (s): s is LogbuchBucket =>
                s === "releases" || s === "aktivitaet" || s === "eigene",
            ),
        );
  const [active, setActive] = createSignal<Set<LogbuchBucket>>(initial);
  const isOn = (b: LogbuchBucket) => active().has(b);
  const toggle = (b: LogbuchBucket) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      localStorage.setItem(LOGBUCH_FILTERS_KEY, [...next].join(","));
      return next;
    });
  };

  const filtered = () => props.events.filter((e) => active().has(bucketOf(e)));

  const [page, setPage] = createSignal(1);
  const pageCount = () =>
    Math.max(1, Math.ceil(filtered().length / LOGBUCH_PER_PAGE));
  // Clamp at read time — a toggle can shrink the list below the current page;
  // the reset-to-1 effect below covers user toggles, this guards the realtime-
  // refetch case.
  const shown = () => {
    const p = Math.min(page(), pageCount());
    const start = (p - 1) * LOGBUCH_PER_PAGE;
    return filtered().slice(start, start + LOGBUCH_PER_PAGE);
  };

  // Toggling a bucket re-scopes the feed → back to page 1 (old offset is
  // meaningless). Deferred so a realtime refetch doesn't yank the reader up.
  createEffect(on(active, () => setPage(1), { defer: true }));

  return (
    <div>
      {/* Filter — three frameless ghost toggles in the same style as the old
          footer buttons (mono mini-caps, hover lifts to surface, no frame/fill)
          so the control stays as quiet as the rest of the chrome. Each carries
          an eye that's open when its bucket shows and crossed when hidden (the
          old "Eigene ausblenden" metaphor); a hidden one also greys further.
          Toggling gives a small back-out pop; reduced motion skips it. */}
      <div role="group" aria-label="Logbuch filtern" class="mb-3 flex gap-1">
        <For each={LOGBUCH_BUCKETS}>
          {(b) => {
            let contentEl: HTMLSpanElement | undefined;
            // Tactile back-out pop on toggle (either direction) — the bounce.
            // Deferred so it fires only on a real toggle, not on mount; skipped
            // under reduced motion.
            createEffect(
              on(
                () => isOn(b.key),
                () => {
                  if (contentEl && !BUCKET_REDUCE_MOTION) {
                    contentEl.animate(
                      [{ transform: "scale(0.9)" }, { transform: "scale(1)" }],
                      {
                        duration: 320,
                        easing: "cubic-bezier(0.34, 1.5, 0.5, 1)",
                      },
                    );
                  }
                },
                { defer: true },
              ),
            );
            return (
              <button
                type="button"
                aria-pressed={isOn(b.key)}
                onClick={() => toggle(b.key)}
                class="flex flex-1 items-center justify-center rounded-xs py-2 font-mono text-mini uppercase tracking-wider transition hover:bg-surface"
                classList={{
                  "text-text": isOn(b.key),
                  "text-text-muted opacity-60 hover:text-text hover:opacity-100":
                    !isOn(b.key),
                }}
              >
                {/* aktiv = eingeblendet → offenes Auge; inaktiv = ausgeblendet
                    → durchgestrichenes Auge (the old "Eigene ausblenden"
                    visibility metaphor). */}
                <span ref={contentEl} class="flex items-center gap-1.5">
                  <Show
                    when={isOn(b.key)}
                    fallback={
                      <EyeOff
                        class="size-3.5 shrink-0"
                        strokeWidth={2}
                        aria-hidden
                      />
                    }
                  >
                    <Eye class="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  </Show>
                  {b.label}
                </span>
              </button>
            );
          }}
        </For>
      </div>
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
            Nichts in dieser Auswahl.
          </li>
        </Show>
      </ul>

      {/* Paging — same numbered Pager as everywhere else; replaces the old
          "+ Alle Ereignisse" reveal. */}
      <Pager page={page()} pageCount={pageCount()} onPage={setPage} />
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
        style={{ "grid-template-columns": "1.4fr 1fr 1fr 1fr" }}
      >
        <For each={Array.from({ length: WAS_KOMMT_SHOWN })}>
          {() => <Skeleton class="h-[26rem] w-full" />}
        </For>
      </div>
      <div class="grid grid-cols-2 gap-3 md:hidden">
        <For each={Array.from({ length: WAS_KOMMT_SHOWN })}>
          {() => <Skeleton class="h-80 w-full" />}
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
      <For each={Array.from({ length: LOGBUCH_PER_PAGE })}>
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

