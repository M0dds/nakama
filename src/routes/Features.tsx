import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Bell, Clock, Crown, Eye } from "lucide-solid";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

/**
 * Public, shareable feature page (/features) — the "what is Nakama" surface a
 * prospective user looks at before signing in. Standalone like /styleguide: no
 * AppShell / BottomNav, its own header, no auth. Built entirely from the real
 * design tokens + primitives so it reads as the app, not a marketing skin —
 * each section pairs a short description with a small, style-true mockup
 * assembled from the same vocabulary the live screens use. The sticky header
 * borrows the app's frosted HeadBar (bg-bg/55 + backdrop-blur) so the front
 * door feels like the room behind it.
 */
const MEDIA = ["Anime", "Manga", "Serien", "Filme", "Spiele"];

export default function Features() {
  return (
    <main class="mx-auto max-w-5xl">
      {/* Frosted top bar — mirrors the in-app HeadBar so the door matches the room. */}
      <header class="sticky top-0 z-20 flex items-center justify-between bg-bg/55 px-5 py-4 backdrop-blur-md">
        <div class="flex items-center gap-2">
          <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
          <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
            Nakama
          </span>
        </div>
        <A href="/login">
          <Button variant="secondary">Anmelden</Button>
        </A>
      </header>

      {/* Hero */}
      <section class="px-5 pb-14 pt-10 sm:pt-16">
        <p class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
          Gemeinsamer Media-Tracker
        </p>
        <h1 class="mt-4 max-w-2xl text-[2rem] font-medium leading-[1.08] tracking-tight text-text sm:text-[2.75rem]">
          Behaltet im Blick, was als Nächstes läuft.
        </h1>
        <p class="mt-5 max-w-xl text-body-lg text-text-muted">
          Nakama verfolgt Anime, Manga, Serien, Filme und Spiele — für dich und
          deine Leute. Pro Folge abhaken, synchron mit deinen Mitseher:innen,
          mit dem Fokus auf das, was noch kommt. Kein Tracking-Tagebuch, ein
          Future-Fokus-Tool.
        </p>
        {/* Media breadth, stated up front. */}
        <div class="mt-7 flex flex-wrap gap-2">
          <For each={MEDIA}>
            {(m) => (
              <span class="rounded-xs border border-border px-2.5 py-1 font-mono text-mini uppercase tracking-wider text-text-muted">
                {m}
              </span>
            )}
          </For>
        </div>
        <div class="mt-8 flex flex-wrap items-center gap-3">
          <A href="/login">
            <Button variant="primary">Loslegen</Button>
          </A>
          <a href="#features">
            <Button variant="secondary">Features ansehen</Button>
          </a>
        </div>
      </section>

      <div id="features" />

      <FeatureSection
        n="01"
        label="Tracking"
        title="Jede Folge, ein Häkchen."
        desc="Hak Folgen einzeln ab oder hol per Long-Press in einem Rutsch auf. Der Fortschritt steht immer da — und die nächste offene Folge weißt du auf einen Blick."
      >
        <TrackingMock />
      </FeatureSection>

      <FeatureSection
        n="02"
        label="Future-Fokus"
        title="Was kommt — nicht was war."
        desc="Das Dashboard zeigt, was als Nächstes erscheint — neue Folgen, Filmstarts, Release-Tage von Spielen — und wo du weiterschauen kannst. „Neue Folge“-Badges markieren überall, wo etwas auf dich wartet."
        reverse
      >
        <UpcomingMock />
      </FeatureSection>

      <FeatureSection
        n="03"
        label="Benachrichtigungen"
        title="Wir sagen Bescheid, wenn’s da ist."
        desc="Erscheint eine neue Folge deiner getrackten Anime oder Serien, schickt dir Nakama innerhalb weniger Stunden eine Push-Benachrichtigung — auch wenn die App geschlossen ist. Pro Gerät an- oder ausschaltbar."
      >
        <PushMock />
      </FeatureSection>

      <FeatureSection
        n="04"
        label="Kalender"
        title="Der Wochen­plan eurer Shows."
        desc="Ein Wochen- und Monats-Raster mit allen Air-Dates. Tippen öffnet den Tag mit allen Folgen und deinem Sehstatus — abgehakt wird auf der Item-Seite."
        reverse
      >
        <CalendarMock />
      </FeatureSection>

      <FeatureSection
        n="05"
        label="Teilen & Sync"
        title="Zusammen schauen, synchron bleiben."
        desc="Lade per @handle in eine Liste ein. Optionaler Sync hält den Fortschritt zwischen Mitgliedern im Gleichschritt — und Mitseher-Marker zeigen, wer eine Folge schon gesehen hat."
      >
        <ShareMock />
      </FeatureSection>

      <FeatureSection
        n="06"
        label="Logbuch"
        title="Was bei euch passiert ist."
        desc="Ein ruhiger Aktivitäts-Feed: wer was gesehen oder hinzugefügt hat, neu erschienene Folgen und Übergaben — filterbar nach Releases, Aktivität und Eigenem. Kein Like, kein Lärm, nur Fakten."
        reverse
      >
        <LogbuchMock />
      </FeatureSection>

      <FeatureSection
        n="07"
        label="Themes"
        title="In deiner Farbe."
        desc="Neun Themes, hell und dunkel. Probier sie gleich hier aus — die ganze Seite schaltet live um, und deine Wahl bleibt erhalten."
      >
        <div class="rounded-sm border border-border bg-surface p-5 shadow-resting">
          <ThemeSwitcher />
        </div>
      </FeatureSection>

      {/* More, in brief */}
      <section class="border-t border-rule px-5 py-12">
        <h2 class="font-mono text-label uppercase tracking-[0.18em] text-text-muted">
          Außerdem
        </h2>
        <div class="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <For each={EXTRAS}>
            {(x) => (
              <div>
                <h3 class="text-body font-medium text-text">{x.title}</h3>
                <p class="mt-1 text-body text-text-muted">{x.desc}</p>
              </div>
            )}
          </For>
        </div>
      </section>

      {/* Closing CTA */}
      <section class="border-t border-rule px-5 py-16 text-center">
        <div class="mb-4 flex justify-center">
          <span aria-hidden class="size-3 rounded-full bg-accent" />
        </div>
        <h2 class="text-heading font-medium tracking-tight text-text">
          Bereit, gemeinsam dranzubleiben?
        </h2>
        <p class="mx-auto mt-2 max-w-md text-body text-text-muted">
          Anmelden mit Discord oder Magic-Link. Beim ersten Login wird
          automatisch ein Profil angelegt.
        </p>
        <div class="mt-6 flex justify-center">
          <A href="/login">
            <Button variant="primary">Anmelden</Button>
          </A>
        </div>
      </section>

      <footer class="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-rule px-5 py-6">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          Nakama
        </span>
        <nav class="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-mini uppercase tracking-wider text-text-muted">
          <A href="/privacy" class="transition-colors hover:text-text">
            Datenschutz
          </A>
          <A href="/styleguide" class="transition-colors hover:text-text">
            Styleguide
          </A>
        </nav>
      </footer>
    </main>
  );
}

