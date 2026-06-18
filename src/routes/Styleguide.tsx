import { createSignal, onMount, For } from "solid-js";
import { A } from "@solidjs/router";
import { StandaloneHeader, StandaloneFooter } from "@/components/StandaloneShell";
import {
  ArrowLeft,
  ArrowRightLeft,
  Calendar,
  Check,
  CircleCheck,
  CircleX,
  House,
  Info,
  List,
  Plus,
  RotateCcw,
  Search,
  User,
  X,
} from "lucide-solid";
import {
  THEMES,
  type ThemeId,
  type ThemeModePref,
  applyTheme,
  readTheme,
  readModePref,
} from "@/lib/themes";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { BentoModule } from "@/components/BentoModule";
import { PageHeader } from "@/components/PageHeader";
import { Tooltip } from "@/components/Tooltip";
import { SelectMenu } from "@/components/SelectMenu";
import { Segmented } from "@/components/Segmented";
import { PinButton } from "@/components/PinButton";
import { DragHandle } from "@/components/DragHandle";
import { GeneratedCover, coverSpecFromSeed } from "@/components/GeneratedCover";

/**
 * Styleguide — the source of truth for every visual decision. New primitives
 * land here FIRST with all variants + states; only then are they allowed in
 * features. The Anti-Patterns section documents what's deliberately NOT done.
 */
