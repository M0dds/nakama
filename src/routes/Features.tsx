import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Check, Clock, Crown, Eye } from "lucide-solid";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

/**
 * Public, shareable feature page (/features) — the "what is Nakama" surface a
 * prospective user looks at before signing in. Standalone like /styleguide: no
 * AppShell / BottomNav, its own header, no auth. Built entirely from the real
 * design tokens + primitives so it reads as the app, not a marketing skin —
 * each section pairs a short description with a small, style-true mockup
 * assembled from the same vocabulary the live screens use.
 */
export default function Features() {
  return (
    <main class="mx-auto max-w-5xl">
      {/* Top bar */}
      <header class="flex items-center justify-between px-5 py-5">
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
      <section class="px-5 pb-16 pt-10 sm:pt-16">
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
        desc="Das Dashboard zeigt, was diese Woche erscheint und wo du weiterschauen kannst. „Neue Folge“-Badges markieren überall, wo etwas auf dich wartet."
        reverse
      >
        <UpcomingMock />
      </FeatureSection>

      <FeatureSection
        n="03"
        label="Kalender"
        title="Der Wochen­plan eurer Shows."
        desc="Ein Wochen- und Monats-Raster mit allen Air-Dates. Tippen öffnet den Tag, Häkchen direkt aus dem Kalender, Long-Press holt auf."
      >
        <CalendarMock />
      </FeatureSection>

      <FeatureSection
        n="04"
        label="Teilen & Sync"
        title="Zusammen schauen, synchron bleiben."
        desc="Lade per @handle in eine Liste ein. Optionaler Sync hält den Fortschritt zwischen Mitgliedern im Gleichschritt — und Mitseher-Marker zeigen, wer eine Folge schon gesehen hat."
        reverse
      >
        <ShareMock />
      </FeatureSection>

      <FeatureSection
        n="05"
        label="Logbuch"
        title="Was bei euch passiert ist."
        desc="Ein ruhiger Aktivitäts-Feed: wer was gesehen oder hinzugefügt hat, verpasste Folgen mit Sofort-Abhaken, und Übergaben. Kein Like, kein Lärm — nur Fakten."
      >
        <LogbuchMock />
      </FeatureSection>

      <FeatureSection
        n="06"
        label="Themes"
        title="In deiner Farbe."
        desc="Acht Themes, hell und dunkel. Probier sie gleich hier aus — die ganze Seite schaltet live um, und deine Wahl bleibt erhalten."
        reverse
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

      <footer class="flex items-center justify-between border-t border-rule px-5 py-6">
        <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
          Nakama
        </span>
        <A
          href="/styleguide"
          class="font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-text"
        >
          Styleguide
        </A>
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

/** Tiny cover placeholder — type code over a subtle accent wash. */
function MockCover(props: { code: string; class?: string }) {
  return (
    <div
      class={`flex aspect-[2/3] items-end justify-start overflow-hidden rounded-xs border border-border bg-gradient-to-br from-accent/20 to-surface p-1.5 ${
        props.class ?? ""
      }`}
    >
      <span class="font-mono text-mini font-medium uppercase tracking-wider text-text">
        {props.code}
      </span>
    </div>
  );
}

function StatusDot(props: { watched?: boolean }) {
  return (
    <span
      aria-hidden
      class="size-2 shrink-0 rounded-full"
      classList={{
        "bg-accent": props.watched,
        "border border-border": !props.watched,
      }}
    />
  );
}

function TrackingMock() {
  const eps = [
    { code: "E12", title: "Aufbruch", watched: false },
    { code: "E11", title: "Das Versprechen", watched: false },
    { code: "E10", title: "Nordwärts", watched: true },
    { code: "E09", title: "Im Schnee", watched: true },
  ];
  return (
    <MockCard>
      <div class="flex gap-3">
        <MockCover code="AN" class="w-14 shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex items-start gap-2">
            <h3 class="min-w-0 truncate text-body-lg font-medium text-text">
              Frieren
            </h3>
            <Badge tone="accent" class="shrink-0">
              2 Folgen
            </Badge>
          </div>
          <p class="mt-0.5 font-mono text-mini uppercase tracking-wider text-text-muted">
            Anime · 9/12
          </p>
          {/* progress bar — hairline track + accent fill */}
          <div class="mt-2 h-1 w-full bg-border">
            <div class="h-full bg-accent" style={{ width: "75%" }} />
          </div>
        </div>
      </div>
      <ul class="mt-4 -mb-1">
        <For each={eps}>
          {(e) => (
            <li class="flex items-center gap-3 border-t border-border py-2 first:border-t-0">
              <span class="w-9 shrink-0 font-mono text-mini uppercase tracking-wider text-text-muted">
                {e.code}
              </span>
              <span class="min-w-0 flex-1 truncate text-body text-text">
                {e.title}
              </span>
              <StatusDot watched={e.watched} />
            </li>
          )}
        </For>
      </ul>
    </MockCard>
  );
}

function UpcomingMock() {
  const rows = [
    { day: "Heute", title: "Frieren", code: "E08", soon: true },
    { day: "Mo", title: "One Piece", code: "E1091", soon: false },
    { day: "Do", title: "Dandadan", code: "E10", soon: false },
  ];
  return (
    <MockCard>
      <ul>
        <For each={rows}>
          {(r) => (
            <li class="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0">
              <span
                class="w-12 shrink-0 font-mono text-mini uppercase tracking-wider"
                classList={{
                  "text-accent": r.soon,
                  "text-text-muted": !r.soon,
                }}
              >
                {r.day}
              </span>
              <span class="min-w-0 flex-1 truncate text-body font-medium text-text">
                {r.title}
              </span>
              <Badge tone="default" class="shrink-0">
                {r.code}
              </Badge>
            </li>
          )}
        </For>
      </ul>
    </MockCard>
  );
}

function CalendarMock() {
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  // 7×4 grid; a handful of air-date dots + one "today".
  const dots = new Set([2, 5, 9, 13, 16, 20, 23]);
  const today = 9;
  return (
    <MockCard>
      <div class="grid grid-cols-7 gap-1">
        <For each={days}>
          {(d) => (
            <span class="pb-1 text-center font-mono text-mini uppercase tracking-wider text-text-muted">
              {d}
            </span>
          )}
        </For>
        <For each={Array.from({ length: 28 }, (_, i) => i)}>
          {(i) => (
            <div
              class="flex aspect-square flex-col items-center justify-center rounded-xs border text-mini"
              classList={{
                "border-accent text-accent": i === today,
                "border-border text-text-muted": i !== today,
              }}
            >
              <span class="tabular-nums">{i + 1}</span>
              <Show when={dots.has(i)}>
                <span class="mt-0.5 size-1 rounded-full bg-accent" />
              </Show>
            </div>
          )}
        </For>
      </div>
    </MockCard>
  );
}

function ShareMock() {
  return (
    <MockCard>
      <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
        Mitglieder
      </p>
      <ul class="space-y-1">
        <li class="flex items-center gap-3 py-1">
          <Avatar handle="@aki" size={28} />
          <span class="min-w-0 flex-1 truncate text-body text-text">@aki</span>
          <span class="inline-flex items-center gap-1 font-mono text-mini uppercase tracking-wider text-text-muted">
            <Crown class="size-3.5" strokeWidth={1.75} aria-hidden />
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
      <div class="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span class="inline-flex items-center gap-1.5 text-body text-text-muted">
          <Eye class="size-4" strokeWidth={1.75} aria-hidden />
          Mitseher
        </span>
        <div class="flex items-center -space-x-2">
          <Avatar handle="@aki" size={24} class="ring-2 ring-surface" />
          <Avatar handle="@lisa" size={24} class="ring-2 ring-surface" />
          <Avatar handle="@noa" size={24} class="ring-2 ring-surface" />
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
        {/* missed — clock accent + Abhaken */}
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
            <div class="mt-0.5 flex items-center gap-2">
              <span class="font-mono text-mini tabular-nums text-text-muted">
                gestern
              </span>
              <span class="inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-mono text-mini uppercase tracking-wider text-accent">
                <Check class="size-3" strokeWidth={2.5} aria-hidden />
                Abhaken
              </span>
            </div>
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
    title: "Folgen-Titel",
    desc: "Titel werden automatisch ergänzt — auch für lange Serien.",
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