// ── Section scaffold ──────────────────────────────────────────────────────

/** A numbered feature block: text column + mockup column, alternating sides on
 *  desktop (reverse), stacked on mobile. Mirrors the BentoModule label/number
 *  header so it reads as part of the same instrument. */
function FeatureSection(props: {
  n: string;
  label: string;
  title: string;
  desc: string;
  reverse?: boolean;
  children: JSX.Element;
}) {
  return (
    <section class="border-t border-rule">
      <div class="grid items-center gap-8 px-5 py-12 md:grid-cols-2 md:py-16">
        <div classList={{ "md:order-2": props.reverse }}>
          <div class="flex items-baseline justify-between">
            <span class="font-mono text-label uppercase tracking-[0.18em] text-text-muted">
              {props.label}
            </span>
            <span class="font-mono text-label font-medium tabular-nums tracking-tight text-text">
              {props.n}
            </span>
          </div>
          <h2 class="mt-3 text-heading font-medium tracking-tight text-text">
            {props.title}
          </h2>
          <p class="mt-2 text-body-lg text-text-muted">{props.desc}</p>
        </div>
        <div classList={{ "md:order-1": props.reverse }}>{props.children}</div>
      </div>
    </section>
  );
}

// ── Mockups (static, built from the real vocabulary) ────────────────────────