export default function Styleguide() {
  const [theme, setTheme] = createSignal<ThemeId>("default");
  const [mode, setMode] = createSignal<ThemeModePref>("system");
  const [demoOption, setDemoOption] = createSignal("anime");
  const [segDemo, setSegDemo] = createSignal<"track" | "archive">("track");
  const [pinDemo, setPinDemo] = createSignal(false);
  const auth = useAuth();

  onMount(() => {
    setTheme(readTheme());
    setMode(readModePref());
  });

  const pickTheme = (id: ThemeId) => {
    setTheme(id);
    applyTheme(id, mode());
  };
  const pickMode = (m: ThemeModePref) => {
    setMode(m);
    applyTheme(theme(), m);
  };

  return (
    <main class="mx-auto max-w-5xl">
      <StandaloneHeader />
      <div class="px-5 py-12">
      <header class="mb-12">
        <p class="font-mono text-mini uppercase tracking-wider text-text-muted">
          NAKAMA · Styleguide
        </p>
        <h1 class="mt-2 text-heading-lg font-medium text-text">
          Design-System
        </h1>
        <p class="mt-3 max-w-2xl text-body text-text-muted">
          Single source of truth für jedes visuelle Element. Wenn etwas hier
          nicht steht, gibt es das nicht. Jede neue Primitive landet zuerst
          auf dieser Seite mit allen Varianten — erst dann darf sie in
          Features verwendet werden.
        </p>
      </header>

      {/* ── 01 · Themes ──────────────────────────────────────────────── */}
      <Section number="01" label="Themes">
        <div class="grid gap-6 md:grid-cols-2">
          <div>
            <p class={dtClass}>Theme</p>
            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <For each={THEMES}>
                {(t) => (
                  <button
                    type="button"
                    onClick={() => pickTheme(t.id)}
                    aria-pressed={theme() === t.id}
                    class="flex items-center gap-2 rounded-sm border border-border px-2 py-2 text-left transition-colors hover:bg-surface aria-pressed:border-accent"
                  >
                    <span class="flex h-5 w-5 shrink-0 overflow-hidden rounded-xs border border-border">
                      <span
                        class="block h-full w-1/2"
                        style={{ background: t.swatch.light.bg }}
                      />
                      <span
                        class="block h-full w-1/2"
                        style={{ background: t.swatch.light.accent }}
                      />
                    </span>
                    <span class="truncate text-mini font-medium">{t.name}</span>
                  </button>
                )}
              </For>
            </div>
          </div>

          <div>
            <p class={dtClass}>Modus</p>
            <div class="mt-3">
              <Segmented<ThemeModePref>
                ariaLabel="Modus"
                value={mode()}
                onChange={pickMode}
                options={[
                  { value: "light", label: "Hell" },
                  { value: "dark", label: "Dunkel" },
                  { value: "system", label: "System" },
                ]}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* ── 02 · Color Tokens ───────────────────────────────────────── */}
      <Section number="02" label="Color Tokens">
        <div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Swatch token="bg" />
          <Swatch token="surface" />
          <Swatch token="text" />
          <Swatch token="text-muted" />
          <Swatch token="border" />
          <Swatch token="rule" />
          <Swatch token="accent" />
          <Swatch token="accent-on" />
        </div>
      </Section>

      {/* ── 03 · Typography ────────────────────────────────────────── */}
      <Section number="03" label="Typography">
        <div class="space-y-6">
          <TypeRow scale="text-heading-lg" weight="font-medium" sample="Heading L · 24/32" />
          <TypeRow scale="text-heading" weight="font-medium" sample="Heading · 22/28" />
          <TypeRow scale="text-body-lg" weight="font-medium" sample="Body L · 16/24 medium" />
          <TypeRow scale="text-body-lg" weight="font-normal" sample="Body L · 16/24 regular" />
          <TypeRow scale="text-body" weight="font-normal" sample="Body · 15/24 — der Default für Fließtext" />
          <TypeRow scale="text-label" weight="font-normal" sample="Label · 13" mono />
          <TypeRow scale="text-mini" weight="font-medium" sample="MINI · 12 MONO CAPS" mono uppercase />
        </div>
      </Section>

      {/* ── 04 · Spacing Grid ──────────────────────────────────────── */}
      <Section number="04" label="Spacing Grid">
        <p class="mb-4 text-body text-text-muted">
          4 px base unit. Tailwind utilities heißen <code class="font-mono text-mini">gap-N</code>,
          <code class="font-mono text-mini">p-N</code>, etc. — N × 4 px. Default-Innenabstand
          eines Bento-Moduls ist <code class="font-mono text-mini">p-5</code> (20 px).
        </p>
        <div class="space-y-2">
          <For each={[1, 2, 3, 4, 5, 6, 8, 12, 16, 20]}>
            {(n) => (
              <div class="flex items-center gap-4">
                <code class="w-16 font-mono text-mini text-text-muted">
                  {n} · {n * 4}px
                </code>
                <div
                  class="h-3 bg-accent"
                  style={{ width: `${n * 4}px` }}
                />
              </div>
            )}
          </For>
        </div>
      </Section>

      {/* ── 05 · Buttons ──────────────────────────────────────────── */}
      <Section number="05" label="Buttons">
        <div class="space-y-6">
          <Row label="Variants">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </Row>
          <Row label="States">
            <Button>Default</Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary">Hover ↗</Button>
          </Row>
          <p class="text-body text-text-muted">
            Eine Höhenstufe. Primary für die empfohlene Aktion einer Seite,
            Secondary für die Alternative, Ghost für Closing/Cancel. Mehr als
            ein Primary pro Bereich = Designfehler.
          </p>
        </div>
      </Section>

      {/* ── 06 · Badges ──────────────────────────────────────────── */}
      <Section number="06" label="Badges">
        <div class="space-y-6">
          <Row label="Tones">
            <Badge>AN</Badge>
            <Badge>TV</Badge>
            <Badge>FM</Badge>
            <Badge>GM</Badge>
            <Badge tone="accent">Neue Folge</Badge>
            <Badge tone="muted">Archiv</Badge>
          </Row>
          <p class="text-body text-text-muted">
            Immer mono, ALL CAPS, 12 px. „Default" rahmt den Mini-Code,
            „Accent" ohne Rahmen für CTA-artige Hinweise, „Muted" ohne
            Rahmen für sekundäre Stempel.
          </p>
        </div>
      </Section>

      {/* ── 07 · BentoModule ─────────────────────────────────────── */}
      <Section number="07" label="BentoModule">
        <p class="mb-4 text-body text-text-muted">
          Strukturelle Einheit jeder Seite. Kein Hintergrund, kein Schatten —
          Trennung kommt allein über 1 px-Lines.
        </p>
        <div class="grid grid-cols-1 border border-rule md:grid-cols-2">
          <BentoModule label="Einträge" number="01">
            <p class="text-body text-text">
              Inhalt eines Bento-Moduls. Liste, Text, Grid, beliebig.
            </p>
          </BentoModule>
          <BentoModule
            label="Details"
            number="02"
            class="border-t border-rule md:border-l md:border-t-0"
          >
            <p class="text-body text-text-muted">
              Zweite Spalte. Border-Rule trennt zwischen Modulen.
            </p>
          </BentoModule>
        </div>
      </Section>

      {/* ── 08 · PageHeader ──────────────────────────────────────── */}
      <Section number="08" label="PageHeader">
        <p class="mb-4 text-body text-text-muted">
          Instrument-Kopf auf jeder Seite. Hanko-Punkt + Kicker, dann Titel.
          Detailseiten überschreiben den Kicker mit Breadcrumb-Kontext.
        </p>
        <div class="border border-rule">
          <PageHeader title="Beispiel-Seite" />
        </div>
        <div class="mt-4 border border-rule">
          <PageHeader
            kicker="LISTEN"
            title="Lieblings-Anime"
            backHref="/"
            aside={
              <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
                12 Einträge
              </span>
            }
          />
        </div>
      </Section>

      {/* ── 09 · Mini-Codes ──────────────────────────────────────── */}
      <Section number="09" label="Mini-Codes">
        <p class="mb-4 text-body text-text-muted">
          Kürzel für Medien-Typen. ALL CAPS, mono, immer 12 px.
        </p>
        <div class="flex flex-wrap gap-2">
          <For each={miniCodes}>
            {([code, label]) => (
              <span class="inline-flex items-center gap-2">
                <Badge>{code}</Badge>
                <span class="text-mini text-text-muted">{label}</span>
              </span>
            )}
          </For>
        </div>
      </Section>

      {/* ── 10 · Tooltip ─────────────────────────────────────────── */}
      <Section number="10" label="Tooltip">
        <p class="mb-4 text-body text-text-muted">
          In-house statt natives <code class="font-mono text-mini">title</code>-Attribut.
          JS-positioniert + viewport-clamped — wird nie am Bildschirmrand
          abgeschnitten. Hover ODER Fokus öffnen ihn.
        </p>
        <div class="flex flex-wrap items-center gap-6">
          <Tooltip label="Hover oder fokussiere mich">
            <Button variant="secondary">Default · top</Button>
          </Tooltip>
          <Tooltip label="Bottom-Variante" side="bottom">
            <Button variant="secondary">Bottom</Button>
          </Tooltip>
          <Tooltip label="Disabled? Erklär den Grund">
            <Button disabled>Disabled mit Grund</Button>
          </Tooltip>
          <Tooltip label="Selbst Icon-only kriegt einen sichtbaren Hint">
            <button
              type="button"
              aria-label="Info"
              class="inline-flex size-9 items-center justify-center rounded-sm border border-border text-text transition-colors hover:bg-surface"
            >
              <Info class="size-4" strokeWidth={1.75} />
            </button>
          </Tooltip>
        </div>
      </Section>

      {/* ── 11 · SelectMenu ──────────────────────────────────────── */}
      <Section number="11" label="SelectMenu">
        <p class="mb-4 text-body text-text-muted">
          Styled Single-Select. Ersetzt das native{" "}
          <code class="font-mono text-mini">&lt;select&gt;</code> damit die
          Optik dem Theme folgt. Klick-außen + Escape schließen.
        </p>
        <div class="max-w-xs">
          <SelectMenu
            value={demoOption()}
            onChange={setDemoOption}
            ariaLabel="Demo-Auswahl"
            options={[
              { id: "anime", label: "Anime" },
              { id: "manga", label: "Manga" },
              { id: "series", label: "Serien" },
              { id: "movie", label: "Filme" },
              { id: "game", label: "Spiele" },
            ]}
          />
          <p class="mt-3 text-mini text-text-muted">
            Ausgewählt:{" "}
            <code class="font-mono text-text">{demoOption()}</code>
          </p>
        </div>
      </Section>

      {/* ── 12 · Auth State ──────────────────────────────────────── */}
      <Section number="12" label="Auth State">
        <p class="mb-4 text-body text-text-muted">
          Globaler Solid-Signal via{" "}
          <code class="font-mono text-mini">useAuth()</code>. Reagiert live
          auf Login / Logout / Token-Refresh — Komponenten re-rendern nur
          die Stellen, die <code class="font-mono text-mini">user()</code> /{" "}
          <code class="font-mono text-mini">session()</code> tatsächlich
          lesen.
        </p>
        <div class="rounded-sm border border-border p-4">
          <div class="flex items-baseline justify-between gap-3">
            <span class={dtClass}>Status</span>
            <span class="text-body text-text">
              {auth.loading()
                ? "Lade Session …"
                : auth.user()
                  ? "Eingeloggt"
                  : "Nicht eingeloggt"}
            </span>
          </div>
          <div class="mt-2 flex items-baseline justify-between gap-3">
            <span class={dtClass}>User-ID</span>
            <code class="truncate font-mono text-mini text-text-muted">
              {auth.user()?.id ?? "—"}
            </code>
          </div>
          <div class="mt-2 flex items-baseline justify-between gap-3">
            <span class={dtClass}>E-Mail</span>
            <code class="truncate font-mono text-mini text-text-muted">
              {auth.user()?.email ?? "—"}
            </code>
          </div>
        </div>
      </Section>

      {/* ── 13 · ColumnGuide ─────────────────────────────────────── */}
      <Section number="13" label="ColumnGuide">
        <p class="mb-4 text-body text-text-muted">
          Vertikale Trennlinie bei 2/3-Breite zwischen den Bento-Spalten.
          Real per <code class="font-mono text-mini">position: fixed inset-y-0</code> —
          läuft von der Viewport-Oberkante bis zur Unterkante, ignoriert
          Content-Höhe komplett. Damit lesen Spalten links/rechts immer als
          eindeutige Instrumentenpanel-Sektoren, egal wie ungleich gefüllt.
          Ab <code class="font-mono text-mini">md</code> sichtbar; auf Mobile
          stapeln die Spalten vertikal und die Linie verschwindet.
        </p>
        <div class="relative h-40 overflow-hidden border border-rule">
          {/* Contained mock — relative-positioned line, not the real
              fixed one. Same visual at 66.6667% to show the proportion. */}
          <div
            aria-hidden
            class="pointer-events-none absolute inset-y-0 w-px bg-rule"
            style={{ left: "66.6667%" }}
          />
          <div class="flex h-full">
            <div class="w-2/3 p-5">
              <p class="font-mono text-label uppercase tracking-wider text-text-muted">
                Spalte 01 · 2/3
              </p>
              <p class="mt-2 text-body text-text-muted">
                Linker Bereich (Was kommt, Einträge, Episodenliste …)
              </p>
            </div>
            <div class="w-1/3 p-5">
              <p class="font-mono text-label uppercase tracking-wider text-text-muted">
                Spalte 02 · 1/3
              </p>
              <p class="mt-2 text-body text-text-muted">
                Rechter Bereich (Logbuch, Details, Mitglieder …)
              </p>
            </div>
          </div>
        </div>
        <p class="mt-3 text-mini text-text-muted">
          Echtes Beispiel laufend auf{" "}
          <A href="/" class="text-text underline">Home</A>.
        </p>
      </Section>

      {/* ── 14 · BottomNav ───────────────────────────────────────── */}
      <Section number="14" label="BottomNav">
        <p class="mb-4 text-body text-text-muted">
          Floating Pill, fixed bottom-centered auf jedem Viewport.
          Fünf Items: <code class="font-mono text-mini">Home · Listen · + · Kalender · Profil</code>.
          Aktiver Tab bekommt einen liquid-sliding Accent-Bubble, der zwischen den
          Buttons in zwei Phasen morpht — stretch-into-capsule, dann contract.
          Das ist der einzige Ort in der App, wo <code class="font-mono text-mini">rounded-full</code>{" "}
          benutzt wird (siehe Anti-Patterns 16); das Pill IST buchstäblich eine
          Capsule.
        </p>
        <div class="space-y-4">
          <BottomNavMock />
          <p class="text-body text-text-muted">
            Das <code class="font-mono text-mini">+</code> sitzt center und ist
            keine Route — es öffnet die AddSheet (Section 15). Über
            {" "}<code class="font-mono text-mini">data-add-anchor</code> markiert
            die innere Pille den Morph-Origin für die Search-Pill der AddSheet.
            Während die Sheet offen ist, fadet die BottomNav per
            sequential-handoff weg (kein Crossfade — würde flackern, siehe
            Memory).
          </p>
          <BottomNavBackMock />
          <p class="text-body text-text-muted">
            Auf Detail-Routen (<code class="font-mono text-mini">/lists/:shortCode</code>,{" "}
            <code class="font-mono text-mini">/item/:type/:slug</code>) hängt
            links ein Back-Button-Satellit an der Pill. Er trägt
            {" "}<code class="font-mono text-mini">data-accent</code> statt eines
            der NavButtons — die Liquid-Bubble flowt aus dem alten aktiven Tab
            in den Satelliten und zurück (gleiche Stretch-and-Contract-Phasen).
            Der Pfeil fadet 100 ms versetzt rein, damit er erst auftaucht wenn
            die Bubble seinen Slot erreicht — sonst Ghost-Pfeil über leerem
            Hintergrund.
          </p>
        </div>
      </Section>

      {/* ── 15 · AddSheet ────────────────────────────────────────── */}
      <Section number="15" label="AddSheet">
        <p class="mb-4 text-body text-text-muted">
          Two-piece-Layout für Such-und-Hinzufügen: Card (page-tier
          <code class="font-mono text-mini"> bg</code>, hairlines, hard
          corners) oben und Search-Pill (nav-tier{" "}
          <code class="font-mono text-mini">bg-nav-bg</code>, capsule) unten.
          Die Pill morpht 500 ms aus dem{" "}
          <code class="font-mono text-mini">[data-add-anchor]</code>-Rect der
          BottomNav heraus zur Target-Position; die Card fadet pure-opacity
          dazu, ohne räumliche Bewegung — die Pill trägt die Animation
          allein.
        </p>
        <AddSheetMock />
        <p class="mt-4 text-body text-text-muted">
          Sequential handoff statt Crossfade (siehe Memory{" "}
          <code class="font-mono text-mini">sequential-handoff-animation</code>):
          Beim Öffnen rises die Search-Pill ZUERST (50 ms) während die
          BottomNav noch opak ist; beim Schließen umgekehrt. Combined
          alpha bleibt 1.0, kein flicker.
        </p>
      </Section>

      {/* ── 16 · Segmented ───────────────────────────────────────── */}
      <Section number="16" label="Segmented">
        <p class="mb-4 text-body text-text-muted">
          Liquid 2/3-Wege-Switch mit derselben Stretch-and-Contract-Bubble wie
          der BottomNav-Indicator. Die aktive Option trägt{" "}
          <code class="font-mono text-mini">data-active="true"</code>; eine
          absolute-positionierte <code class="font-mono text-mini">span</code>{" "}
          mit <code class="font-mono text-mini">bg-text</code> misst dessen
          offsetLeft + offsetWidth und morpht in zwei Phasen: erst Kapsel über
          OLD + NEW (Phase 1 Stretch), dann Contract zur Destination nach
          100 ms (Phase 2). 200 ms ease-out auf{" "}
          <code class="font-mono text-mini">transition-all</code>. Bei
          3-Wege-Switches mit übersprungener Mitte stretcht die Kapsel über
          alle drei Slots und kontraktiert dann zum Ziel — der Skip ist
          dadurch ein Flow, kein Sprung.
        </p>
        <div class="space-y-6">
          <div>
            <p class={dtClass}>2-Wege</p>
            <div class="mt-3">
              <Segmented<"track" | "archive">
                ariaLabel="Demo zwei Optionen"
                value={segDemo()}
                onChange={setSegDemo}
                options={[
                  { value: "track", label: "Tracken" },
                  { value: "archive", label: "Archiv" },
                ]}
              />
            </div>
          </div>
          <div>
            <p class={dtClass}>3-Wege</p>
            <p class="mt-3 text-body text-text-muted">
              Live-Demo: Sektion 01 → Modus. Wechsel von „Hell" zu „System"
              zeigt den Skip-Stretch (Kapsel über alle drei Slots).
            </p>
          </div>
          <div>
            <p class={dtClass}>Disabled</p>
            <div class="mt-3">
              <Segmented<"a" | "b">
                ariaLabel="Disabled Demo"
                value="a"
                onChange={() => {}}
                disabled
                options={[
                  { value: "a", label: "Eins" },
                  { value: "b", label: "Zwei" },
                ]}
              />
            </div>
            <p class="mt-2 text-mini text-text-muted">
              Beide Optionen <code class="font-mono text-mini">cursor-not-allowed</code>{" "}
              + 50 % Opacity. Verwendet während verbundener Mutationen pending
              sind (siehe <code class="font-mono text-mini">ListTrackingToggle</code>).
            </p>
          </div>
        </div>
      </Section>

      {/* ── 17 · Row Actions ─────────────────────────────────────── */}
      <Section number="17" label="Row Actions">
        <p class="mb-4 text-body text-text-muted">
          Hover-revealed Cluster am rechten Rand jeder Listen-Row. Default
          {" "}<code class="font-mono text-mini">opacity-0 pointer-events-none</code>;
          fadet via <code class="font-mono text-mini">group-hover</code> /
          {" "}<code class="font-mono text-mini">focus-within</code> der
          Parent-Row in 200 ms ease-quart auf. Aktive Pins bleiben permanent
          sichtbar — sie kommunizieren State, nicht nur Aktion.
        </p>
        <RowActionsMock pinned={pinDemo()} onTogglePin={() => setPinDemo((p) => !p)} />
        <p class="mt-4 text-body text-text-muted">
          <code class="font-mono text-mini">RowActions</code> ist ein
          einheitliches Primitive — der Pin sitzt im selben Flex-Cluster
          wie Reset / Verschieben / Entfernen, sodass alles als eine
          visuelle Einheit auf-/abfadet. Der „destructive bundle" (Reset,
          Move, Remove) ist opt-in:
        </p>
        <ul class="mt-2 ml-5 list-disc space-y-1 text-body text-text-muted">
          <li>
            <code class="font-mono text-mini">/lists/:shortCode</code>-Rows
            → bundle gesetzt, voller Cluster. Reset + Entfernen bestätigen
            über den <code class="font-mono text-mini">ConfirmDialog</code>
            (app-weiter Modal, gleiche Sprache wie DeleteListButton).
          </li>
          <li>
            <code class="font-mono text-mini">/lists</code>-Rows → bundle
            weggelassen, nur der Pin rendert.
          </li>
        </ul>
        <p class="mt-3 text-body text-text-muted">
          Pin-Verhalten im Cluster:
        </p>
        <ul class="mt-2 ml-5 list-disc space-y-1 text-body text-text-muted">
          <li>
            Ist die Row gepinnt (State), bleibt der Pin permanent sichtbar
            — der Rest des Clusters bleibt hover-revealed.
          </li>
          <li>
            Solange der Confirm-Dialog einer Row offen ist, fadet ihr Pin
            (+ Drag-Handle) raus — der Modal besitzt die Aufmerksamkeit.
          </li>
        </ul>
        <p class="mt-3 text-mini text-text-muted">
          HTML-Gotcha: RowActions + DragHandle sitzen als Siblings NEBEN dem
          <code class="font-mono text-mini">&lt;A&gt;</code>-Link, nicht
          darin — Buttons in Anchors sind invalides Markup + verhalten sich
          unzuverlässig beim Click-Handling. Confirm-State lebt im Parent
          (der Row), nicht im Cluster — sodass PinButton + DragHandle aus
          derselben Quelle lesen und im selben Sync-Flush updaten.
        </p>
      </Section>

      {/* ── 18 · Anti-Patterns ───────────────────────────────────── */}
      <Section number="18" label="Anti-Patterns · Verbote">
        <p class="mb-6 text-body text-text-muted">
          Was deliberately NICHT gebaut wird. Wenn du dich versucht fühlst —
          hier kurz nachschauen.
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <AntiCard
            bad="24 px Pill-Buttons"
            good="rounded-sm (4 px) Ecken"
            why="Die TE/Material-Ästhetik verlangt harte Ecken. Pillen rufen 'Slack 2018' auf."
          />
          <AntiCard
            bad="Box-Shadows für Karten"
            good="Borders & Grain"
            why="Tiefe entsteht über Linien + Textur, nicht Schatten. Schatten flatten die japanische Minimal-Optik aus."
          />
          <AntiCard
            bad="Uniformes Card-Grid"
            good="Bento-Asymmetrie"
            why="Gleichgroße Karten in 3-Spalten = generisches AI-Layout. Die 2/3 · 1/3-Bento liest als Instrument."
          />
          <AntiCard
            bad="Cards-in-Cards-in-Cards"
            good="Hairlines (border-border)"
            why="Subnesting frisst Lesbarkeit. Eine 1 px-Linie trennt genauso klar, kostet keinen Raum."
          />
          <AntiCard
            bad="Inline-Confirm (✓/✗)"
            good="ConfirmDialog (Modal)"
            why="Inline-Confirms quetschen sich in enge Slots (Header-Aside neben langem Titel, Row-Rand). Delete/Leave/Reset/Entfernen/Übergeben laufen alle über den einen ConfirmDialog — eine Geste, klar lesbar."
          />
          <AntiCard
            bad="Native &lt;select&gt;"
            good="SelectMenu-Komponente"
            why="Native Selects ignorieren das Theme. Selbst gebauter Picker erbt Tokens, Fokus-Styles, Animation."
          />
          <AntiCard
            bad="title=-Attribut für Hints"
            good="Tooltip-Komponente"
            why="Native title ist langsam, untouchbar, untraversal. Tooltip kennt Viewport-Clamping, Hover & Focus."
          />
          <AntiCard
            bad="Disabled ohne Erklärung"
            good="Tooltip mit Grund"
            why="Disabled-State braucht einen Tooltip, der den Grund erklärt (außer der Grund ist visuell offensichtlich)."
          />
        </div>
      </Section>

      {/* ── 17 · List Covers (generiert) ─────────────────────────── */}
      <Section number="17" label="List Covers (generiert)">
        <p class="mb-4 text-body text-text-muted">
          Default-Cover für Listen ohne eigenes Bild: Inline-SVG aus einem{" "}
          <code class="font-mono text-mini">cover_seed</code> → deterministisch
          zufälliges Theme + japanisch-geometrisches Muster (Seigaiha-Wellen /
          Shippō-Kreise). Kein Storage, immer scharf, folgt Light/Dark
          automatisch — toggle den Mode oben in Sektion 01 und sieh zu, wie alle
          Cover umfärben.
        </p>
        <div class="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
          <For each={Array.from({ length: 24 }, (_, i) => i)}>
            {(seed) => {
              const spec = coverSpecFromSeed(seed);
              return (
                <div>
                  <GeneratedCover
                    seed={seed}
                    class="aspect-square w-full overflow-hidden"
                  />
                  <p class="mt-1 truncate font-mono text-mini text-text-muted">
                    {spec.themeId} · {spec.pattern}
                  </p>
                </div>
              );
            }}
          </For>
        </div>
      </Section>
      </div>
      <StandaloneFooter />
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Local primitives (only used on this page).
// ──────────────────────────────────────────────────────────────────────

