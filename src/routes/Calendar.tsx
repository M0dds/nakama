import type { JSX } from "solid-js";
import {
  createMemo,
  createSignal,
  For,
  Index,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { A } from "@solidjs/router";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-solid";
import { highResCover } from "@/lib/anilist";
import { useAuth } from "@/lib/auth";
import {
  calendarEventsKey,
  calendarEventsOptions,
  calendarQueryKey,
  type CalendarEvent,
} from "@/lib/queries/calendar";
import { homeQueryKey } from "@/lib/queries/home";
import { listsQueryKey } from "@/lib/queries/lists";
import {
  markEpisodesWatchedUpTo,
  toggleEpisode,
} from "@/lib/queries/episodes";
import {
  addDays,
  addMonths,
  formatMonth,
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
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { Segmented } from "@/components/Segmented";

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
const LONG_PRESS_MS = 500;

/** Selected row/cell highlight — accent-tinted bg. Today is signalled by the
 *  date number alone (accent-coloured), no background. */
const SELECTED_TINT = "color-mix(in srgb, var(--accent) 12%, transparent)";

export default function Calendar() {
  const auth = useAuth();
  const queryClient = useQueryClient();

  const eventsQ = createQuery(() => ({
    ...calendarEventsOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  // Episode watches + new episode metadata are the only changes that move
  // the calendar; list membership changes are caught on the next stale read.
  useRealtimeInvalidation("calendar", [
    { table: "episode_watches", invalidates: [calendarQueryKey] },
    { table: "episodes", invalidates: [calendarQueryKey] },
  ]);

  const todayIso = isoDay(new Date());
  const [refDate, setRefDate] = createSignal(new Date());
  const [view, setView] = createSignal<View>("week");
  const [selectedIso, setSelectedIso] = createSignal(todayIso);

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

  // ── Quick-tick mutations ────────────────────────────────────────────
  //
  // Both patch the calendar cache optimistically, roll back on error, and
  // invalidate the cross-cutting keys on settle so list badges + the home
  // modules + the item page reflect the new watch state (handshake's
  // cross-cutting cache-fan-out rule).
  const cacheKey = () => calendarEventsKey(auth.user()!.id);
  const patch = (pred: (e: CalendarEvent) => boolean, watched: boolean) =>
    queryClient.setQueryData<CalendarEvent[]>(cacheKey(), (old) =>
      old?.map((e) => (pred(e) ? { ...e, watched } : e)),
    );
  const fanOut = () => {
    void queryClient.invalidateQueries({ queryKey: calendarQueryKey });
    void queryClient.invalidateQueries({ queryKey: homeQueryKey });
    void queryClient.invalidateQueries({ queryKey: listsQueryKey });
    void queryClient.invalidateQueries({ queryKey: ["list"] });
    void queryClient.invalidateQueries({ queryKey: ["episodes"] });
  };

  const toggleMut = createMutation(() => ({
    mutationFn: (ev: CalendarEvent) =>
      toggleEpisode({
        episodeId: ev.episodeId,
        userId: auth.user()!.id,
        watched: !ev.watched,
      }),
    onMutate: (ev: CalendarEvent) => {
      const prev = queryClient.getQueryData<CalendarEvent[]>(cacheKey());
      patch((e) => e.episodeId === ev.episodeId, !ev.watched);
      return { prev };
    },
    onError: (_err, _ev, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(cacheKey(), ctx.prev);
    },
    onSettled: fanOut,
  }));

  const cascadeMut = createMutation(() => ({
    mutationFn: (ev: CalendarEvent) =>
      markEpisodesWatchedUpTo({
        itemId: ev.itemId,
        upToEpisodeId: ev.episodeId,
      }),
    onMutate: (ev: CalendarEvent) => {
      const prev = queryClient.getQueryData<CalendarEvent[]>(cacheKey());
      // Optimistically mark every released episode of this item up to and
      // including the pressed one. Off-window episodes aren't in the cache,
      // so the onSettled refetch reconciles the true count (same caveat the
      // item-detail cascade carries).
      patch(
        (e) =>
          e.itemId === ev.itemId &&
          e.released &&
          e.episodeNumber <= ev.episodeNumber,
        true,
      );
      return { prev };
    },
    onError: (_err, _ev, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(cacheKey(), ctx.prev);
    },
    onSettled: fanOut,
  }));

  const onTap = (ev: CalendarEvent) => toggleMut.mutate(ev);
  const onCascade = (ev: CalendarEvent) => cascadeMut.mutate(ev);

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
              fallback={<p class="px-5 py-6 text-body text-text-muted">Lade …</p>}
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
              onTap={onTap}
              onCascade={onCascade}
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
      <span
        class="shrink-0 font-mono text-mini tabular-nums"
        classList={{
          "text-text-muted": props.ev.watched || !props.ev.released,
          "text-accent": props.ev.released && !props.ev.watched,
        }}
      >
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
  onTap: (ev: CalendarEvent) => void;
  onCascade: (ev: CalendarEvent) => void;
}) {
  const date = () => fromIsoDay(props.iso);
  const weekdayLong = () =>
    date().toLocaleDateString("de-DE", { weekday: "long" });
  const dateText = () =>
    `${String(date().getDate()).padStart(2, "0")}. ${MONTH_ABBR_3[date().getMonth()]}`;

  return (
    <div>
      {/* Day header. */}
      <div class="mb-3 flex items-baseline gap-2">
        <h3 class="text-body-lg font-medium text-text">{weekdayLong()}</h3>
        <span class="font-mono text-label tabular-nums text-text-muted">
          {dateText()}
        </span>
        <Show when={props.iso === props.todayIso}>
          <span class="font-mono text-mini uppercase tracking-wider text-accent">
            heute
          </span>
        </Show>
      </div>

      <Show
        when={props.events.length > 0}
        fallback={
          <p class="py-4 text-body text-text-muted">
            Keine Folgen an diesem Tag.
          </p>
        }
      >
        {/* Index, not For: ticking replaces the event's object identity (the
            optimistic patch + the settle-refetch each build fresh objects). A
            reference-keyed For would dispose + remount the row on every update,
            and the freshly-inserted DOM node loses its :hover for a frame —
            the double flicker. Index keys by position, so the row stays
            mounted and just its reactive props.ev updates. */}
        <ul class="-mx-5">
          <Index each={props.events}>
            {(ev) => (
              <DayPaneRow
                ev={ev()}
                onTap={() => props.onTap(ev())}
                onCascade={() => props.onCascade(ev())}
              />
            )}
          </Index>
        </ul>
      </Show>
    </div>
  );
}

/**
 * One episode in the day-pane. Released episodes are a tappable quick-tick
 * (tap = this one, long-press / right-click = cascade up to here); future
 * episodes render as a static, dimmed preview. The cover thumbnail is an
 * <A> sibling (not nested in the button — invalid HTML), so it stays a
 * navigation escape-hatch to the item page.
 *
 * Long-press machinery is ported verbatim from the item-detail episode list:
 * pointer events for a unified mouse+touch stream, a `fired` flag so the
 * trailing click no-ops after a long-press, and onContextMenu for the
 * desktop right-click shortcut.
 */
function DayPaneRow(props: {
  ev: CalendarEvent;
  onTap: () => void;
  onCascade: () => void;
}) {
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
    if (fired) {
      e.preventDefault();
      fired = false;
      return;
    }
    props.onTap();
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    cancelTimer();
    setPressing(false);
    fired = true;
    props.onCascade();
  };
  onCleanup(cancelTimer);

  const cover = () => highResCover(props.ev.coverUrl) ?? props.ev.coverUrl;
  const epLabel = () => nextLabel(props.ev.type, props.ev.episodeNumber);

  return (
    <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
      {/* Hover bg fills the full row (bleeds via the ul's -mx-5) — same shape
          as the subpage list rows. Press-feedback shares the bg so the whole
          row reacts to a long-press, not just the button. */}
      <div
        class="flex items-center gap-3 px-5 transition-colors hover:bg-surface"
        classList={{ "bg-surface": pressing() }}
      >
        {/* Cover → item page (sibling link, not nested in the button). */}
        <A
          href={`/item/${props.ev.type}/${props.ev.slug}`}
          class="my-2.5 block h-[5.33rem] w-16 shrink-0 overflow-hidden rounded-xs border border-border bg-surface"
          aria-label={`${props.ev.title} öffnen`}
        >
          <Show
            when={cover()}
            fallback={
              <div class="flex h-full items-center justify-center font-mono text-mini text-text-muted opacity-50">
                {typeInitial(props.ev.type)}
              </div>
            }
          >
            <img src={cover()!} alt="" class="h-full w-full object-cover" />
          </Show>
        </A>

        <Show
          when={props.ev.released}
          fallback={
            // Future episode — informational, not tickable.
            <div class="flex min-w-0 flex-1 items-center gap-3 py-2.5">
              <div class="min-w-0 flex-1">
                <span class="block font-mono text-mini uppercase tracking-[0.15em] text-text-muted">
                  {typeLabel(props.ev.type)}
                </span>
                <p class="truncate text-body text-text-muted">{props.ev.title}</p>
                <p class="font-mono text-mini text-text-muted">
                  {epLabel()} · noch nicht erschienen
                </p>
              </div>
            </div>
          }
        >
          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerUp={stopPress}
            onPointerLeave={stopPress}
            onPointerCancel={stopPress}
            onClick={onClick}
            onContextMenu={onContextMenu}
            aria-label={
              props.ev.watched
                ? `${props.ev.title} ${epLabel()}, gesehen. Tippen zum Entfernen, lang halten für „bis hier alles"`
                : `${props.ev.title} ${epLabel()}. Tippen zum Markieren, lang halten für „bis hier alles"`
            }
            class="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
          >
            <div class="min-w-0 flex-1">
              <span class="block font-mono text-mini uppercase tracking-[0.15em] text-text-muted">
                {typeLabel(props.ev.type)}
              </span>
              <p class="truncate text-body text-text">{props.ev.title}</p>
              <p class="truncate font-mono text-mini text-text-muted">
                <Show when={props.ev.episodeTitle} fallback={epLabel()}>
                  {epLabel()} · {props.ev.episodeTitle}
                </Show>
              </p>
            </div>

            {/* Right cluster. Phase 7 will slot the "who has watched" eye-icon
                in HERE, to the LEFT of the dot. The watched dot mirrors the
                item-detail episode list: filled accent = watched, hollow ring
                = not yet. */}
            <div class="flex shrink-0 items-center gap-2">
              <span
                aria-hidden
                class={`size-2 shrink-0 rounded-full transition-colors ${
                  props.ev.watched
                    ? "bg-accent"
                    : "bg-transparent ring-1 ring-border"
                }`}
              />
            </div>
          </button>
        </Show>
      </div>
    </li>
  );
}