function MockCard(props: { children: JSX.Element; class?: string }) {
  return (
    <div
      class={`rounded-sm border border-border bg-surface p-4 shadow-resting ${
        props.class ?? ""
      }`}
    >
      {props.children}
    </div>
  );
}

/** Watch-state dot — accent when watched, hollow hairline ring when not.
 *  Mirrors the real episode-row dot in ItemDetail. */
function StatusDot(props: { watched?: boolean }) {
  return (
    <span
      aria-hidden
      class="size-2 shrink-0 rounded-full"
      classList={{
        "bg-accent": props.watched,
        "bg-transparent ring-1 ring-border": !props.watched,
      }}
    />
  );
}

/** Mirrors the live item page: title in a PageHeader-style block, then the
 *  "Episoden 01" module with progress + episode rows (number · title · air-tag
 *  or date · ticked dot on the right). The cover lives in "02 · Details" on the
 *  real page, so it's deliberately absent here. */
function TrackingMock() {
  const eps = [
    { num: "12", title: "Aufbruch", tag: "Heute", date: null, watched: false },
    { num: "11", title: "Das Versprechen", tag: null, date: "10. Jun", watched: true },
    { num: "10", title: "Nordwärts", tag: null, date: "03. Jun", watched: true },
    { num: "09", title: "Im Schnee", tag: null, date: "27. Mai", watched: true },
  ];
  return (
    <MockCard>
      {/* PageHeader essence — hanko dot + title, "Zurücksetzen" in the aside. */}
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
          <h3 class="truncate text-body-lg font-medium text-text">Frieren</h3>
        </div>
        <span class="shrink-0 font-mono text-mini uppercase tracking-wider text-text-muted">
          Zurücksetzen
        </span>
      </div>

      {/* "Episoden 01" module head. */}
      <div class="mt-5 flex items-baseline justify-between">
        <span class="font-mono text-label uppercase tracking-[0.18em] text-text-muted">
          Episoden
        </span>
        <span class="font-mono text-label font-medium tabular-nums text-text">
          01
        </span>
      </div>

      {/* Progress — "Fortschritt" label + watched/total · % , hairline track. */}
      <div class="mt-3">
        <div class="flex items-baseline justify-between gap-3">
          <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
            Fortschritt
          </span>
          <span class="font-mono text-mini tabular-nums text-text">
            11/12 <span class="text-text-muted">· 92 %</span>
          </span>
        </div>
        <div class="mt-2 h-1 w-full overflow-hidden bg-border">
          <div class="h-full bg-accent" style={{ width: "92%" }} />
        </div>
      </div>

      {/* Episode rows — newest on top, ticked dot right-aligned. */}
      <ul class="mt-4 -mb-1">
        <For each={eps}>
          {(e) => (
            <li class="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
              <span class="w-7 shrink-0 font-mono text-mini font-medium tabular-nums tracking-wider text-text">
                {e.num}
              </span>
              <span class="min-w-0 flex-1 truncate text-body text-text">
                {e.title}
              </span>
              <span
                class="shrink-0 font-mono text-mini uppercase tracking-wider tabular-nums"
                classList={{
                  "text-accent": !!e.tag,
                  "text-text-muted": !e.tag,
                }}
              >
                {e.tag ?? e.date}
              </span>
              <StatusDot watched={e.watched} />
            </li>
          )}
        </For>
      </ul>
    </MockCard>
  );
}