const dtClass = "font-mono text-mini uppercase tracking-wider text-text-muted";

function Section(props: { number: string; label: string; children: any }) {
  return (
    <section class="border-t border-rule py-8">
      <header class="mb-6 flex items-baseline justify-between">
        <h2 class="font-mono text-label uppercase tracking-wider text-text-muted">
          {props.label}
        </h2>
        <span class="font-mono text-mini text-text-muted">{props.number}</span>
      </header>
      {props.children}
    </section>
  );
}

function Swatch(props: { token: string }) {
  return (
    <div class="rounded-sm border border-border p-3">
      <div
        class="aspect-[4/1] w-full rounded-xs border border-border"
        style={{ background: `var(--${props.token})` }}
      />
      <div class="mt-2 flex items-baseline justify-between gap-2">
        <code class="font-mono text-mini font-medium text-text">
          --{props.token}
        </code>
        <code class="font-mono text-mini text-text-muted">
          bg-{props.token}
        </code>
      </div>
    </div>
  );
}

function TypeRow(props: {
  scale: string;
  weight: string;
  sample: string;
  mono?: boolean;
  uppercase?: boolean;
}) {
  return (
    <div class="flex items-baseline justify-between gap-6 border-b border-border pb-4 last:border-b-0">
      <p
        class={`${props.scale} ${props.weight} ${props.mono ? "font-mono" : ""} ${props.uppercase ? "uppercase tracking-wider" : ""} text-text`}
      >
        {props.sample}
      </p>
      <code class="shrink-0 font-mono text-mini text-text-muted">
        {props.scale}
      </code>
    </div>
  );
}

