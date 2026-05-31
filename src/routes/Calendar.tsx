import type { JSX } from "solid-js";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-solid";
import { highResCover } from "@/lib/anilist";
import { fadeOnLoad } from "@/lib/image-fade";
import { useAuth } from "@/lib/auth";
import {
  calendarEventsOptions,
  calendarQueryKey,
  WINDOW_AHEAD,
  WINDOW_BACK,
  type CalendarEvent,
} from "@/lib/queries/calendar";
import {
  addDays,
  addMonths,
  formatMonth,
  formatWeekRange,
  fromIsoDay,
  hasAirTime,
  isoDay,
  mondayOf,
  MONTH_ABBR_3,
  nextLabel,
  startOfMonth,
  timeLabel,
  typeInitial,
  typeLabel,
  WEEKDAYS_MON,
} from "@/lib/format";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { Segmented } from "@/components/Segmented";
import { Skeleton } from "@/components/Skeleton";

/**
 * Kalender (Phase 6) — week + month grid (left 2/3) + a day-pane (right 1/3),
 * same instrument layout as Home. One wide-window query feeds both views; the
 * grids re-bucket the cached events by day, so prev/next never refetches.
 *
 * Quick-tick: tapping a released episode in the day-pane toggles it watched;
 * long-press (or right-click) cascades everything up to it — the same gesture
 * vocabulary as the item-detail episode list, ported here. Both write through
 * the existing episode mutations and optimistically patch the calendar cache.
 */

type View = "week" | "month";

/** Selected row/cell highlight — accent-tinted bg. Today is signalled by the
 *  date number alone (accent-coloured), no background. */
const SELECTED_TINT = "color-mix(in srgb, var(--accent) 12%, transparent)";

