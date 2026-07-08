import {
  createSignal,
  onCleanup,
  onMount,
  For,
  Show,
  type JSX,
} from "solid-js";
import { A } from "@solidjs/router";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  Layers,
  Palette,
  Smartphone,
  Users,
} from "lucide-solid";
import { Button } from "@/components/Button";
import {
  StandaloneHeader,
  StandaloneFooter,
} from "@/components/StandaloneShell";
import {
  AppWindow,
  EpisodesSurface,
  WasKommtSurface,
  Poster,
  MEDIA,
} from "@/components/landing/AppWindow";
import {
  armReveal,
  reduceMotion,
  setupLenis,
  trackInView,
} from "@/lib/landing-motion";
import { useResolvedMode } from "@/lib/use-resolved-mode";
import {
  THEMES,
  applyTheme,
  readModePref,
  readTheme,
  type ThemeId,
  type ThemeModePref,
} from "@/lib/themes";

/**
 * Marketing landing at `/` for signed-out visitors — built as a STORY, not a
 * feature list:
 *
 *   PROLOG   The page doesn't pitch, it asks: your name, then your look (the
 *            live theme board re-colours the whole page — investment before
 *            the first claim). Both persist; the theme literally travels into
 *            the app, the name greets returning visitors.
 *   01       The problem, felt not told: a group-chat vignette typing itself
 *            out ("Folge 8?" — "ich hätte 6 gesagt"), ending in the eternal
 *            "hast du ohne mich weitergeschaut??".
 *   02       The turn: ONE shared list as the couple's memory — and the
 *            visitor proves it themselves by ticking a real episode row and
 *            watching Mika catch up live (interactive EpisodesSurface).
 *   03       Future focus: "Was kommt" as a radar, plus the push mock.
 *   04       The rest of the features, ONE compact bento — deliberately the
 *            only list-shaped section on the page.
 *   FINALE   The cover pan + the page using your name one last time:
 *            "Bereit, {name}?"
 *
 * Motion rides the small landing vocabulary (FALL / POP / GROW / PAN — see
 * src/lib/landing-motion.ts + index.css) on a Lenis substrate; everything is
 * reduced-motion-gated to static end states. In-app motion stays functional —
 * the landing is the sanctioned flashy exception.
 */

const NAME_KEY = "nakama:landing-name";