function Row(props: { label: string; children: any }) {
  return (
    <div>
      <p class={dtClass}>{props.label}</p>
      <div class="mt-3 flex flex-wrap items-center gap-3">{props.children}</div>
    </div>
  );
}

function AntiCard(props: { bad: string; good: string; why: string }) {
  return (
    <div class="rounded-sm border border-border p-4">
      <div class="flex items-start gap-2">
        <CircleX class="size-4 shrink-0 text-accent" strokeWidth={1.75} />
        <p class="text-body font-medium text-text">{props.bad}</p>
      </div>
      <div class="mt-2 flex items-start gap-2">
        <CircleCheck
          class="size-4 shrink-0 text-text-muted"
          strokeWidth={1.75}
        />
        <p class="text-body text-text-muted">{props.good}</p>
      </div>
      <p class="mt-3 border-t border-border pt-3 text-mini text-text-muted">
        {props.why}
      </p>
    </div>
  );
}

/**
 * Static mockup of the live BottomNav — same tokens, same layout, but
 * inline (not fixed) and non-interactive. Renders Lists as the "active"
 * tab so the sliding accent bubble has somewhere to sit.
 */
function BottomNavMock() {
  return (
    <div class="flex justify-center rounded-sm border border-border bg-bg p-6">
      <div class="relative flex items-center gap-1 rounded-full bg-nav-bg p-1.5 shadow-floating">
        {/* Static bubble — sits behind the active tab. In the real component
            this slides between tabs in two phases. */}
        <span
          aria-hidden
          class="pointer-events-none absolute size-11 rounded-full bg-accent"
          style={{ left: "calc(6px + 44px + 4px)", top: "6px" }}
        />
        <NavMockButton icon={House} />
        <NavMockButton icon={List} active />
        <button
          type="button"
          aria-label="Hinzufügen"
          class="relative z-10 inline-flex size-11 items-center justify-center rounded-full text-nav-fg/70"
        >
          <Plus class="size-5" strokeWidth={1.75} />
        </button>
        <NavMockButton icon={Calendar} />
        <NavMockButton icon={User} />
      </div>
    </div>
  );
}

