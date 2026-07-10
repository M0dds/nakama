import type { JSX } from "solid-js";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Index,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-solid";
import { coverFor } from "@/lib/cover";
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
  formatMonthAbbr,
  formatWeekRange,
  fromIsoDay,
  isoDay,
  mondayOf,
  MONTH_ABBR_3,
  nextLabel,
  startOfMonth,
  typeInitial,
  typeLabel,
  WEEKDAYS_MON,
} from "@/lib/format";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { CoverBackdrop } from "@/components/CoverBackdrop";
import { QueryErrorCard } from "@/components/QueryErrorCard";
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
  // Mobile month drawer (the week-dial's tap target). Desktop has the
  // Woche/Monat Segmented instead.
  const [monthOpen, setMonthOpen] = createSignal(false);
  // Ambient cover backdrop follows the focused day-pane event (default: the
  // selected day's first event). Driven from DayPane via onActiveCover.
  const [washCover, setWashCover] = createSignal<string | null>(null);

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
  // Wash fallback: the day-pane drives the backdrop from the SELECTED day,
  // which yields null on quiet days (mobile: today, with no selection UI) —
  // the calendar then sat washless next to every other page. Fall back to
  // the viewed week's first event.
  const weekFirstCover = createMemo(() => {
    for (const d of weekDays()) {
      const evs = dayEvents(isoDay(d));
      if (evs.length > 0)
        return coverFor(evs[0].coverUrl) ?? evs[0].coverUrl ?? null;
    }
    return null;
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
  // Month view: 3-letter abbreviation (fixed width) so the "Weiter"-chevron
  // doesn't jump as the month name length changes between steps (F6). The
  // popover's own month label keeps the long form — it's centered between
  // justify-between chevrons, so it never shifts them.
  const periodLabel = () =>
    view() === "month"
      ? formatMonthAbbr(refDate())
      : formatWeekRange(refDate());

  // The calendar is a read-only information surface (like "Was kommt"):
  // progress is shown — own watched dot + the co-member Mitseher eye — but NOT
  // ticked here. Ticking lives on the item page only, where the global-vs-
  // instance lane is unambiguous (sync-instances model). A tick made there
  // flows back into the calendar via the episode_watches realtime channel
  // below, so the dots still update live.

  return (
    <main class="w-full">
      <CoverBackdrop coverUrl={washCover() ?? weekFirstCover()} />
      <PageHeader title="Kalender" />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Linke Spalte 2/3 — Controls + Grid. */}
        <div class="md:w-2/3">
          <BentoModule label="Übersicht" number="01">
            {/* Desktop instrument row (stepper + picker + heute + Segmented).
                Mobile ersetzt das komplett durch das Wochen-Dial — die
                kleinteilige Button-Reihe konkurrierte mit sich selbst
                (User-Call 2026-07-10). */}
            <div class="max-md:hidden">
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
            </div>
            {/* Mobile week dial: swipe ↔ steps the week, tap opens the month
                drawer. Always the week — mobile has no month VIEW, the
                drawer replaces it. */}
            <WeekDial
              refDate={refDate()}
              todayIso={todayIso}
              events={dayEvents}
              onStep={(dir) => setRefDate((d) => addDays(d, dir * 7))}
              onOpenMonth={() => setMonthOpen(true)}
            />

            {/* Error gate FIRST — a failed query must not render as an
                empty week/month (indistinguishable from a quiet one). */}
            <Show
              when={!eventsQ.isError}
              fallback={
                <QueryErrorCard
                  class="mt-4"
                  onRetry={() => void eventsQ.refetch()}
                />
              }
            >
              <Show
                when={!eventsQ.isLoading}
                fallback={<CalendarGridSkeleton view={view()} />}
              >
                {/* Desktop: week grid or month grid, feeding the day-pane. */}
                <div class="max-md:hidden">
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
                </div>
                {/* Mobile: the week IS the day list — a vertical agenda
                    with cover-rows under each day, no selection, no
                    separate day-pane (mobile rework 2026-07-09). */}
                <div class="md:hidden">
                  <WeekAgenda
                    days={weekDays()}
                    events={dayEvents}
                    todayIso={todayIso}
                    onStep={(dir) => setRefDate((d) => addDays(d, dir * 7))}
                  />
                </div>
              </Show>
            </Show>
          </BentoModule>
        </div>

        {/* Rechte Spalte 1/3 — Tag-Pane. Desktop-only: mobil ist die Woche
            selbst die Tagesliste (WeekAgenda), ein zweites "Tag"-Abteil
            darunter wäre ein Duplikat unterm Fold. hidden statt unmount —
            der DayPane-Effect treibt weiter den Backdrop-Wash. */}
        <div class="border-t border-rule max-md:hidden md:w-1/3 md:border-t-0">
          <BentoModule label="Tag" number="02">
            <DayPane
              iso={selectedIso()}
              events={dayEvents(selectedIso())}
              todayIso={todayIso}
              onActiveCover={setWashCover}
            />
          </BentoModule>
        </div>
      </div>

      {/* Mobile month drawer — opened by tapping the week dial. */}
      <MonthDrawer
        open={monthOpen()}
        onClose={() => setMonthOpen(false)}
        anchor={refDate()}
        todayIso={todayIso}
        selectedIso={selectedIso()}
        events={dayEvents}
        onPick={(d) => {
          goToDate(d);
          setMonthOpen(false);
        }}
        onToday={() => {
          goToday();
          setMonthOpen(false);
        }}
      />
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
                    {String(d.getDate()).padStart(2, "0")}.
                  </div>
                </div>

                {/* Episodes for the day, or an em-dash placeholder. */}
                <div class="min-w-0 flex-1 space-y-0.5 pt-0.5">
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

// ── Snap stepper (mobile swipe) ───────────────────────────────────────

/**
 * Infinite 3-page snap carousel core, shared by the week dial + the month
 * drawer: the scroller holds [prev, current, next] pages and parks on the
 * middle one. When a swipe settles on a side page, report the step and
 * instantly re-center — the consumer's state change re-renders the middle
 * page to exactly what's on screen, so nothing visibly jumps. Settling is
 * detected by scroll-quiet (120 ms) instead of `scrollend` (still patchy on
 * iOS), and deferred while a finger is down — recentering under a held
 * touch would yank the strip. Recenters on resize (incl. crossing the md
 * boundary, where a hidden scroller has width 0). Returns a disposer.
 */
function attachSnapStepper(
  el: HTMLElement,
  onStep: (dir: 1 | -1) => void,
): () => void {
  const center = () => {
    el.scrollLeft = el.clientWidth;
  };
  center();

  let timer: ReturnType<typeof setTimeout> | undefined;
  let touching = false;
  const settle = () => {
    if (touching) return;
    const w = el.clientWidth;
    if (!w) return;
    const idx = Math.round(el.scrollLeft / w);
    if (idx !== 1) {
      onStep(idx > 1 ? 1 : -1);
      center();
    }
  };
  const kick = () => {
    clearTimeout(timer);
    timer = setTimeout(settle, 120);
  };
  const onTouchStart = () => {
    touching = true;
    clearTimeout(timer);
  };
  const onTouchEnd = () => {
    touching = false;
    kick();
  };
  const onResize = () => {
    clearTimeout(timer);
    center();
  };
  el.addEventListener("scroll", kick, { passive: true });
  el.addEventListener("touchstart", onTouchStart, { passive: true });
  el.addEventListener("touchend", onTouchEnd, { passive: true });
  el.addEventListener("touchcancel", onTouchEnd, { passive: true });
  window.addEventListener("resize", onResize);
  return () => {
    clearTimeout(timer);
    el.removeEventListener("scroll", kick);
    el.removeEventListener("touchstart", onTouchStart);
    el.removeEventListener("touchend", onTouchEnd);
    el.removeEventListener("touchcancel", onTouchEnd);
    window.removeEventListener("resize", onResize);
  };
}

// ── Week dial (mobile) ────────────────────────────────────────────────

/**
 * Mobile week navigator — an instrument DIAL above the agenda, replacing
 * the stepper/picker/heute button row (three competing control families;
 * user call 2026-07-10). Two gestures only: SWIPE ↔ steps the week, TAP
 * opens the month drawer.
 *
 * The swipe rides `attachSnapStepper` (shared with the month drawer).
 * Native scrolling means the browser's own axis-lock keeps vertical page
 * scrolls off the dial, and a tap that PANNED never fires click — so the
 * tap-to-open-drawer and the swipe never fight.
 */
function WeekDial(props: {
  refDate: Date;
  todayIso: string;
  events: (iso: string) => CalendarEvent[];
  onStep: (dir: 1 | -1) => void;
  onOpenMonth: () => void;
}) {
  let scroller!: HTMLDivElement;

  const weekOf = (offset: number) => {
    const mon = addDays(mondayOf(props.refDate), offset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  };
  // Cross-month weeks label by their DOMINANT month (the Thursday — ISO
  // week convention), so "29.06 – 05.07" reads as Juli.
  const monthLabel = () =>
    formatMonth(addDays(mondayOf(props.refDate), 3));

  onMount(() => {
    onCleanup(attachSnapStepper(scroller, props.onStep));
  });

  return (
    <div class="-mx-5 border-b border-border md:hidden">
      {/* Dial label = the drawer affordance. */}
      <button
        type="button"
        onClick={props.onOpenMonth}
        aria-label="Monatskalender öffnen"
        class="flex w-full items-center justify-center gap-1 pb-1 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-text"
      >
        {monthLabel()}
        <ChevronDown class="size-3" strokeWidth={1.75} aria-hidden />
      </button>
      {/* Week pages. Tap (never fired after a pan) also opens the drawer. */}
      <div
        ref={scroller}
        class="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
        onClick={props.onOpenMonth}
      >
        <Index each={[-1, 0, 1]}>
          {(off) => (
            <div class="grid w-full shrink-0 snap-center grid-cols-7">
              <For each={weekOf(off())}>
                {(d, i) => {
                  const iso = isoDay(d);
                  const isToday = () => iso === props.todayIso;
                  // One aggregated dot per day — a dial shows density, the
                  // agenda below carries the detail. Strongest state wins:
                  // released-unwatched (hollow accent) > watched (filled) >
                  // upcoming (hollow grey).
                  const dot = () => {
                    const evs = props.events(iso);
                    if (evs.length === 0) return "none";
                    if (evs.some((e) => e.released && !e.watched))
                      return "open";
                    if (evs.some((e) => e.watched)) return "seen";
                    return "upcoming";
                  };
                  return (
                    <div class="flex flex-col items-center gap-1 pb-3 pt-1">
                      <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
                        {WEEKDAYS_MON[i()]}
                      </span>
                      <span
                        class="font-mono text-body tabular-nums leading-none"
                        classList={{
                          "text-accent": isToday(),
                          "text-text": !isToday(),
                        }}
                      >
                        {String(d.getDate()).padStart(2, "0")}.
                      </span>
                      <span
                        aria-hidden
                        class="size-1.5 rounded-full"
                        classList={{
                          invisible: dot() === "none",
                          "bg-accent": dot() === "seen",
                          "bg-transparent ring-1 ring-accent": dot() === "open",
                          "bg-transparent ring-1 ring-border":
                            dot() === "upcoming",
                        }}
                      />
                    </div>
                  );
                }}
              </For>
            </div>
          )}
        </Index>
      </div>
    </div>
  );
}

// ── Month drawer (mobile) ─────────────────────────────────────────────

/**
 * Month calendar as a BOTTOM sheet — the week dial's tap target, replacing
 * the mobile month VIEW entirely. Bottom, not top (user call 2026-07-10):
 * the grid lands in thumb reach for the follow-up day-tap, it's the iOS
 * sheet idiom, and the dial stays visible above as context. Browses months
 * with its own state (re-seeded from the viewed week on every open);
 * picking a day jumps the agenda to that week and closes. Always mounted
 * (cheap static grid), animated by class toggles — slide from the bottom
 * edge + the dialogs' scrim recipe; pointer-events gate the closed state.
 */
function MonthDrawer(props: {
  open: boolean;
  onClose: () => void;
  anchor: Date;
  todayIso: string;
  selectedIso: string;
  events: (iso: string) => CalendarEvent[];
  onPick: (d: Date) => void;
  onToday: () => void;
}) {
  let scroller!: HTMLDivElement;
  const [viewMonth, setViewMonth] = createSignal(startOfMonth(props.anchor));
  createEffect(() => {
    if (props.open) setViewMonth(startOfMonth(props.anchor));
  });
  const days42 = (m: Date) => {
    const mon = mondayOf(m);
    return Array.from({ length: 42 }, (_, i) => addDays(mon, i));
  };

  onMount(() => {
    onCleanup(
      attachSnapStepper(scroller, (dir) =>
        setViewMonth((m) => addMonths(m, dir)),
      ),
    );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && props.open) props.onClose();
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <div class="md:hidden">
      {/* Scrim — the dialogs' recipe. */}
      <button
        type="button"
        aria-label="Schließen"
        tabindex={props.open ? 0 : -1}
        onClick={props.onClose}
        class="fixed inset-0 z-40 transition-all duration-500 [transition-timing-function:var(--ease-quart)]"
        classList={{
          "bg-black/50 backdrop-blur-sm": props.open,
          "pointer-events-none bg-black/0 backdrop-blur-none": !props.open,
        }}
      />
      {/* Sheet from the bottom edge. Fixed at a viewport edge ⇒ carries the
          safe-area inset (edge-to-edge rule, handshake §iOS/Mobile). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Monatskalender"
        class="fixed inset-x-0 bottom-0 z-50 border-t border-rule bg-bg px-5 pt-4 shadow-floating transition-transform duration-500 [transition-timing-function:var(--ease-quart)] motion-reduce:transition-none"
        style={{ "padding-bottom": "calc(var(--safe-bottom) + 1rem)" }}
        classList={{
          "translate-y-0": props.open,
          "pointer-events-none translate-y-full": !props.open,
        }}
      >
        {/* Month pager + heute. */}
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <StepButton
              label="Vorheriger Monat"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft class="size-4" strokeWidth={1.75} aria-hidden />
            </StepButton>
            <span class="min-w-24 text-center font-mono text-label uppercase tracking-wider text-text">
              {formatMonth(viewMonth())}
            </span>
            <StepButton
              label="Nächster Monat"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight class="size-4" strokeWidth={1.75} aria-hidden />
            </StepButton>
          </div>
          <button
            type="button"
            onClick={props.onToday}
            class="rounded-xs px-2 py-1 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            heute
          </button>
        </div>
        {/* Static weekday header — the pages below swipe, identical header
            copy sliding along would read as jitter. */}
        <WeekdayHeader />
        {/* Month pages: swipe ↔ steps the month (same carousel core as the
            week dial), chevrons above stay as the discrete/a11y path. */}
        <div
          ref={scroller}
          class="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
        >
          <Index each={[-1, 0, 1]}>
            {(off) => (
              <div class="w-full shrink-0 snap-center">
                <MonthGrid
                  days={days42(addMonths(viewMonth(), off()))}
                  refMonth={addMonths(viewMonth(), off()).getMonth()}
                  events={props.events}
                  todayIso={props.todayIso}
                  selectedIso={props.selectedIso}
                  maxDots={3}
                  hideWeekdayHeader
                  onSelect={(iso) => props.onPick(fromIsoDay(iso))}
                />
              </div>
            )}
          </Index>
        </div>
      </div>
    </div>
  );
}

// ── Week agenda (mobile) ──────────────────────────────────────────────

/**
 * Mobile week agenda (< md) — the week rendered as ONE vertical day list:
 * each day is a slim header line (weekday + date, today accented + tinted),
 * its episodes follow as full cover-rows (the DayPaneRow idiom — the exact
 * row the desktop day-pane uses, so the vocabulary stays identical). Days
 * without events stay one quiet line. This replaces grid + day-pane on
 * mobile: nothing to select, no duplicate below the fold — the week IS the
 * day list. Read-only like every calendar surface (handshake §Gotchas).
 */
function WeekAgenda(props: {
  days: Date[];
  events: (iso: string) => CalendarEvent[];
  todayIso: string;
  onStep: (dir: 1 | -1) => void;
}) {
  let rootEl!: HTMLDivElement;

  // Only days that actually carry something — the dial above already shows
  // the full week (incl. quiet days), repeating empty rows here was noise
  // (user call, 2026-07-10). Weekday labels via getDay(), NOT the loop
  // index: after filtering, position no longer maps to the weekday.
  const activeDays = () =>
    props.days.filter((d) => props.events(isoDay(d)).length > 0);
  const weekdayAbbr = (d: Date) => WEEKDAYS_MON[(d.getDay() + 6) % 7];

  // Horizontal flick on the list steps the week, same result as swiping the
  // dial. NOT a drag-carousel like dial/drawer: the agenda's height varies
  // wildly between weeks, a 3-page strip would size to the tallest
  // neighbor. Instead the flick hard-swaps the content and slides it in
  // FROM the swipe direction — the WasKommt pager idiom (translateX ±28px,
  // back-out bounce). Observing listeners only (passive, no preventDefault)
  // — vertical scrolling stays native, the axis check filters it out.
  onMount(() => {
    let sx = 0;
    let sy = 0;
    let st = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      sx = t.clientX;
      sy = t.clientY;
      st = performance.now();
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const isFlick =
        Math.abs(dx) > 56 &&
        Math.abs(dx) > 1.6 * Math.abs(dy) &&
        performance.now() - st < 600;
      if (!isFlick) return;
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      // Solid applies the signal synchronously — the animation below already
      // plays on the NEW week's rows.
      props.onStep(dir);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        rootEl.animate(
          {
            transform: [`translateX(${dir * 28}px)`, "translateX(0)"],
            opacity: [0, 1],
          },
          { duration: 300, easing: "cubic-bezier(0.34, 1.5, 0.5, 1)" },
        );
      }
    };
    rootEl.addEventListener("touchstart", onStart, { passive: true });
    rootEl.addEventListener("touchend", onEnd, { passive: true });
    onCleanup(() => {
      rootEl.removeEventListener("touchstart", onStart);
      rootEl.removeEventListener("touchend", onEnd);
    });
  });

  return (
    <div ref={rootEl}>
    <Show
      when={activeDays().length > 0}
      fallback={
        <p class="py-4 text-body text-text-muted">
          Keine Folgen in dieser Woche.
        </p>
      }
    >
      <ul class="-mx-5">
        <For each={activeDays()}>
          {(d) => {
            const iso = isoDay(d);
            const evs = () => props.events(iso);
            const isToday = () => iso === props.todayIso;
            return (
              <li
                class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden"
                style={
                  isToday() ? { "background-color": SELECTED_TINT } : undefined
                }
              >
                {/* Day header — same weekday/date vocabulary as the grids. */}
                <div class="flex items-baseline gap-2 px-5 pb-0.5 pt-3">
                  <span class="w-8 shrink-0 font-mono text-mini uppercase tracking-wider text-text-muted">
                    {weekdayAbbr(d)}
                  </span>
                  <span
                    class="font-mono text-body tabular-nums"
                    classList={{
                      "text-accent": isToday(),
                      "text-text": !isToday(),
                    }}
                  >
                    {String(d.getDate()).padStart(2, "0")}.
                  </span>
                  <Show when={isToday()}>
                    <span class="font-mono text-mini uppercase tracking-wider text-accent">
                      · Heute
                    </span>
                  </Show>
                </div>
                {/* Cover-rows. Index, not For — same realtime-identity
                    reasoning as the day-pane list. The rows' own hairlines
                    separate them; the last one yields to the day boundary. */}
                <ul>
                  <Index each={evs()}>{(ev) => <DayPaneRow ev={ev()} />}</Index>
                </ul>
              </li>
            );
          }}
        </For>
      </ul>
    </Show>
    </div>
  );
}

// ── Month grid ────────────────────────────────────────────────────────

const MAX_DOTS = 6;

/** Weekday header row — the 7-col track matching the month cells. Also
 *  rendered standalone by the month drawer, ABOVE its swipe pages, so the
 *  header stays put while the cells slide. */
function WeekdayHeader() {
  return (
    <div class="grid grid-cols-7 border-b border-border pb-2">
      <For each={WEEKDAYS_MON}>
        {(wd) => (
          <div class="text-center font-mono text-mini uppercase tracking-wider text-text-muted">
            {wd}
          </div>
        )}
      </For>
    </div>
  );
}

function MonthGrid(props: {
  days: Date[];
  refMonth: number;
  events: (iso: string) => CalendarEvent[];
  todayIso: string;
  selectedIso: string;
  /** Dot budget per cell — the mobile navigator cells fit fewer. */
  maxDots?: number;
  /** The drawer renders ONE static header above its swiping pages. */
  hideWeekdayHeader?: boolean;
  onSelect: (iso: string) => void;
}) {
  return (
    <div>
      <Show when={!props.hideWeekdayHeader}>
        <WeekdayHeader />
      </Show>

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
                class="flex flex-col gap-1 border-b border-r border-border p-2 text-left transition-colors hover:bg-surface max-md:aspect-square max-md:p-1.5 md:min-h-[4.5rem] [&:nth-child(7n)]:border-r-0"
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
                  <DayDots events={evs()} max={props.maxDots} />
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
function DayDots(props: { events: CalendarEvent[]; max?: number }) {
  const cap = () => props.max ?? MAX_DOTS;
  const shown = () => props.events.slice(0, cap());
  const overflow = () => props.events.length - cap();
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
  onActiveCover?: (url: string | null) => void;
}) {
  // Cover backdrop: hovering an event reports its cover up; default to the
  // selected day's first event. Deps are the DAY (iso) + the first event's
  // IDENTITY (episodeId, not the object) — iso alone fires once on mount
  // while events is still [] (cold load: no default wash until the first
  // hover), and the object reference would refire on every realtime refetch
  // (same day, new event objects) and clobber a live hover.
  const coverOf = (e?: CalendarEvent) =>
    e ? coverFor(e.coverUrl) ?? e.coverUrl ?? null : null;
  createEffect(
    on(
      [() => props.iso, () => props.events[0]?.episodeId],
      () => props.onActiveCover?.(coverOf(props.events[0])),
    ),
  );

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
        <ul
          class="-mx-5"
          onMouseLeave={() => props.onActiveCover?.(coverOf(props.events[0]))}
        >
          <Index each={props.events}>
            {(ev) => (
              <DayPaneRow ev={ev()} onHover={(c) => props.onActiveCover?.(c)} />
            )}
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
function DayPaneRow(props: {
  ev: CalendarEvent;
  onHover?: (cover: string | null) => void;
}) {
  const cover = () => coverFor(props.ev.coverUrl) ?? props.ev.coverUrl;
  const epLabel = () => nextLabel(props.ev.type, props.ev.episodeNumber);
  // Meta line under the title: the episode label, with a "noch nicht
  // erschienen" hint for upcoming ones (the dimmed style already marks them).
  // Air dates are date-only app-wide — the day is the grid position, there is
  // no clock time to show.
  const metaLine = () =>
    props.ev.released ? epLabel() : `${epLabel()} · noch nicht erschienen`;
  const textClass = () => (props.ev.released ? "text-text" : "text-text-muted");

  return (
    <li
      class="group/row relative isolate after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden"
      onMouseEnter={() => props.onHover?.(cover() ?? null)}
    >
      {/* Hover fill — inset 1px on the LEFT so it stops at the column guide
          (the day-pane is the right column, same as the Logbuch feed), bleeds
          right to the viewport edge. isolate + -z-10 keeps it behind the
          content but in front of the guide. */}
      <span
        aria-hidden
        class="pointer-events-none absolute inset-y-0 left-px right-0 -z-10 bg-surface opacity-0 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] group-hover/row:opacity-100"
      />
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