const readStoredName = (): string | null => {
  try {
    return localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
};
const storeName = (v: string) => {
  try {
    localStorage.setItem(NAME_KEY, v);
  } catch {
    /* private mode — the greeting just won't persist */
  }
};

/** A consistent oversized window width across the window sections — wide
 *  enough to always bleed off the right edge (clipped by `main`). */
const WINDOW_W = "w-[40rem] max-w-none sm:w-[46rem] md:w-[52rem] lg:w-[60rem]";

/** Accent hanko dot — rationed to ONE per section, on the keyword. */
function Hanko(props: { class?: string }) {
  return (
    <span
      aria-hidden
      class={`ml-3 inline-block size-[0.5em] translate-y-[0.02em] rounded-full bg-accent align-baseline ${props.class ?? ""}`}
    />
  );
}

/** Immediate FALL cascade for the prolog beats — they're already in view when
 *  they mount (step swap), so the IO-based armReveal would fire too late.
 *  Double-rAF so the browser paints the armed (hidden) state first. */
function cascadeNow(el: HTMLElement) {
  if (reduceMotion()) return;
  el.classList.add("armed");
  requestAnimationFrame(() =>
    requestAnimationFrame(() => el.classList.add("in-view")),
  );
}

/** Fixed left measuring bar — honest 01–04 over the four story sections (the
 *  prolog is the unnumbered masthead). Bows out on the finale. */
function LeftRuler(props: { active: () => number; hidden: () => boolean }) {
  return (
    <aside
      aria-hidden
      class="fixed left-3 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-6 transition-opacity duration-500 md:flex"
      classList={{ "opacity-0": props.hidden() }}
    >
      <For each={["01", "02", "03", "04"]}>
        {(n, i) => (
          <div class="flex items-center gap-2">
            <span
              class="h-px w-3 transition-colors"
              classList={{
                "bg-accent": props.active() === i(),
                "bg-rule": props.active() !== i(),
              }}
            />
            <span
              class="font-mono text-mini tabular-nums transition-colors"
              classList={{
                "font-medium text-text": props.active() === i(),
                "text-text-muted": props.active() !== i(),
              }}
            >
              {n}
            </span>
            <Show when={props.active() === i()}>
              <span class="size-1.5 rounded-full bg-accent" />
            </Show>
          </div>
        )}
      </For>
    </aside>
  );
}

/** A story section on the spine: rail (kicker · keyword · copy) + stage.
 *  `flip` mirrors the composition — stage LEFT (windows bleed off the left
 *  page edge), rail RIGHT — so consecutive sections alternate sides instead
 *  of repeating one pose. DOM order stays rail-first (mobile stacks rail
 *  above stage either way); md:order swaps the columns visually. The rail
 *  blocks FALL in top-to-bottom (--i 0/1/2); `extraLeft` continues the
 *  cascade from --i 3. */
function Section(props: {
  setRef: (el: HTMLElement) => void;
  kicker: string;
  keyword: JSX.Element;
  copy: JSX.Element;
  stage: JSX.Element;
  extraLeft?: JSX.Element;
  flip?: boolean;
}) {
  return (
    <section
      ref={props.setRef}
      class="relative flex min-h-screen flex-col justify-center border-t border-rule px-5 py-24 sm:px-8 md:grid md:grid-cols-12 md:items-center md:gap-8 md:pl-20"
    >
      <div
        class="md:col-span-5"
        classList={{ "md:order-2 md:pl-4": props.flip }}
      >
        <p
          class="fall-block font-mono text-mini uppercase tracking-[0.25em] text-text-muted"
          style={{ "--i": "0" }}
        >
          {props.kicker}
        </p>
        <h2
          class="fall-block mt-4 text-[clamp(2.75rem,9vw,6.5rem)] font-medium leading-[0.95] tracking-[-0.03em] text-text"
          style={{ "--i": "1" }}
        >
          {props.keyword}
        </h2>
        <p
          class="fall-block mt-6 max-w-md text-body-lg text-text-muted"
          style={{ "--i": "2" }}
        >
          {props.copy}
        </p>
        <Show when={props.extraLeft}>{props.extraLeft}</Show>
      </div>
      <div
        class="relative mt-10 min-w-0 md:col-span-7 md:mt-0"
        classList={{
          "md:pl-4": !props.flip,
          // justify-end makes the oversized window overflow toward the LEFT
          // page edge (flex spills overflow at the start side).
          "md:order-1 md:flex md:justify-end md:pr-4": props.flip,
        }}
      >
        {props.stage}
      </div>
    </section>
  );
}

/* ── Prolog pieces ─────────────────────────────────────────────────────────── */

/** Theme tiles for the prolog — tapping one re-themes the whole page live and
 *  persists, so the chosen look literally travels into the app later. */
function ThemeBoard() {
  const mode = useResolvedMode();
  const [active, setActive] = createSignal<ThemeId>(readTheme());
  return (
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <For each={THEMES}>
        {(t, i) => {
          const sw = () => t.swatch[mode()];
          const isActive = () => active() === t.id;
          return (
            <button
              type="button"
              onClick={() => {
                applyTheme(t.id, readModePref());
                setActive(t.id);
              }}
              aria-pressed={isActive()}
              class="fall-block flex items-center gap-3 rounded-xs border p-3 text-left transition-colors"
              classList={{
                "border-rule bg-nav-bg text-nav-fg": isActive(),
                "border-border text-text hover:bg-surface": !isActive(),
              }}
              style={{ "--i": `${3 + i()}` }}
            >
              <span
                class="grid size-6 shrink-0 place-items-center rounded-xs"
                style={{ "background-color": sw().bg }}
              >
                <span
                  class="size-2 rounded-full"
                  style={{ "background-color": sw().accent }}
                />
              </span>
              <span class="truncate font-mono text-label uppercase tracking-[0.18em]">
                {t.name}
              </span>
            </button>
          );
        }}
      </For>
    </div>
  );
}

/** Hell / Dunkel / Auto — completes the look question without a settings page. */
function ModeRow() {
  const [pref, setPref] = createSignal<ThemeModePref>(readModePref());
  const options: { id: ThemeModePref; label: string }[] = [
    { id: "light", label: "Hell" },
    { id: "dark", label: "Dunkel" },
    { id: "system", label: "Auto" },
  ];
  return (
    <div class="flex items-center gap-1">
      <For each={options}>
        {(o) => (
          <button
            type="button"
            aria-pressed={pref() === o.id}
            onClick={() => {
              applyTheme(readTheme(), o.id);
              setPref(o.id);
            }}
            class="rounded-xs px-2.5 py-1.5 font-mono text-mini uppercase tracking-[0.18em] transition-colors"
            classList={{
              "bg-nav-bg text-nav-fg": pref() === o.id,
              "text-text-muted hover:bg-surface hover:text-text":
                pref() !== o.id,
            }}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

/* ── Scene 1: the group-chat vignette ─────────────────────────────────────── */

type Bubble = { from: "mika" | "du"; text: string; shake?: boolean };

const CHAT: Bubble[] = [
  { from: "mika", text: "heute abend weiterschauen?" },
  { from: "du", text: "unbedingt. wo waren wir?" },
  { from: "mika", text: "folge 8?" },
  { from: "du", text: "ich hätte 6 gesagt" },
  { from: "mika", text: "war 6 nicht die mit dem drachen" },
  { from: "du", text: "das war 5. glaube ich. oder staffel 1?" },
  { from: "mika", text: "MOMENT. hast du ohne mich weitergeschaut??", shake: true },
];

/** The "current system" — the chaos the chat is embedded in, scattered as
 *  mono artifact chips around the card so the stage reads as a desk full of
 *  half-solutions instead of a lone phone in empty space. Desktop only. */
const ARTIFACTS: { label: string; pos: string; i: number }[] = [
  { label: "3 Streaming-Apps", pos: "left-0 top-6", i: 3 },
  { label: "Notizen-App", pos: "right-2 top-16", i: 4 },
  { label: "serien_v3.xlsx", pos: "left-0 bottom-28", i: 5 },
  { label: "Browser-Tabs (14)", pos: "right-6 bottom-8", i: 6 },
  { label: "Gedächtnis (lückenhaft)", pos: "left-1/2 -top-8", i: 7 },
];

function ChatChaos() {
  return (
    <div class="relative">
      <For each={ARTIFACTS}>
        {(a) => (
          <span
            class={`fall-block absolute hidden border border-border bg-bg px-3 py-1.5 font-mono text-mini uppercase tracking-[0.2em] text-text-muted md:block ${a.pos}`}
            style={{ "--i": `${a.i}` }}
          >
            {a.label}
          </span>
        )}
      </For>
      <ChatCard />
    </div>
  );
}

/** The problem, staged as the chat everyone has — bubbles POP in one by one
 *  (0.55s apart, a conversation unfolding), the escalation bubble rattles,
 *  and Mika just keeps typing forever. */
function ChatCard() {
  return (
    <div class="mx-auto w-full max-w-sm rounded-sm border border-rule bg-bg shadow-floating md:max-w-md">
      <div class="flex items-center justify-between border-b border-rule px-5 py-3">
        <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
          Mika
        </span>
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          23:47
        </span>
      </div>
      <ul class="flex flex-col gap-2.5 px-4 py-5">
        <For each={CHAT}>
          {(b, i) => (
            <li
              class="pop-block flex"
              classList={{
                "justify-start pop-left": b.from === "mika",
                "justify-end pop-right": b.from === "du",
              }}
              style={{ "--i": `${i()}` }}
            >
              <div
                classList={{
                  "shake-block": b.shake,
                }}
                style={
                  b.shake
                    ? { "--shake-delay": `${i() * 0.55 + 0.45}s` }
                    : undefined
                }
              >
                <p
                  class="max-w-[15.5rem] rounded-sm px-3.5 py-2 text-body"
                  classList={{
                    "border border-border bg-surface text-text":
                      b.from === "mika",
                    "bg-accent text-accent-on": b.from === "du",
                  }}
                >
                  {b.text}
                </p>
              </div>
            </li>
          )}
        </For>
        {/* …and she's STILL typing. The argument has no natural end — that's
            the point the next section answers. */}
        <li
          class="pop-block pop-left flex justify-start"
          style={{ "--i": `${CHAT.length}` }}
        >
          <div class="flex items-center gap-1.5 border border-border bg-surface px-3.5 py-3">
            <For each={[0, 1, 2]}>
              {(d) => (
                <span
                  class="typing-dot size-1.5 rounded-full bg-text-muted"
                  style={{ "--i": `${d}` }}
                />
              )}
            </For>
          </div>
        </li>
      </ul>
      <div class="border-t border-border px-5 py-3">
        <p class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
          — Jeden. Zweiten. Abend.
        </p>
      </div>
    </div>
  );
}

/* ── Scene 3: push mock ────────────────────────────────────────────────────── */

/** A lock-screen-style notification hovering over the "Was kommt" window —
 *  the radar reaching you without the app open. */
function PushMock() {
  return (
    <div
      class="fall-block absolute -top-6 right-4 z-10 flex w-72 items-center gap-3 border border-rule bg-bg/70 px-4 py-3 shadow-floating backdrop-blur-md sm:right-12"
      style={{ "--i": "3" }}
    >
      <span class="grid size-8 shrink-0 place-items-center bg-nav-bg">
        <span class="size-2 rounded-full bg-accent" />
      </span>
      <div class="min-w-0">
        <p class="flex items-baseline justify-between gap-2">
          <span class="font-mono text-mini uppercase tracking-[0.2em] text-text-muted">
            Nakama
          </span>
          <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
            Jetzt
          </span>
        </p>
        <p class="mt-0.5 truncate text-body text-text">
          Neue Folge: Frieren 13 ist da.
        </p>
      </div>
    </div>
  );
}

/* ── Scene 4: the ONE compact feature block ───────────────────────────────── */

const FEATURES: { icon: typeof Layers; label: string; body: string }[] = [
  {
    icon: Layers,
    label: "5 Medien",
    body: "Anime, Manga, Serien, Filme, Spiele — pro Folge, pro Kapitel oder als simples Gesehen.",
  },
  {
    icon: Users,
    label: "Geteilte Listen",
    body: "Lade deine Leute per @handle ein. Gleiche Rechte, synchroner Fortschritt, Mitseher-Auge.",
  },
  {
    icon: CalendarDays,
    label: "Kalender",
    body: "Alle Termine im Wochen- und Monatsblick — abhaken direkt im Tag.",
  },
  {
    icon: Bell,
    label: "Push",
    body: "Neue Folge erschienen? Nakama meldet sich — und sonst nie.",
  },
  {
    icon: Palette,
    label: "9 Themes",
    body: "Von Sakura bis Teenage Engineering, jeweils in Hell und Dunkel.",
  },
  {
    icon: Smartphone,
    label: "Installierbar",
    body: "Als App auf dem Homescreen. Kostenlos, kein Abo, keine Werbung.",
  },
];

/* ── Finale: drifting cover pan ───────────────────────────────────────────── */

/** Full-bleed poster wall drifting sideways as you scroll past — the library
 *  the story has been about, briefly physical. */
function CoverPan() {
  let el!: HTMLDivElement;
  const [p, setP] = createSignal(0.5);
  onMount(() => onCleanup(trackInView(el, setP)));
  const covers = [...Object.values(MEDIA), ...Object.values(MEDIA)];
  return (
    <div
      ref={el!}
      class="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden"
    >
      <div
        class="flex w-max gap-px"
        style={{ transform: `translateX(${(-p() * 22).toFixed(3)}%)` }}
      >
        <For each={covers}>
          {(m) => (
            <div class="relative w-40 shrink-0 sm:w-52">
              <Poster media={m} class="block aspect-[2/3] size-full" />
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function Landing() {
  // Prolog state. Stored name (may be "" = chose anonymity) skips the question
  // and greets the returning visitor instead.
  const stored = readStoredName();
  const [name, setName] = createSignal<string>(stored ?? "");
  const returning = stored !== null;
  const [step, setStep] = createSignal<"name" | "theme">(
    returning ? "theme" : "name",
  );
  const greet = () => (name() ? name() : "du");

  const submitName = (raw: string) => {
    const v = raw.trim().slice(0, 24);
    setName(v);
    storeName(v);
    setStep("theme");
  };

  const [active, setActive] = createSignal(0);
  const [rulerHidden, setRulerHidden] = createSignal(false);
  const secEls: HTMLElement[] = [];
  let scene1El: HTMLElement | undefined;
  let finaleEl: HTMLElement | undefined;

  onMount(() => {
    // Lenis smooth-scroll for the page's lifetime — torn down on route-away.
    onCleanup(setupLenis());

    // Honest ruler: active tick follows whichever section owns the centre.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            const idx = secEls.indexOf(e.target as HTMLElement);
            if (idx >= 0) setActive(idx);
          }
        }
      },
      { threshold: [0.5] },
    );
    secEls.forEach((el) => el && io.observe(el));
    onCleanup(() => io.disconnect());

    // Ruler bows out on the finale.
    if (finaleEl) {
      const exitIo = new IntersectionObserver(
        ([e]) => setRulerHidden(e.isIntersecting && e.intersectionRatio >= 0.3),
        { threshold: [0.3] },
      );
      exitIo.observe(finaleEl);
      onCleanup(() => exitIo.disconnect());
    }

    // Arm the scroll-in reveals on every story section + finale.
    [...secEls, finaleEl].forEach((el) => el && onCleanup(armReveal(el)));
  });

  return (
    <main class="overflow-x-clip">
      <StandaloneHeader />
      <LeftRuler active={active} hidden={rulerHidden} />

      {/* ── Prolog — the page asks before it pitches ─────────────────────── */}
      <section class="relative flex min-h-[94svh] flex-col justify-center px-5 py-20 sm:px-8 md:pl-20">
        <Show
          when={step() === "theme"}
          fallback={
            /* Beat 1 — the name. One question, one input, an honest out. */
            <div ref={cascadeNow} class="max-w-3xl">
              <p
                class="fall-block font-mono text-mini uppercase tracking-[0.25em] text-text-muted"
                style={{ "--i": "0" }}
              >
                Nakama — der gemeinsame Media-Tracker
              </p>
              <h1
                class="fall-block mt-6 text-[clamp(2.75rem,9vw,6.5rem)] font-medium leading-[0.95] tracking-[-0.03em] text-text"
                style={{ "--i": "1" }}
              >
                Erstmal{" "}
                <span class="whitespace-nowrap">
                  Hallo
                  <Hanko />
                </span>
              </h1>
              <p
                class="fall-block mt-6 max-w-md text-body-lg text-text-muted"
                style={{ "--i": "2" }}
              >
                Bevor wir dir irgendwas zeigen: Wie sollen wir dich nennen?
              </p>
              <form
                class="fall-block mt-10"
                style={{ "--i": "3" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitName(
                    new FormData(e.currentTarget).get("name") as string,
                  );
                }}
              >
                <input
                  name="name"
                  type="text"
                  autocomplete="given-name"
                  maxlength="24"
                  placeholder="Dein Name"
                  aria-label="Dein Name"
                  class="w-full max-w-md border-b border-rule bg-transparent pb-3 text-[clamp(1.75rem,5vw,3rem)] font-medium tracking-[-0.02em] text-text outline-none transition-colors placeholder:text-text-muted/40 focus:border-accent"
                  style={{ "caret-color": "var(--accent)" }}
                />
                <div class="mt-8 flex flex-wrap items-center gap-4">
                  <Button type="submit" variant="primary">
                    Weiter
                  </Button>
                  <button
                    type="button"
                    onClick={() => submitName("")}
                    class="rounded-xs px-2 py-1 font-mono text-mini uppercase tracking-[0.2em] text-text-muted transition-colors hover:bg-surface hover:text-text"
                  >
                    Lieber anonym
                  </button>
                </div>
              </form>
            </div>
          }
        >
          {/* Beat 2 — the look. The theme board recolours the page live. */}
          <div ref={cascadeNow} class="max-w-3xl">
            <p
              class="fall-block font-mono text-mini uppercase tracking-[0.25em] text-text-muted"
              style={{ "--i": "0" }}
            >
              Nakama — der gemeinsame Media-Tracker
            </p>
            <h1
              class="fall-block mt-6 text-[clamp(2.75rem,9vw,6.5rem)] font-medium leading-[0.95] tracking-[-0.03em] text-text"
              style={{ "--i": "1" }}
            >
              <Show
                when={name()}
                fallback={
                  returning ? (
                    <>
                      Willkommen{" "}
                      <span class="whitespace-nowrap">
                        zurück
                        <Hanko />
                      </span>
                    </>
                  ) : (
                    <span class="whitespace-nowrap">
                      Hallo
                      <Hanko />
                    </span>
                  )
                }
              >
                {returning ? "Willkommen zurück, " : "Hallo, "}
                <span class="whitespace-nowrap">
                  {name()}
                  <Hanko />
                </span>
              </Show>
            </h1>
            <p
              class="fall-block mt-6 max-w-md text-body-lg text-text-muted"
              style={{ "--i": "2" }}
            >
              Wie soll sich das hier anfühlen? Such dir einen Look aus — die
              Seite zieht sofort mit. Und wenn du später ein Konto hast, reist
              er mit in deine App.
            </p>
            <div class="mt-8 max-w-xl">
              <ThemeBoard />
              <div
                class="fall-block mt-4 flex flex-wrap items-center justify-between gap-3"
                style={{ "--i": `${3 + THEMES.length}` }}
              >
                <ModeRow />
                <Show when={!returning || name()}>
                  <button
                    type="button"
                    onClick={() => setStep("name")}
                    class="rounded-xs px-2 py-1 font-mono text-mini uppercase tracking-[0.2em] text-text-muted transition-colors hover:bg-surface hover:text-text"
                  >
                    {name() ? `Nicht ${name()}?` : "Name ändern"}
                  </button>
                </Show>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                scene1El?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              class="fall-block group mt-14 flex items-center gap-3 rounded-xs py-1 pr-2 font-mono text-mini uppercase tracking-[0.25em] text-text-muted transition-colors hover:text-text"
              style={{ "--i": `${4 + THEMES.length}` }}
            >
              <ChevronDown
                class="size-4 transition-transform duration-300 [transition-timing-function:var(--ease-quart)] group-hover:translate-y-1"
                aria-hidden
              />
              Und darum geht's
            </button>
          </div>
        </Show>
      </section>

      {/* ── 01 · Das Problem — the chat everyone has ─────────────────────── */}
      <Section
        setRef={(el) => {
          secEls[0] = el;
          scene1El = el;
        }}
        kicker="01 — Kennst du das?"
        keyword={
          <span class="whitespace-nowrap">
            „Folge 8?“<Hanko />
          </span>
        }
        copy="Drei Serien parallel, zwei Apps, ein Chat. Und niemand weiß mehr, wo ihr wart. Der Stand eurer gemeinsamen Sachen lebt — nirgends."
        stage={<ChatChaos />}
      />

      {/* ── 02 · Die Wende — the interactive sync proof (flipped: window
             bleeds LEFT, rail right — the page changes stance mid-story) ──── */}
      <Section
        setRef={(el) => (secEls[1] = el)}
        flip
        kicker="02 — Die Wende"
        keyword={
          <span class="whitespace-nowrap">
            Synchron
            <Hanko />
          </span>
        }
        copy={
          <>
            Eine geteilte Liste ist euer Gedächtnis: Ihr hakt ab, der Stand
            bleibt synchron, und am Auge siehst du, wer schon weiter ist.
            Probier's, {greet()} — tipp im Fenster die neue Folge an.
          </>
        }
        stage={
          <AppWindow
            class={`${WINDOW_W} grow-from-right`}
            chromeKicker="Anime"
            chromeTitle="Frieren"
            mirror
          >
            <EpisodesSurface mirror />
          </AppWindow>
        }
      />

      {/* ── 03 · Future-Fokus — the radar, not the diary ─────────────────── */}
      <Section
        setRef={(el) => (secEls[2] = el)}
        kicker="03 — Der Blick nach vorn"
        keyword={
          <>
            Was{" "}
            <span class="whitespace-nowrap">
              kommt
              <Hanko />
            </span>
          </>
        }
        copy="Nakama ist kein Tagebuch für gestern, sondern ein Radar für morgen: heute, morgen, demnächst — über alles hinweg, was ihr verfolgt. Und wenn eine neue Folge da ist, meldet sich dein Handy von selbst."
        stage={
          <div class="relative">
            <PushMock />
            <AppWindow class={WINDOW_W} chromeTitle="Was kommt">
              <WasKommtSurface />
            </AppWindow>
          </div>
        }
      />

      {/* ── 04 · Der Rest — the ONE compact feature block ────────────────── */}
      <section
        ref={(el) => (secEls[3] = el)}
        class="relative flex min-h-screen flex-col justify-center border-t border-rule px-5 py-24 sm:px-8 md:pl-20"
      >
        <p
          class="fall-block font-mono text-mini uppercase tracking-[0.25em] text-text-muted"
          style={{ "--i": "0" }}
        >
          04 — Und der Rest
        </p>
        <h2
          class="fall-block mt-4 text-[clamp(2.75rem,9vw,6.5rem)] font-medium leading-[0.95] tracking-[-0.03em] text-text"
          style={{ "--i": "1" }}
        >
          Alles{" "}
          <span class="whitespace-nowrap">
            drin
            <Hanko />
          </span>
        </h2>
        <div class="mt-12 grid max-w-5xl grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          <For each={FEATURES}>
            {(f, i) => (
              <div
                class="fall-block bg-bg p-6 transition-colors hover:bg-surface"
                style={{ "--i": `${2 + i()}` }}
              >
                <f.icon class="size-4 text-accent" strokeWidth={2} aria-hidden />
                <h3 class="mt-4 font-mono text-label uppercase tracking-[0.18em] text-text">
                  {f.label}
                </h3>
                <p class="mt-2 text-body text-text-muted">{f.body}</p>
              </div>
            )}
          </For>
        </div>
      </section>

      {/* ── Finale — the page uses your name one last time ───────────────── */}
      <section
        ref={(el) => (finaleEl = el)}
        class="border-t border-rule pb-24 pt-16"
      >
        <CoverPan />
        {/* Right-aligned close — the mirror of the left-opening prolog, and
            the last stance change on the page. */}
        <div class="flex flex-col items-start px-5 pt-20 text-left sm:px-8 md:items-end md:pr-12 md:text-right">
          <p
            class="fall-block font-mono text-mini uppercase tracking-[0.25em] text-text-muted"
            style={{ "--i": "0" }}
          >
            仲間 · Nakama — Gefährte
          </p>
          <h2
            class="fall-block mt-4 max-w-[14ch] text-[clamp(3rem,11vw,8rem)] font-medium leading-[0.92] tracking-[-0.03em] text-text"
            style={{ "--i": "1" }}
          >
            <Show
              when={name()}
              fallback={
                <span class="whitespace-nowrap">
                  Bereit?
                  <Hanko />
                </span>
              }
            >
              Bereit,{" "}
              <span class="whitespace-nowrap">
                {name()}?<Hanko />
              </span>
            </Show>
          </h2>
          <p
            class="fall-block mt-6 max-w-md text-body-lg text-text-muted"
            style={{ "--i": "2" }}
          >
            Hol deine Leute dazu und seht zusammen, was kommt. Kostenlos.
          </p>
          <div class="fall-block mt-8 flex flex-wrap gap-3" style={{ "--i": "3" }}>
            <A href="/features">
              <Button variant="secondary">Alle Features</Button>
            </A>
            <A href="/login">
              <Button variant="primary">Loslegen</Button>
            </A>
          </div>
        </div>
      </section>

      <StandaloneFooter />
    </main>
  );
}
