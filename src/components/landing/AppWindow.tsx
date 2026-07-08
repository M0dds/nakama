import {
  createSignal,
  onMount,
  onCleanup,
  Index,
  Show,
  type JSX,
} from "solid-js";
import { Eye, Check, ListPlus } from "lucide-solid";
import { Avatar } from "@/components/Avatar";
import { AvatarStack } from "@/components/AvatarStack";
import { CoWatcherMark } from "@/components/CoWatcherMark";
import { GeneratedCover } from "@/components/GeneratedCover";
import type { CoWatcher } from "@/lib/queries/sharing";
import { fadeOnLoad } from "@/lib/image-fade";
import {
  EASE_QUART,
  growOnScroll,
  reduceMotion,
  revealOnce,
} from "@/lib/landing-motion";

/**
 * The landing's ONE recurring object: the real Nakama app, framed as a flat,
 * hard-cornered WINDOW that runs off the right edge of the page (clipped by the
 * `overflow-x-clip` ancestor). Every section's right stage holds one — what
 * changes is the surface INSIDE, never the frame or its pose. The window grows
 * a touch as you scroll into it (`growOnScroll` → `--p` → the `.grow-window`
 * transform in index.css).
 *
 * Fidelity is the whole point here: the surfaces below are pixel-faithful
 * rebuilds of the shipped app, composed from the SAME leaf components the app
 * uses (Avatar / AvatarStack / CoWatcherMark / GeneratedCover / Badge). The old
 * landing's abstractions are gone — NO frosted glass over covers (the app only
 * frosts the sticky header), episodes list NEWEST-FIRST, the watched dot sits
 * far-right, and "who watched what" is the real eye + avatar stack, not a
 * caption.
 */

export interface Media {
  label: string;
  title: string;
  url: string;
  seed: number;
}

// One shared cast across every window, so the page reads as one product, not
// five disconnected screenshots.
export const MEDIA: Record<string, Media> = {
  frieren: {
    label: "Anime",
    title: "Frieren",
    url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg",
    seed: 7,
  },
  onepiece: {
    label: "Manga",
    title: "One Piece",
    url: "https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30013-BeslEMqiPhlk.jpg",
    seed: 21,
  },
  severance: {
    label: "Serien",
    title: "Severance",
    url: "https://image.tmdb.org/t/p/w780/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg",
    seed: 33,
  },
  backrooms: {
    label: "Filme",
    title: "Backrooms",
    url: "https://image.tmdb.org/t/p/w780/rhGx6E3qRNMgj3i5su2oukNHwIQ.jpg",
    seed: 12,
  },
  skyrim: {
    label: "Spiele",
    title: "Skyrim",
    url: "https://shared.steamstatic.com/store_item_assets/steam/apps/489830/library_600x900.jpg",
    seed: 44,
  },
};

const MEMBERS = [
  { name: "Mika", handle: "@mika", avatarUrl: null },
  { name: "Jonas", handle: "@jonas", avatarUrl: null },
  { name: "Lea", handle: "@lea", avatarUrl: null },
];

const WATCHERS: CoWatcher[] = [
  { userId: "1", name: "Mika", handle: "@mika", avatarUrl: null, timeLabel: "vor 2 Std." },
  { userId: "2", name: "Jonas", handle: "@jonas", avatarUrl: null, timeLabel: "gestern" },
];

/** Mika's "just caught up" appearance for the interactive sync beat. */
const MIKA_NOW: CoWatcher = {
  userId: "1",
  name: "Mika",
  handle: "@mika",
  avatarUrl: null,
  timeLabel: "gerade eben",
};

/** Flat cover image — real provider art, fading in on decode, falling back to a
 *  generated themed cover on a dead hotlink. Never a shadow/overlay. */