function NavMockButton(props: {
  icon: (p: { class?: string; strokeWidth?: number }) => unknown;
  active?: boolean;
}) {
  return (
    <span
      class={`relative z-10 inline-flex size-11 items-center justify-center rounded-full ${
        props.active ? "text-nav-bg" : "text-nav-fg/70"
      }`}
    >
      {/* @ts-expect-error — lucide-solid icon constructor */}
      <props.icon class="size-5" strokeWidth={1.75} />
    </span>
  );
}

/**
 * BottomNav variant: pill + back-satellite on the left. Same static
 * presentation as BottomNavMock, but with the back-button hanging off
 * left-edge and the accent bubble parked on it (mirrors what's rendered
 * on /lists/:shortCode + /item/:type/:slug detail routes).
 */
function BottomNavBackMock() {
  return (
    <div class="flex justify-center rounded-sm border border-border bg-bg p-6">
      <div class="relative flex items-center gap-1 rounded-full bg-nav-bg p-1.5 shadow-floating">
        {/* Satellite — outside the pill, attached via absolute right-full. */}
        <span
          aria-hidden
          class="pointer-events-none absolute right-full top-1/2 -mt-6 mr-3 inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-on shadow-floating"
        >
          <ArrowLeft class="size-5" strokeWidth={1.75} />
        </span>
        <NavMockButton icon={House} />
        <NavMockButton icon={List} />
        <button
          type="button"
          aria-label="Hinzufügen"
          class="relative z-10 inline-flex size-11 items-center justify-center rounded-full text-nav-fg/70"
        >
          <Plus class="size-5" strokeWidth={1.75} />
        </button>
        <NavMockButton icon={Calendar} />
        <NavMockButton icon={User} />
      </div>
    </div>
  );
}