/** "Was kommt" — the live dashboard is a cover-card grid, not a list: one wide,
 *  accent-filled hero ("HEUTE") plus smaller cards, each a cover area with a
 *  caption (day · title · type) below. The grid deliberately mixes an anime
 *  episode, a film release and a game release so the breadth reads at a glance.
 *  Cover art is stubbed as a soft wash (no real posters in a static mock). */
function UpcomingMock() {
  return (
    <div class="grid grid-cols-2 gap-3">
      {/* Hero — today's drop, accent-filled like the live "Was kommt" hero. */}
      <div class="col-span-2 flex h-36 flex-col overflow-hidden rounded-sm border border-accent bg-accent">
        <div class="flex min-h-0 flex-1 items-center justify-center bg-gradient-to-br from-accent-on/15 to-transparent">
          <span class="font-mono text-mini uppercase tracking-wider text-accent-on/40">
            AN
          </span>
        </div>
        <div class="shrink-0 px-3 py-2.5">
          <span class="font-mono text-mini uppercase tracking-wider text-accent-on">
            Heute
          </span>
          <h3 class="truncate text-body font-medium text-accent-on">Frieren</h3>
          <span class="block truncate font-mono text-mini text-accent-on/85">
            Anime · E08
          </span>
        </div>
      </div>
      <UpcomingCard code="FI" day="Fr" title="Dune: Part Two" sub="Film" />
      <UpcomingCard code="SP" day="Sa" title="Silksong" sub="Spiel" />
    </div>
  );
}

function UpcomingCard(props: {
  code: string;
  day: string;
  title: string;
  sub: string;
}) {
  return (
    <div class="flex h-32 flex-col overflow-hidden rounded-sm border border-border bg-bg">
      <div class="flex min-h-0 flex-1 items-center justify-center bg-gradient-to-br from-accent/15 to-surface">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted opacity-50">
          {props.code}
        </span>
      </div>
      <div class="shrink-0 px-3 py-2.5">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          {props.day}
        </span>
        <h3 class="truncate text-body font-medium text-text">{props.title}</h3>
        <span class="block truncate font-mono text-mini text-text-muted">
          {props.sub}
        </span>
      </div>
    </div>
  );
}

/** Push mockup — a frosted notification card echoing the app's glass language,
 *  with a faint back-card peeking out for depth. */