export function Poster(props: { media: Media; class?: string; eager?: boolean }) {
  const [failed, setFailed] = createSignal(false);
  return (
    <Show
      when={!failed()}
      fallback={
        <GeneratedCover seed={props.media.seed} class={props.class ?? ""} />
      }
    >
      <img
        ref={(el) => {
          fadeOnLoad(el);
          if (props.eager) el.setAttribute("fetchpriority", "high");
        }}
        src={props.media.url}
        alt={props.media.title}
        loading={props.eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
        class={`object-cover ${props.class ?? ""}`}
      />
    </Show>
  );
}

/** BentoModule optic — transparent section, mono label + tabular number. */
function Module(props: {
  label: string;
  number?: string;
  class?: string;
  children: JSX.Element;
}) {
  return (
    <section class={`p-5 ${props.class ?? ""}`}>
      <header class="mb-4 flex items-baseline justify-between">
        <h2 class="font-mono text-label uppercase tracking-[0.18em] text-text-muted">
          {props.label}
        </h2>
        <Show when={props.number}>
          <span class="font-mono text-label font-medium tabular-nums tracking-tight text-text">
            {props.number}
          </span>
        </Show>
      </header>
      {props.children}
    </section>
  );
}

/**
 * The window frame. `chromeTitle`/`chromeKicker`/`chromeAside` rebuild the real
 * sticky PageHeader (hanko dot + mono kicker + Geist heading + rule baseline,
 * frosted `bg-bg/55 backdrop-blur-md`). Self-contained grow on scroll.
 */
export function AppWindow(props: {
  chromeKicker?: string;
  chromeTitle: string;
  chromeAside?: JSX.Element;
  children: JSX.Element;
  class?: string;
  /** Disable the scroll-linked grow (e.g. if pinned elsewhere). Default on. */
  noGrow?: boolean;
}) {
  let root!: HTMLDivElement;
  onMount(() => {
    if (!props.noGrow) onCleanup(growOnScroll(root));
  });
  return (
    <div
      ref={root!}
      class={`grow-window overflow-hidden rounded-sm border border-rule bg-bg shadow-floating ${props.class ?? ""}`}
    >
      {/* Real PageHeader optic (minus position:sticky). */}
      <div class="bg-bg/55 px-5 pb-3 pt-5 backdrop-blur-md">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
            <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
              {props.chromeKicker ?? "Nakama"}
            </span>
          </div>
          <Show when={props.chromeAside}>
            <div class="inline-flex h-6 items-center">{props.chromeAside}</div>
          </Show>
        </div>
        <div class="mt-0.5">
          <h3 class="text-heading font-medium tracking-tight text-text">
            {props.chromeTitle}
          </h3>
        </div>
      </div>
      <div class="border-t border-rule">{props.children}</div>
    </div>
  );
}

// ── Surface: Home "Was kommt" card ─────────────────────────────────────────
function WasKommtCard(props: {
  media: Media;
  day: string;
  code: string;
  soon?: boolean;
  active?: boolean;
  i: number;
}) {
  return (
    <div
      class="fall-block group relative flex h-60 min-w-0 flex-col overflow-hidden rounded-sm border"
      classList={{
        "border-accent bg-accent": props.active,
        "border-border bg-bg": !props.active,
      }}
      style={{ "--i": `${props.i}` }}
    >
      <div class="relative min-h-0 flex-1 overflow-hidden">
        <Poster media={props.media} class="h-full w-full" eager={props.i === 0} />
      </div>
      <div class="shrink-0 p-3">
        <span
          class="block truncate font-mono text-mini uppercase tracking-wider"
          classList={{
            "text-accent-on": props.active,
            "text-accent": !props.active && !!props.soon,
            "text-text-muted": !props.active && !props.soon,
          }}
        >
          {props.day}
        </span>
        <h3
          class="mt-0.5 truncate text-body font-medium"
          classList={{ "text-accent-on": props.active, "text-text": !props.active }}
        >
          {props.media.title}
        </h3>
        <span
          class="block truncate font-mono text-mini"
          classList={{
            "text-accent-on/85": props.active,
            "text-text-muted": !props.active,
          }}
        >
          {props.code}
        </span>
      </div>
    </div>
  );
}

// ── Surface: full Home dashboard (the hero "this is the app" shot) ──────────
export function HomeSurface() {
  return (
    <div class="flex">
      {/* Left 2/3 — Was kommt + Fortsetzen */}
      <div class="w-2/3 shrink-0">
        <Module label="Was kommt" number="01" class="border-b border-rule">
          <div
            class="grid gap-3"
            style={{ "grid-template-columns": "2fr 1fr 1fr" }}
          >
            <WasKommtCard
              media={MEDIA.frieren}
              day="HEUTE · 17:00"
              code="Folge 12 · Anime"
              active
              i={0}
            />
            <WasKommtCard
              media={MEDIA.severance}
              day="MORGEN"
              code="S2 · E04"
              soon
              i={1}
            />
            <WasKommtCard
              media={MEDIA.skyrim}
              day="DEMNÄCHST"
              code="Spiel"
              i={2}
            />
          </div>
        </Module>
        <Module label="Fortsetzen" number="02">
          <ul class="-mx-5">
            <FortsetzenRow
              media={MEDIA.onepiece}
              title="One Piece"
              next="Kap. 1124"
              count="1123 / 1124"
              i={3}
            />
            <FortsetzenRow
              media={MEDIA.frieren}
              title="Frieren"
              next="Folge 12 · Das Land der Magie"
              count="11 / 28"
              badge="Neue Folge"
              i={4}
            />
            <FortsetzenRow
              media={MEDIA.severance}
              title="Severance"
              next="S2 · E03"
              count="13 / 19"
              i={5}
              last
            />
          </ul>
        </Module>
      </div>

      {/* Right 1/3 — Logbuch (this is the part that bleeds off the edge) */}
      <div class="w-1/3 shrink-0 border-l border-rule">
        <Module label="Logbuch" number="03">
          <ul class="-mx-5">
            <LogbuchRow
              actor="Mika"
              kind="watch"
              body={<>hat <b class="font-medium">One Piece</b> Kap. 1123 gesehen.</>}
              time="vor 2 Std."
              i={6}
            />
            <LogbuchRow
              actor="Du"
              self
              kind="watch"
              body={<>hast <b class="font-medium">Frieren</b> Folge 11 gesehen.</>}
              time="vor 5 Std."
              i={7}
            />
            <LogbuchRow
              actor="Lea"
              kind="add"
              body={<>hat <b class="font-medium">Severance</b> zu <b class="font-medium">Unsere Liste</b> hinzugefügt.</>}
              time="gestern"
              i={8}
            />
            <LogbuchRow
              actor=""
              kind="missed"
              body={<><b class="font-medium">Skyrim</b> ist erschienen.</>}
              time="vor 3 Tagen"
              i={9}
              last
            />
          </ul>
        </Module>
      </div>
    </div>
  );
}

function FortsetzenRow(props: {
  media: Media;
  title: string;
  next: string;
  count: string;
  badge?: string;
  i: number;
  last?: boolean;
}) {
  return (
    <li
      class="fall-block relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border"
      classList={{ "after:hidden": props.last }}
      style={{ "--i": `${props.i}` }}
    >
      <div class="flex items-center gap-3 px-5 py-2">
        <div class="relative h-12 w-9 shrink-0 overflow-hidden rounded-xs border border-border bg-surface">
          <Poster media={props.media} class="h-full w-full" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-start gap-3">
            <h3 class="min-w-0 truncate text-body font-medium text-text">
              {props.title}
            </h3>
            <Show when={props.badge}>
              <span class="shrink-0 font-mono text-mini uppercase text-accent">
                {props.badge}
              </span>
            </Show>
          </div>
          <p class="truncate font-mono text-mini text-text-muted">{props.next}</p>
        </div>
        <span class="shrink-0 font-mono text-mini tabular-nums text-text-muted">
          {props.count}
        </span>
      </div>
    </li>
  );
}

function LogbuchRow(props: {
  actor: string;
  self?: boolean;
  kind: "watch" | "add" | "missed";
  body: JSX.Element;
  time: string;
  i: number;
  last?: boolean;
}) {
  const KindIcon = () =>
    props.kind === "add" ? (
      <ListPlus class="size-2.5 text-text-muted" aria-hidden />
    ) : (
      <Eye class="size-2.5 text-text-muted" aria-hidden />
    );
  return (
    <li
      class="fall-block relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border"
      classList={{ "after:hidden": props.last }}
      style={{ "--i": `${props.i}` }}
    >
      <div class="flex items-start gap-3 px-5 py-3">
        <div class="flex w-6 shrink-0 justify-center pt-0.5">
          <Show
            when={props.kind !== "missed" && !props.self}
            fallback={
              props.kind === "missed" ? (
                <Eye class="size-4 text-text-muted opacity-60" aria-hidden />
              ) : (
                <Check class="size-4 text-text-muted opacity-60" aria-hidden />
              )
            }
          >
            <div class="relative">
              <Avatar handle={props.actor} avatarUrl={null} size={24} />
              <span class="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border border-border bg-surface">
                <KindIcon />
              </span>
            </div>
          </Show>
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-body" classList={{ "text-text-muted": props.self }}>
            <Show when={props.actor}>
              <span
                classList={{
                  "font-medium underline decoration-border decoration-dotted underline-offset-2":
                    !props.self,
                  "font-medium": props.self,
                }}
              >
                {props.actor}
              </span>{" "}
            </Show>
            {props.body}
          </p>
          <span class="mt-0.5 block font-mono text-mini tabular-nums text-text-muted">
            {props.time}
          </span>
        </div>
      </div>
    </li>
  );
}

// ── Surface: /lists overview ────────────────────────────────────────────────
export function ListsSurface() {
  return (
    <div class="py-2">
      <ul class="-mx-5">
        <ListRow
          seed={3}
          name="Unsere Liste"
          badge="Neue Folge"
          members={MEMBERS}
          meta="12 Einträge"
          i={0}
        />
        <ListRow
          seed={48}
          name="Date Night"
          members={MEMBERS.slice(0, 2)}
          meta="8 Einträge"
          i={1}
        />
        <ListRow
          seed={21}
          name="Anime 2026"
          members={[MEMBERS[0]]}
          meta="23 Einträge"
          i={2}
        />
        <ListRow seed={12} name="Backlog" meta="Noch leer" i={3} last />
      </ul>
    </div>
  );
}

function ListRow(props: {
  seed: number;
  name: string;
  badge?: string;
  members?: { name: string; handle: string; avatarUrl: null }[];
  meta: string;
  i: number;
  last?: boolean;
}) {
  return (
    <li
      class="fall-block relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border"
      classList={{ "after:hidden": props.last }}
      style={{ "--i": `${props.i}` }}
    >
      <div class="flex items-center gap-3 px-5 py-3.5">
        <div class="size-11 shrink-0 overflow-hidden rounded-xs">
          <GeneratedCover seed={props.seed} class="size-full" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-3">
            <h3 class="min-w-0 truncate text-body-lg font-medium text-text">
              {props.name}
            </h3>
            <Show when={props.badge}>
              <span class="shrink-0 font-mono text-mini uppercase text-accent">
                {props.badge}
              </span>
            </Show>
          </div>
          <div class="mt-0.5 flex items-center gap-2">
            <Show when={props.members && props.members.length}>
              <AvatarStack members={props.members!} size={18} />
            </Show>
            <p class="min-w-0 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
              {props.meta}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

// ── Surface: Item-detail episode list (newest-first, real Mitseher eye) ──────
const FRIEREN_EPS = [
  { n: 12, title: "Sense" },
  { n: 11, title: "Mahts Vorbereitung" },
  { n: 10, title: "Eine wirklich schöne Tagereise" },
  { n: 9, title: "Tod" },
  { n: 8, title: "Das Land der Magie" },
  { n: 7, title: "Frische Pflaumen" },
];

/**
 * The "Synchron" surface — the page's interactive proof. Episodes descend
 * (newest on top — the real ordering), the next-up episode (12) sits at the
 * top unwatched, and on scroll-in the watched dots fill top-to-bottom (the
 * "sync wave"), the progress bar growing in step. Episode 11 carries the real
 * Mitseher eye (Mika + Jonas). Tapping a row toggles its dot + the progress.
 *
 * The story beat: when the VISITOR ticks the next-up episode, Mika "catches
 * up" a beat later — her eye pops onto the row and a toast (the real in-app
 * toast optic) slides into the window. The sync feature demonstrated ON the
 * visitor instead of described to them. Unticking retracts it.
 */
export function EpisodesSurface() {
  const total = 28;
  // `watchedFrom` = index in FRIEREN_EPS from which (inclusive) episodes are
  // watched. Episodes descend (12 at index 0), so a lower index = newer. Ep 12
  // is the unwatched next-up, so we start at index 1 (ep 11 and older watched).
  // Episodes are contiguous 1..28, so the newest-watched number IS the count.
  const [watchedFrom, setWatchedFrom] = createSignal(1);
  const isWatched = (i: number) => i >= watchedFrom();
  const watched = () => FRIEREN_EPS[0].n - watchedFrom(); // 12 - from
  const pct = () => Math.round((watched() / total) * 100);

  // Mika's delayed reaction to the visitor ticking ep 12 (index 0).
  const [partnerSynced, setPartnerSynced] = createSignal(false);
  let partnerTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(partnerTimer));

  // Threshold toggle: tapping a watched row unwatches it + everything newer;
  // tapping an unwatched row watches down to it (the real "bis hier" gesture).
  const toggle = (i: number) => {
    setWatchedFrom((cur) => (i >= cur ? i + 1 : i));
    clearTimeout(partnerTimer);
    if (watchedFrom() === 0) {
      // Visitor just caught up to ep 12 → Mika follows after a human beat.
      partnerTimer = setTimeout(() => setPartnerSynced(true), 1000);
    } else {
      setPartnerSynced(false);
    }
  };

  let root!: HTMLDivElement;
  const dotEls: HTMLElement[] = [];
  let barEl!: HTMLDivElement;
  let eyeEl!: HTMLDivElement;

  onMount(() => {
    if (reduceMotion()) {
      eyeEl.style.opacity = "1";
      barEl.style.transform = "scaleX(1)";
      return;
    }
    // Hide watched dots + eye, collapse bar; play the wave once in view.
    dotEls.forEach((el, i) => {
      if (el && isWatched(i)) el.style.transform = "scale(0)";
    });
    barEl.style.transform = "scaleX(0)";
    eyeEl.style.opacity = "0";
    onCleanup(
      revealOnce(root, () => {
        let step = 0;
        dotEls.forEach((el, i) => {
          if (!el || !isWatched(i)) return;
          el.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], {
            duration: 260,
            delay: step * 90,
            easing: EASE_QUART,
            fill: "both",
          });
          step++;
        });
        barEl.animate(
          [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
          { duration: step * 90 + 220, easing: EASE_QUART, fill: "both" },
        );
        eyeEl.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 300,
          delay: step * 90 + 120,
          easing: EASE_QUART,
          fill: "both",
        });
      }),
    );
  });

  return (
    <div ref={root!} class="flex">
      {/* Episoden column — relative so Mika's toast anchors to ITS top-right
          (the window frame bleeds off the page edge; anchoring the toast to
          the frame would put it off-screen). */}
      <div class="relative w-2/3 shrink-0">
        {/* Mika's reaction toast — the real in-app toast optic (border/surface/
            shadow-floating, accent icon), sliding in like the app's Toaster.
            Lives INSIDE the window so the story stays in the frame. */}
        <Show when={partnerSynced()}>
          <div
            ref={(el) => {
              if (!reduceMotion())
                el.animate(
                  [
                    { transform: "translateX(16px)", opacity: 0 },
                    { transform: "translateX(0)", opacity: 1 },
                  ],
                  { duration: 300, easing: EASE_QUART },
                );
            }}
            class="absolute right-4 top-4 z-10 flex items-center gap-3 rounded-sm border border-border bg-surface px-4 py-3 shadow-floating"
          >
            <Check class="size-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
            <p class="text-body text-text">
              Mika ist jetzt auch bei Folge 12.
            </p>
          </div>
        </Show>
        <Module label="Episoden" number="01">
          {/* Progress bar */}
          <div class="mb-1">
            <div class="flex items-baseline justify-between gap-3">
              <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
                Fortschritt
              </span>
              <span class="font-mono text-mini tabular-nums text-text">
                {watched()}/{total} · {pct()} %
              </span>
            </div>
            <div class="mt-2 h-1 w-full overflow-hidden bg-border">
              <div
                ref={barEl!}
                class="h-full origin-left bg-accent"
                style={{ width: `${pct()}%` }}
              />
            </div>
          </div>

          <ul class="-mx-5 mt-3">
            <Index each={FRIEREN_EPS}>
              {(ep, i) => (
                <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    class="group block w-full text-left transition-colors hover:bg-surface"
                  >
                    <div class="flex items-center gap-3 px-5 py-3">
                      <span class="w-8 shrink-0 font-mono text-mini font-medium tabular-nums tracking-wider text-text">
                        {String(ep().n).padStart(2, "0")}
                      </span>
                      <span class="min-w-0 flex-1 truncate text-body text-text">
                        {ep().title}
                      </span>
                      <div class="flex shrink-0 items-baseline gap-3 font-mono text-mini uppercase tracking-wider tabular-nums">
                        <Show when={i === 0}>
                          <span class="text-accent">Morgen</span>
                        </Show>
                        <span class="w-20 shrink-0 text-right text-text-muted">
                          {i === 0 ? "30. Mai 25" : "23. Mai 25"}
                        </span>
                      </div>
                      <div class="ml-1.5 flex shrink-0 items-center gap-3">
                        <Show when={i === 0 && partnerSynced()}>
                          <div
                            ref={(el) => {
                              if (!reduceMotion())
                                el.animate(
                                  [
                                    { transform: "scale(0)", opacity: 0 },
                                    { transform: "scale(1)", opacity: 1 },
                                  ],
                                  { duration: 260, easing: EASE_QUART },
                                );
                            }}
                          >
                            <CoWatcherMark watchers={[MIKA_NOW]} />
                          </div>
                        </Show>
                        <Show when={i === 1}>
                          <div ref={eyeEl!}>
                            <CoWatcherMark watchers={WATCHERS} />
                          </div>
                        </Show>
                        <span
                          ref={(el) => (dotEls[i] = el)}
                          aria-hidden
                          class="size-2 shrink-0 rounded-full transition-colors"
                          classList={{
                            "bg-accent": isWatched(i),
                            "bg-transparent ring-1 ring-border": !isWatched(i),
                          }}
                        />
                      </div>
                    </div>
                  </button>
                </li>
              )}
            </Index>
          </ul>
        </Module>
      </div>

      {/* Details column (cover + facts) — the part that bleeds off the edge */}
      <div class="w-1/3 shrink-0 border-l border-rule">
        <Module label="Details" number="02">
          <Poster
            media={MEDIA.frieren}
            class="mb-5 block aspect-[2/3] w-full max-w-[220px] border border-border"
          />
          <dl class="space-y-3 border-t border-border pt-5 text-body">
            <div class="flex items-baseline justify-between gap-3">
              <dt class="font-mono text-mini uppercase tracking-wider text-text-muted">
                Typ
              </dt>
              <dd class="text-text">Anime</dd>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <dt class="font-mono text-mini uppercase tracking-wider text-text-muted">
                Folgen
              </dt>
              <dd class="text-text">28</dd>
            </div>
            <div class="flex items-baseline justify-between gap-3">
              <dt class="font-mono text-mini uppercase tracking-wider text-text-muted">
                Quelle
              </dt>
              <dd class="text-text">AniList</dd>
            </div>
          </dl>
        </Module>
      </div>
    </div>
  );
}