/**
 * Row Actions mock. The destructive icons are a static stand-in (real
 * RowActions needs mutation context + valid item IDs); PinButton is
 * mounted live so the hover-reveal + sticky-when-pinned behaviour is
 * demonstrable. Both sit in the SAME flex cluster (gap-1) to match the
 * live RowActions layout — destructive icons + pin read as one group.
 * `group` on the outer row drives the opacity transitions inside.
 */
function RowActionsMock(props: {
  pinned: boolean;
  onTogglePin: () => void;
}) {
  return (
    <div class="-mx-5 border-y border-rule">
      <div class="group flex items-center gap-2 px-5 py-3 transition-colors hover:bg-surface">
        <div class="min-w-0 flex-1">
          <h4 class="truncate text-body-lg font-medium text-text">
            Beispiel-Eintrag
          </h4>
          <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
            Anime
          </p>
        </div>
        {/* RowActions stand-in — destructive icons static, pin live. */}
        <div class="flex shrink-0 items-center gap-1">
          <PinButton
            pinned={props.pinned}
            noun="Eintrag"
            onToggle={props.onTogglePin}
          />
          <div class="pointer-events-none flex items-center gap-1 opacity-0 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] group-hover:opacity-100 focus-within:opacity-100">
            <span class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted">
              <RotateCcw class="size-4" strokeWidth={1.75} aria-hidden />
            </span>
            <span class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted">
              <ArrowRightLeft class="size-4" strokeWidth={1.75} aria-hidden />
            </span>
            <span class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted">
              <X class="size-4" strokeWidth={1.75} aria-hidden />
            </span>
          </div>
        </div>
        <DragHandle activators={{}} noun="Beispiel-Eintrag" class="ml-2" />
      </div>
    </div>
  );
}