export default function Calendar() {
  const auth = useAuth();

  const todayIso = isoDay(new Date());
  const [refDate, setRefDate] = createSignal(new Date());
  const [view, setView] = createSignal<View>("week");
  const [selectedIso, setSelectedIso] = createSignal(todayIso);

  // Loaded-data window anchor. It lazily FOLLOWS the viewed month: advanced
  // only once the viewed month reaches the EDGE-most loaded month, so
  // navigating within the window never refetches, and stepping to the edge
  // recenters + loads the next stretch. Because the recenter fires while the
  // edge month is still loaded (and placeholderData keeps the prior window
  // visible during the fetch), no empty month ever flashes.
  //
  // Loaded span is [anchor − WINDOW_BACK … anchor + WINDOW_AHEAD − 1]: the
  // query's upper bound is exclusive (lt air_date < anchor+WINDOW_AHEAD), so
  // the last fully-covered month is anchor + WINDOW_AHEAD − 1.
  const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const [windowAnchor, setWindowAnchor] = createSignal(
    startOfMonth(new Date()),
  );
  createEffect(() => {
    const viewed = monthIndex(refDate());
    const anchor = monthIndex(windowAnchor());
    const lowestLoaded = anchor - WINDOW_BACK;
    const highestLoaded = anchor + WINDOW_AHEAD - 1;
    if (viewed <= lowestLoaded || viewed >= highestLoaded) {
      setWindowAnchor(startOfMonth(refDate()));
    }
  });
  const anchorIso = createMemo(() => isoDay(windowAnchor()));

  const eventsQ = createQuery(() => ({
    ...calendarEventsOptions(auth.user()!, anchorIso()),
    enabled: !!auth.user(),
  }));

  // Episode watches + new episode metadata are the only changes that move the
  // calendar; list membership changes are caught on the next stale read. The
  // calendar shows only the caller's OWN seen-state (no co-member eye — that's
  // a shared-list-only signal), so a watch just refreshes the events query.
  useRealtimeInvalidation("calendar", [
    { table: "episode_watches", invalidates: [calendarQueryKey] },
    { table: "episodes", invalidates: [calendarQueryKey] },
  ]);

  // Events bucketed by local calendar day. Recomputed only when the query
  // data changes; both grids + the pane read from this one map.
  const byDay = createMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of eventsQ.data ?? []) {
      const arr = m.get(e.day);
      if (arr) arr.push(e);
      else m.set(e.day, [e]);
    }
    return m;
  });
  const dayEvents = (iso: string) => byDay().get(iso) ?? [];

  const weekDays = createMemo(() => {
    const mon = mondayOf(refDate());
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  });
  const monthDays = createMemo(() => {
    const mon = mondayOf(startOfMonth(refDate()));
    return Array.from({ length: 42 }, (_, i) => addDays(mon, i));
  });

  const step = (dir: 1 | -1) =>
    setRefDate((d) =>
      view() === "month" ? addMonths(d, dir) : addDays(d, dir * 7),
    );
  const goToday = () => {
    setRefDate(new Date());
    setSelectedIso(isoDay(new Date()));
  };
  // Date-picker jump: move the anchor AND select the picked day so the
  // day-pane immediately reflects the destination.
  const goToDate = (d: Date) => {
    setRefDate(d);
    setSelectedIso(isoDay(d));
  };
  const periodLabel = () =>
    view() === "month" ? formatMonth(refDate()) : formatWeekRange(refDate());

  // The calendar is a read-only information surface (like "Was kommt"):
  // progress is shown — own watched dot + the co-member Mitseher eye — but NOT
  // ticked here. Ticking lives on the item page only, where the global-vs-
  // instance lane is unambiguous (sync-instances model). A tick made there
  // flows back into the calendar via the episode_watches realtime channel
  // below, so the dots still update live.

  return (
    <main class="w-full">
      <PageHeader title="Kalender" />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Linke Spalte 2/3 — Controls + Grid. */}
        <div class="md:w-2/3">
          <BentoModule label="Übersicht" number="01">
            <Controls
              view={view()}
              periodLabel={periodLabel()}
              refDate={refDate()}
              todayIso={todayIso}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onToday={goToday}
              onPick={goToDate}
              onView={setView}
            />

            <Show
              when={!eventsQ.isLoading}
              fallback={<CalendarGridSkeleton view={view()} />}
            >
              {view() === "week" ? (
                <WeekGrid
                  days={weekDays()}
                  events={dayEvents}
                  todayIso={todayIso}
                  selectedIso={selectedIso()}
                  onSelect={setSelectedIso}
                />
              ) : (
                <MonthGrid
                  days={monthDays()}
                  refMonth={refDate().getMonth()}
                  events={dayEvents}
                  todayIso={todayIso}
                  selectedIso={selectedIso()}
                  onSelect={setSelectedIso}
                />
              )}
            </Show>
          </BentoModule>
        </div>

        {/* Rechte Spalte 1/3 — Tag-Pane. */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Tag" number="02">
            <DayPane
              iso={selectedIso()}
              events={dayEvents(selectedIso())}
              todayIso={todayIso}
            />
          </BentoModule>
        </div>
      </div>
    </main>
  );
}

// ── Controls ──────────────────────────────────────────────────────────

function Controls(props: {
  view: View;
  periodLabel: string;
  refDate: Date;
  todayIso: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPick: (d: Date) => void;
  onView: (v: View) => void;
}) {
  return (
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <StepButton label="Zurück" onClick={props.onPrev}>
          <ChevronLeft class="size-4" strokeWidth={1.75} aria-hidden />
        </StepButton>
        <DatePicker
          label={props.periodLabel}
          value={props.refDate}
          todayIso={props.todayIso}
          onPick={props.onPick}
        />
        <StepButton label="Weiter" onClick={props.onNext}>
          <ChevronRight class="size-4" strokeWidth={1.75} aria-hidden />
        </StepButton>
        <button
          type="button"
          onClick={props.onToday}
          class="ml-1 rounded-xs px-2 py-1 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          heute
        </button>
      </div>
      <Segmented
        value={props.view}
        onChange={props.onView}
        ariaLabel="Ansicht"
        options={[
          { value: "week", label: "Woche" },
          { value: "month", label: "Monat" },
        ]}
      />
    </div>
  );
}