// ── Surface: Was kommt close-up (the ONE accent fill + day-flip) ────────────
/**
 * §02's surface — a focused "Was kommt" grid. The Frieren hero card is the page's
 * single fully-filled `bg-accent` block; on scroll-in its day chip flips
 * Demnächst → Morgen → Heute (sequential handoff) to dramatise the future-focus
 * idea. No tick here (ticking lives in §03, where it's truthful).
 */
export function WasKommtSurface() {
  const [day, setDay] = createSignal("HEUTE · 17:00");
  const [shown, setShown] = createSignal(true);
  let root!: HTMLDivElement;
  const timers: ReturnType<typeof setTimeout>[] = [];

  onMount(() => {
    if (reduceMotion()) return;
    setDay("DEMNÄCHST");
    onCleanup(
      revealOnce(root, () => {
        const flip = (label: string, at: number) => {
          timers.push(
            setTimeout(() => {
              setShown(false);
              timers.push(
                setTimeout(() => {
                  setDay(label);
                  setShown(true);
                }, 130),
              );
            }, at),
          );
        };
        flip("MORGEN", 450);
        flip("HEUTE · 17:00", 950);
      }),
    );
  });
  onCleanup(() => timers.forEach(clearTimeout));

  return (
    <div ref={root!} class="p-5">
      <div class="grid gap-3" style={{ "grid-template-columns": "2fr 1fr 1fr" }}>
        {/* Hero card — the ONE accent fill on the whole page */}
        <div class="group relative flex h-72 min-w-0 flex-col overflow-hidden rounded-sm border border-accent bg-accent">
          <div class="relative min-h-0 flex-1 overflow-hidden">
            <Poster media={MEDIA.frieren} class="h-full w-full" />
          </div>
          <div class="shrink-0 p-3">
            <span
              class="block truncate font-mono text-mini uppercase tracking-wider text-accent-on"
              style={{
                opacity: shown() ? "1" : "0",
                transition: reduceMotion() ? "none" : "opacity 130ms ease",
              }}
            >
              {day()}
            </span>
            <h3 class="mt-0.5 truncate text-body font-medium text-accent-on">
              Frieren
            </h3>
            <span class="block truncate font-mono text-mini text-accent-on/85">
              Folge 12 · Anime
            </span>
          </div>
        </div>
        <WasKommtCard
          media={MEDIA.severance}
          day="MORGEN"
          code="S2 · E04"
          soon
          i={1}
        />
        <WasKommtCard
          media={MEDIA.onepiece}
          day="MI · 28. Mai"
          code="Kap. 1124"
          i={2}
        />
      </div>
    </div>
  );
}