function PushMock() {
  return (
    <div class="relative px-1 pt-2">
      {/* back card, peeking — gives the notification a small stack of depth */}
      <div
        aria-hidden
        class="absolute inset-x-4 top-0 h-12 rounded-sm border border-border bg-surface/50"
      />
      <div class="relative flex items-start gap-3 rounded-sm border border-border bg-bg/70 p-4 shadow-floating backdrop-blur-md">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-xs bg-accent text-accent-on">
          <Bell class="size-4.5" strokeWidth={2} aria-hidden />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <span class="font-mono text-mini uppercase tracking-[0.2em] text-text-muted">
              Nakama
            </span>
            <span class="font-mono text-mini tabular-nums text-text-muted">
              jetzt
            </span>
          </div>
          <p class="mt-1 text-body font-medium text-text">Neue Folge</p>
          <p class="mt-0.5 text-body text-text-muted">
            <span class="text-text">Frieren</span> · E08 „Aufbruch“ ist
            erschienen.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Mirrors the live calendar's default WEEK view: a Woche/Monat toggle, then a
 *  day list — weekday + date column, the day's episodes (code · title · status
 *  dot) or an em-dash, with "+N weitere" when a day overflows. The dot
 *  vocabulary matches the app: filled = gesehen, hollow accent = erschienen,
 *  hollow grey = kommt noch. */
function CalendarMock() {
  type EvState = "watched" | "released" | "upcoming";
  const days: {
    wd: string;
    date: string;
    today?: boolean;
    evs: { code: string; title: string; state: EvState }[];
    more?: number;
  }[] = [
    { wd: "Mo", date: "15", evs: [] },
    {
      wd: "Di",
      date: "16",
      evs: [{ code: "08", title: "Frieren", state: "watched" }],
    },
    {
      wd: "Mi",
      date: "17",
      today: true,
      evs: [{ code: "1091", title: "One Piece", state: "released" }],
      more: 2,
    },
    { wd: "Do", date: "18", evs: [] },
    {
      wd: "Fr",
      date: "19",
      evs: [{ code: "03", title: "Dandadan", state: "upcoming" }],
    },
  ];
  return (
    <MockCard>
      {/* Woche / Monat toggle (static stand-in for the live Segmented). */}
      <div class="mb-4 inline-flex rounded-sm border border-border p-0.5 font-mono text-mini uppercase tracking-wider">
        <span class="rounded-xs bg-accent px-3 py-1 text-accent-on">Woche</span>
        <span class="px-3 py-1 text-text-muted">Monat</span>
      </div>

      <ul class="-mb-1">
        <For each={days}>
          {(day) => (
            <li class="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0">
              <div class="w-9 shrink-0">
                <div class="font-mono text-mini uppercase tracking-wider text-text-muted">
                  {day.wd}
                </div>
                <div
                  class="font-mono text-body tabular-nums"
                  classList={{
                    "text-accent": !!day.today,
                    "text-text": !day.today,
                  }}
                >
                  {day.date}
                </div>
              </div>
              <div class="min-w-0 flex-1 space-y-0.5 pt-0.5">
                <Show
                  when={day.evs.length > 0}
                  fallback={<span class="text-body text-text-muted">—</span>}
                >
                  <For each={day.evs}>{(e) => <CalEventChip ev={e} />}</For>
                  <Show when={day.more}>
                    <span class="block font-mono text-mini uppercase tracking-wider text-text-muted">
                      +{day.more} weitere
                    </span>
                  </Show>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
    </MockCard>
  );
}

/** One episode line inside the week-grid day — mirrors Calendar's EventChip. */
function CalEventChip(props: {
  ev: { code: string; title: string; state: "watched" | "released" | "upcoming" };
}) {
  return (
    <div class="flex items-center gap-2">
      <span class="shrink-0 font-mono text-mini tabular-nums text-text-muted">
        {props.ev.code}
      </span>
      <span
        class="min-w-0 truncate text-body"
        classList={{
          "text-text": props.ev.state === "released",
          "text-text-muted": props.ev.state !== "released",
        }}
      >
        {props.ev.title}
      </span>
      <span
        aria-hidden
        class="size-2 shrink-0 rounded-full"
        classList={{
          "bg-accent": props.ev.state === "watched",
          "bg-transparent ring-1 ring-accent": props.ev.state === "released",
          "bg-transparent ring-1 ring-border": props.ev.state === "upcoming",
        }}
      />
    </div>
  );
}

function ShareMock() {
  return (
    <MockCard>
      <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
        Mitglieder
      </p>
      <ul class="space-y-1">
        {/* Owner is marked with the plain word "Ersteller" — no crown icon
            (the crown is the hand-over action on other members' rows). */}
        <li class="flex items-center gap-3 py-1">
          <Avatar handle="@aki" size={28} />
          <span class="min-w-0 flex-1 truncate text-body text-text">@aki</span>
          <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
            Ersteller
          </span>
        </li>
        <li class="flex items-center gap-3 py-1">
          <Avatar handle="@lisa" size={28} />
          <span class="min-w-0 flex-1 truncate text-body text-text">
            @lisa <span class="text-text-muted">· du</span>
          </span>
        </li>
      </ul>

      {/* Mitseher — the real signal is an eye marker sitting on an episode row
          that reveals who has already seen it (here shown inline). It lives on
          the item page, not the roster. */}
      <div class="mt-4 border-t border-border pt-3">
        <p class="mb-2 font-mono text-mini uppercase tracking-wider text-text-muted">
          Mitseher
        </p>
        <div class="flex items-center gap-3">
          <span class="w-9 shrink-0 font-mono text-mini font-medium tabular-nums tracking-wider text-text">
            1090
          </span>
          <span class="min-w-0 flex-1 truncate text-body text-text">
            One Piece
          </span>
          <span class="inline-flex items-center gap-1.5">
            <Eye class="size-4 text-text-muted" strokeWidth={1.75} aria-hidden />
            <div class="flex items-center -space-x-1.5">
              <Avatar handle="@aki" size={20} class="ring-2 ring-surface" />
              <Avatar handle="@noa" size={20} class="ring-2 ring-surface" />
            </div>
          </span>
          <StatusDot watched />
        </div>
      </div>
    </MockCard>
  );
}

function LogbuchMock() {
  return (
    <MockCard>
      <ul class="-my-1">
        {/* co-member watch — avatar + eye badge */}
        <li class="flex items-start gap-3 border-t border-border py-3 first:border-t-0">
          <div class="relative shrink-0 pt-0.5">
            <Avatar handle="@aki" size={24} />
            <span class="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border border-border bg-surface">
              <Eye class="size-2.5 text-text-muted" strokeWidth={2} aria-hidden />
            </span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-body text-text">
              <span class="font-medium">@aki</span> hat{" "}
              <span class="font-medium">One Piece</span>{" "}
              <span class="font-mono text-mini uppercase tracking-wider">
                E1088–E1090
              </span>{" "}
              gesehen.
            </p>
            <span class="mt-0.5 block font-mono text-mini tabular-nums text-text-muted">
              vor 2 Std.
            </span>
          </div>
        </li>
        {/* missed — clock accent, read-only "something new dropped" nudge */}
        <li class="flex items-start gap-3 border-t border-border py-3">
          <div class="flex w-6 shrink-0 justify-center pt-0.5">
            <Clock class="size-4 text-accent" strokeWidth={1.75} aria-hidden />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-body text-text">
              <span class="font-medium">Frieren</span>{" "}
              <span class="font-mono text-mini uppercase tracking-wider">
                E08
              </span>{" "}
              ist erschienen.
            </p>
            <span class="mt-0.5 block font-mono text-mini tabular-nums text-text-muted">
              gestern
            </span>
          </div>
        </li>
        {/* transfer — avatar + crown badge */}
        <li class="flex items-start gap-3 border-t border-border py-3">
          <div class="relative shrink-0 pt-0.5">
            <Avatar handle="@lisa" size={24} />
            <span class="absolute -bottom-1 -right-1 flex size-[15px] items-center justify-center rounded-full border border-border bg-surface">
              <Crown class="size-2.5 text-text-muted" strokeWidth={2} aria-hidden />
            </span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-body text-text">
              <span class="font-medium">@lisa</span> hat{" "}
              <span class="font-medium">Watchlist</span> an{" "}
              <span class="font-medium">dich</span> übergeben.
            </p>
            <span class="mt-0.5 block font-mono text-mini tabular-nums text-text-muted">
              vor 2 Tagen
            </span>
          </div>
        </li>
      </ul>
    </MockCard>
  );
}

const EXTRAS: { title: string; desc: string }[] = [
  {
    title: "Auto-Sync",
    desc: "Häkchen fächern automatisch an alle Mitglieder geteilter Listen.",
  },
  {
    title: "„Neue Folge“-Badges",
    desc: "Auf jeder Liste, jedem Eintrag — du siehst sofort, wo etwas wartet.",
  },
  {
    title: "Sortieren & Anpinnen",
    desc: "Zieh Listen und Einträge in Reihenfolge, pinne Wichtiges nach oben.",
  },
  {
    title: "Quellen inklusive",
    desc: "AniList, TMDB und Steam liefern Cover, Folgen und Release-Daten automatisch.",
  },
  {
    title: "Installierbar",
    desc: "Als PWA aufs Handy oder den Desktop, fühlt sich an wie eine App.",
  },
  {
    title: "Anmeldung in Sekunden",
    desc: "Discord oder Magic-Link, Profil wird automatisch angelegt.",
  },
];