/**
 * Period label that doubles as a jump-to-date popover. Clicking opens a mini
 * month grid (own browse-month state, seeded from the current anchor); ‹ ›
 * page the month, a day-cell jumps there and closes. Click-outside + Escape
 * dismiss. Dependency-free — same posture as SelectMenu / Tooltip.
 */
function DatePicker(props: {
  label: string;
  value: Date;
  todayIso: string;
  onPick: (d: Date) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [viewMonth, setViewMonth] = createSignal(startOfMonth(props.value));
  let wrapEl: HTMLDivElement | undefined;

  const toggle = () => {
    if (!open()) setViewMonth(startOfMonth(props.value)); // reseed on open
    setOpen((o) => !o);
  };
  const close = () => setOpen(false);

  const days = createMemo(() => {
    const mon = mondayOf(viewMonth());
    return Array.from({ length: 42 }, (_, i) => addDays(mon, i));
  });

  const pick = (d: Date) => {
    props.onPick(d);
    close();
  };

  onMount(() => {
    const onDocPointer = (e: PointerEvent) => {
      if (wrapEl && !wrapEl.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <div ref={wrapEl!} class="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open()}
        class="flex items-center gap-1 rounded-xs px-1 py-0.5 font-mono text-label uppercase tracking-wider text-text transition-colors hover:bg-surface"
      >
        {props.label}
        <ChevronDown
          class="size-3.5 text-text-muted"
          strokeWidth={1.75}
          aria-hidden
        />
      </button>

      <Show when={open()}>
        <div
          role="dialog"
          aria-label="Datum wählen"
          class="absolute left-0 top-full z-40 mt-2 w-64 rounded-sm border border-border bg-bg p-3 shadow-floating"
        >
          {/* Month pager. */}
          <div class="mb-2 flex items-center justify-between">
            <StepButton
              label="Vorheriger Monat"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft class="size-4" strokeWidth={1.75} aria-hidden />
            </StepButton>
            <span class="font-mono text-label text-text">
              {formatMonth(viewMonth())}
            </span>
            <StepButton
              label="Nächster Monat"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight class="size-4" strokeWidth={1.75} aria-hidden />
            </StepButton>
          </div>

          {/* Weekday header. */}
          <div class="grid grid-cols-7">
            <For each={WEEKDAYS_MON}>
              {(wd) => (
                <div class="py-1 text-center font-mono text-mini uppercase text-text-muted">
                  {wd}
                </div>
              )}
            </For>
          </div>

          {/* Day cells. */}
          <div class="grid grid-cols-7">
            <For each={days()}>
              {(d) => {
                const iso = isoDay(d);
                const inMonth = () => d.getMonth() === viewMonth().getMonth();
                const isToday = () => iso === props.todayIso;
                return (
                  <button
                    type="button"
                    onClick={() => pick(d)}
                    class="flex aspect-square items-center justify-center rounded-xs font-mono text-mini tabular-nums transition-colors hover:bg-surface"
                    classList={{
                      "opacity-40": !inMonth(),
                      "text-accent font-medium": isToday(),
                      "text-text": !isToday(),
                    }}
                  >
                    {d.getDate()}
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

function StepButton(props: {
  label: string;
  onClick: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      class="inline-flex size-8 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text"
    >
      {props.children}
    </button>
  );
}

// ── Week grid ─────────────────────────────────────────────────────────

/** Loading placeholder for the grid. Mirrors the week list (7 day rows) or the
 *  month matrix (weekday header + 6×7 bordered cells) so the real grid replaces
 *  it without a layout shift. */
function CalendarGridSkeleton(props: { view: View }) {
  return props.view === "week" ? (
    <ul class="-mx-5">
      <For each={Array.from({ length: 7 })}>
        {() => (
          <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
            <div class="flex items-start gap-3 px-5 py-3">
              <div class="w-12 shrink-0 space-y-1">
                <Skeleton class="h-3 w-6" />
                <Skeleton class="h-4 w-7" />
              </div>
              <div class="min-w-0 flex-1 pt-0.5">
                <Skeleton class="h-4 w-3/4" />
              </div>
            </div>
          </li>
        )}
      </For>
    </ul>
  ) : (
    <div>
      <div class="grid grid-cols-7 border-b border-border pb-2">
        <For each={Array.from({ length: 7 })}>
          {() => (
            <div class="flex justify-center">
              <Skeleton class="h-3 w-6" />
            </div>
          )}
        </For>
      </div>
      <div class="grid grid-cols-7">
        <For each={Array.from({ length: 42 })}>
          {() => (
            <div class="flex min-h-[4.5rem] flex-col gap-1 border-b border-r border-border p-2 [&:nth-child(7n)]:border-r-0">
              <Skeleton class="h-3 w-5" />
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function WeekGrid(props: {
  days: Date[];
  events: (iso: string) => CalendarEvent[];
  todayIso: string;
  selectedIso: string;
  onSelect: (iso: string) => void;
}) {
  return (
    <ul class="-mx-5">
      <For each={props.days}>
        {(d, i) => {
          const iso = isoDay(d);
          const evs = () => props.events(iso);
          // A week row fits two lines. Up to two events show in full; three
          // or more collapse to the first event + a "+N weitere" line.
          const shownEvs = () => (evs().length <= 2 ? evs() : evs().slice(0, 1));
          const moreCount = () => (evs().length <= 2 ? 0 : evs().length - 1);
          const isToday = () => iso === props.todayIso;
          const isSel = () => iso === props.selectedIso;
          return (
            <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
              <button
                type="button"
                onClick={() => props.onSelect(iso)}
                class="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-surface"
                style={isSel() ? { "background-color": SELECTED_TINT } : undefined}
              >
                {/* Weekday + date column. */}
                <div class="w-12 shrink-0">
                  <div class="font-mono text-mini uppercase tracking-wider text-text-muted">
                    {WEEKDAYS_MON[i()]}
                  </div>
                  <div
                    class="font-mono text-body tabular-nums"
                    classList={{
                      "text-accent": isToday(),
                      "text-text": !isToday(),
                    }}
                  >
                    {String(d.getDate()).padStart(2, "0")}
                  </div>
                </div>

                {/* Episodes for the day, or an em-dash placeholder. */}
                <div class="min-w-0 flex-1 space-y-1 pt-0.5">
                  <Show
                    when={evs().length > 0}
                    fallback={<span class="text-body text-text-muted">—</span>}
                  >
                    <For each={shownEvs()}>{(e) => <EventChip ev={e} />}</For>
                    <Show when={moreCount() > 0}>
                      <span class="block font-mono text-mini uppercase tracking-wider text-text-muted">
                        +{moreCount()} weitere
                      </span>
                    </Show>
                  </Show>
                </div>
              </button>
            </li>
          );
        }}
      </For>
    </ul>
  );
}

/** A single episode line inside a week-grid day. */
function EventChip(props: { ev: CalendarEvent }) {
  return (
    <div class="flex items-center gap-2">
      {/* Episode code stays a neutral muted label in every state (matches the
          day-pane + the other episodes). The released-unwatched signal lives
          in the hollow-accent dot + the brighter title — accenting the number
          on top read as a confusing double-highlight. */}
      <span class="shrink-0 font-mono text-mini tabular-nums text-text-muted">
        {nextLabel(props.ev.type, props.ev.episodeNumber)}
      </span>
      <span
        class="min-w-0 truncate text-body"
        classList={{
          "text-text-muted": props.ev.watched || !props.ev.released,
          "text-text": props.ev.released && !props.ev.watched,
        }}
      >
        {props.ev.title}
      </span>
      {/* Same dot vocabulary as the month grid: filled accent = watched,
          hollow accent = released-unwatched, hollow grey = upcoming. Sits
          directly behind the name at the same gap as to the episode code. */}
      <span
        aria-hidden
        class="size-2 shrink-0 rounded-full"
        classList={{
          "bg-accent": props.ev.watched,
          "bg-transparent ring-1 ring-accent":
            props.ev.released && !props.ev.watched,
          "bg-transparent ring-1 ring-border": !props.ev.released,
        }}
      />
    </div>
  );
}

// ── Month grid ────────────────────────────────────────────────────────

const MAX_DOTS = 6;

function MonthGrid(props: {
  days: Date[];
  refMonth: number;
  events: (iso: string) => CalendarEvent[];
  todayIso: string;
  selectedIso: string;
  onSelect: (iso: string) => void;
}) {
  return (
    <div>
      {/* Weekday header — same 7-col track as the cells so columns align. */}
      <div class="grid grid-cols-7 border-b border-border pb-2">
        <For each={WEEKDAYS_MON}>
          {(wd) => (
            <div class="text-center font-mono text-mini uppercase tracking-wider text-text-muted">
              {wd}
            </div>
          )}
        </For>
      </div>

      {/* 6×7 day cells. */}
      <div class="grid grid-cols-7">
        <For each={props.days}>
          {(d) => {
            const iso = isoDay(d);
            const evs = () => props.events(iso);
            const inMonth = () => d.getMonth() === props.refMonth;
            const isToday = () => iso === props.todayIso;
            const isSel = () => iso === props.selectedIso;
            return (
              <button
                type="button"
                onClick={() => props.onSelect(iso)}
                class="flex min-h-[4.5rem] flex-col gap-1 border-b border-r border-border p-2 text-left transition-colors hover:bg-surface [&:nth-child(7n)]:border-r-0"
                classList={{ "opacity-40": !inMonth() }}
                style={isSel() ? { "background-color": SELECTED_TINT } : undefined}
              >
                <span
                  class="font-mono text-mini tabular-nums"
                  classList={{
                    "text-accent font-medium": isToday(),
                    "text-text-muted": !isToday(),
                  }}
                >
                  {String(d.getDate()).padStart(2, "0")}
                </span>
                <Show when={evs().length > 0}>
                  <DayDots events={evs()} />
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </div>
  );
}

/** Dot row for a month cell — one dot per episode (max 6, then "+N"). */
function DayDots(props: { events: CalendarEvent[] }) {
  const shown = () => props.events.slice(0, MAX_DOTS);
  const overflow = () => props.events.length - MAX_DOTS;
  return (
    <div class="flex flex-wrap items-center gap-1">
      <For each={shown()}>
        {(e) => (
          <span
            aria-hidden
            // Filled accent = watched; hollow accent = released-but-unwatched
            // (the "you missed this" state, glanceable); hollow grey = not yet
            // aired. Mirrors the item-detail dot, with a third upcoming tier.
            class="size-2 rounded-full"
            classList={{
              "bg-accent": e.watched,
              "bg-transparent ring-1 ring-accent": e.released && !e.watched,
              "bg-transparent ring-1 ring-border": !e.released,
            }}
          />
        )}
      </For>
      <Show when={overflow() > 0}>
        <span class="font-mono text-mini tabular-nums text-text-muted">
          +{overflow()}
        </span>
      </Show>
    </div>
  );
}

// ── Day-pane ──────────────────────────────────────────────────────────

function DayPane(props: {
  iso: string;
  events: CalendarEvent[];
  todayIso: string;
}) {
  const date = () => fromIsoDay(props.iso);
  const isToday = () => props.iso === props.todayIso;
  const weekdayLong = () =>
    date().toLocaleDateString("de-DE", { weekday: "long" });
  const dateText = () =>
    `${String(date().getDate()).padStart(2, "0")}. ${MONTH_ABBR_3[date().getMonth()]}`;
  // Right-aligned mono date; today gains a "HEUTE · " prefix and the accent.
  // uppercase makes the month caps → "HEUTE · 30. MAI".
  const dateLine = () => (isToday() ? `Heute · ${dateText()}` : dateText());

  return (
    <div>
      {/* Day header: weekday left, date right-aligned. Today is the accent
          "HEUTE · 30. MAI" line; other days the muted date. */}
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h3 class="text-body-lg font-medium text-text">{weekdayLong()}</h3>
        <span
          class="shrink-0 font-mono text-label uppercase tabular-nums"
          classList={{
            "text-accent": isToday(),
            "text-text-muted": !isToday(),
          }}
        >
          {dateLine()}
        </span>
      </div>

      <Show
        when={props.events.length > 0}
        fallback={
          <p class="py-4 text-body text-text-muted">
            Keine Folgen an diesem Tag.
          </p>
        }
      >
        {/* Index, not For: a realtime refetch (a tick made on the item page)
            replaces each event's object identity. A reference-keyed For would
            dispose + remount the row on every refetch, and the freshly-inserted
            DOM node loses its :hover for a frame. Index keys by position, so the
            row stays mounted and just its reactive props.ev updates. */}
        <ul class="-mx-5">
          <Index each={props.events}>
            {(ev) => <DayPaneRow ev={ev()} />}
          </Index>
        </ul>
      </Show>
    </div>
  );
}

/**
 * One episode in the day-pane — a READ-ONLY information row (handshake #1: the
 * calendar shows progress but isn't a tick surface; ticking happens on the item
 * page). On the right it carries only the caller's OWN watched dot — the
 * co-member eye is a shared-list-only signal and never appears in the calendar.
 * Released vs upcoming only changes the text colour + meta line.
 */
function DayPaneRow(props: { ev: CalendarEvent }) {
  const cover = () => highResCover(props.ev.coverUrl) ?? props.ev.coverUrl;
  const epLabel = () => nextLabel(props.ev.type, props.ev.episodeNumber);
  // Meta line under the title: the air TIME instead of the episode title — in
  // the calendar "when does it drop" beats the episode name (which lives on
  // the item page). Future episodes without a known time keep the "noch nicht
  // erschienen" hint; the dimmed style already marks them as upcoming.
  const metaLine = () =>
    hasAirTime(props.ev.airDate)
      ? `${epLabel()} · ${timeLabel(props.ev.airDate)}`
      : props.ev.released
        ? epLabel()
        : `${epLabel()} · noch nicht erschienen`;
  const textClass = () => (props.ev.released ? "text-text" : "text-text-muted");

  return (
    <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
      {/* Pure indicator row — no link, no tick. Just shows what airs and
          whether it's been seen (own dot + co-member eye). */}
      <div class="flex items-center gap-3 px-5">
        <div class="my-2.5 block h-[5.33rem] w-16 shrink-0 overflow-hidden rounded-xs border border-border bg-surface">
          <Show
            when={cover()}
            fallback={
              <div class="flex h-full items-center justify-center font-mono text-mini text-text-muted opacity-50">
                {typeInitial(props.ev.type)}
              </div>
            }
          >
            <img
              ref={fadeOnLoad}
              src={cover()!}
              alt=""
              class="h-full w-full object-cover"
            />
          </Show>
        </div>

        <div class="flex min-w-0 flex-1 items-center gap-3 py-2.5">
          <div class="min-w-0 flex-1">
            <span class="block font-mono text-mini uppercase tracking-[0.15em] text-text-muted">
              {typeLabel(props.ev.type)}
            </span>
            <p class={`truncate text-body ${textClass()}`}>{props.ev.title}</p>
            <p class="truncate font-mono text-mini text-text-muted">
              {metaLine()}
            </p>
          </div>

          {/* Own watched dot only (no co-member eye in the calendar): filled
              accent = watched, hollow ring = not yet. Read-only indicator. */}
          <span
            aria-hidden
            class={`size-2 shrink-0 rounded-full transition-colors ${
              props.ev.watched
                ? "bg-accent"
                : "bg-transparent ring-1 ring-border"
            }`}
          />
        </div>
      </div>
    </li>
  );
}