/**
 * Static mockup of the AddSheet. Shows the Card on top, Search-Pill below;
 * skipped the morph-from-origin animation (would need real BottomNav
 * coordinates and a full DOM overlay). Result-rows are dummy entries.
 */
function AddSheetMock() {
  return (
    <div class="rounded-sm border border-border bg-bg p-5">
      {/* Card */}
      <div class="overflow-hidden rounded-sm border border-rule bg-bg">
        <header class="flex items-center justify-between gap-3 border-b border-rule px-5 py-4">
          <div class="flex items-center gap-3">
            <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
            <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
              Hinzufügen zu
            </span>
            <span class="font-mono text-mini font-medium uppercase tracking-wider text-text">
              Lieblings-Anime
            </span>
          </div>
          <span class="inline-flex size-7 items-center justify-center rounded-xs text-text-muted">
            <X class="size-4" strokeWidth={1.75} />
          </span>
        </header>
        <ul>
          <ResultRowMock title="Frieren · Beyond Journey's End" type="Anime · 2023" added />
          <ResultRowMock title="Vinland Saga" type="Anime · 2019" />
          <ResultRowMock title="Chainsaw Man" type="Manga · 2018" last />
        </ul>
      </div>
      {/* Pill */}
      <div class="mt-3 flex items-center gap-2 rounded-full bg-nav-bg px-5 py-2.5">
        <Search aria-hidden class="size-4 shrink-0 text-nav-fg/60" strokeWidth={1.75} />
        <span class="text-body text-nav-fg/50">Anime oder Manga suchen …</span>
      </div>
    </div>
  );
}

function ResultRowMock(props: {
  title: string;
  type: string;
  added?: boolean;
  last?: boolean;
}) {
  return (
    <li
      class={`relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border ${
        props.last ? "after:hidden" : ""
      }`}
    >
      <div class="flex items-center gap-3 px-5 py-3">
        <div class="flex size-12 shrink-0 items-center justify-center rounded-xs border border-border bg-surface font-mono text-mini text-text-muted">
          A
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="truncate text-body text-text">{props.title}</h4>
          <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
            {props.type}
          </p>
        </div>
        <span
          aria-hidden
          class={`relative inline-flex size-8 shrink-0 items-center justify-center rounded-xs border ${
            props.added
              ? "border-accent bg-accent text-accent-on"
              : "border-border text-text-muted"
          }`}
        >
          {props.added ? (
            <Check class="size-4" strokeWidth={2} />
          ) : (
            <Plus class="size-4" strokeWidth={1.75} />
          )}
        </span>
      </div>
    </li>
  );
}

const miniCodes: [string, string][] = [
  ["AN", "Anime"],
  ["TV", "Serie"],
  ["FM", "Film"],
  ["GM", "Spiel"],
  ["MG", "Manga"],
  ["MS", "Musik"],
];
