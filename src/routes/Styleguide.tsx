import { createSignal, onMount, For } from "solid-js";
import { A } from "@solidjs/router";
import {
  THEMES,
  type ThemeId,
  type ThemeModePref,
  applyTheme,
  readTheme,
  readModePref,
} from "@/lib/themes";

/**
 * Phase-0 Styleguide. Three sections to start: Themes, Typography, Tokens.
 * Each section grows organically as we build primitives in Phase 1+.
 * The page lives behind /styleguide and is the source of truth for design
 * decisions — every new primitive lands here first with all variants, then
 * gets used in features.
 */
export default function Styleguide() {
  const [theme, setTheme] = createSignal<ThemeId>("default");
  const [mode, setMode] = createSignal<ThemeModePref>("system");

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
    <main class="mx-auto max-w-5xl px-5 py-12">
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
        <A
          href="/"
          class="mt-6 inline-block font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          ← Zurück
        </A>
      </header>

      {/* ── Section: Themes ─────────────────────────────────────────── */}
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
                    class="flex items-center gap-2 rounded-sm border border-border px-2 py-2 text-left text-body transition-colors hover:bg-surface aria-pressed:border-accent"
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
            <div class="mt-3 inline-flex rounded-sm border border-border p-0.5">
              <For each={["light", "dark", "system"] as ThemeModePref[]}>
                {(m) => (
                  <button
                    type="button"
                    onClick={() => pickMode(m)}
                    aria-pressed={mode() === m}
                    class="rounded-xs px-3 py-1.5 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors aria-pressed:bg-text aria-pressed:text-bg"
                  >
                    {m === "light" ? "Hell" : m === "dark" ? "Dunkel" : "System"}
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Section: Color tokens ───────────────────────────────────── */}
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
          <Swatch token="accent-secondary" />
        </div>
      </Section>

      {/* ── Section: Typography ────────────────────────────────────── */}
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

      {/* ── Section: Mini-Codes ─────────────────────────────────────── */}
      <Section number="04" label="Mini-Codes">
        <p class="mb-4 text-body text-text-muted">
          Kürzel für Medien-Typen. ALL CAPS, mono, immer 12px.
        </p>
        <div class="flex flex-wrap gap-2">
          <For each={miniCodes}>
            {([code, label]) => (
              <span class="inline-flex items-center gap-2 rounded-xs border border-border px-2 py-1">
                <span class="font-mono text-mini font-medium uppercase tracking-wider text-text">
                  {code}
                </span>
                <span class="text-mini text-text-muted">{label}</span>
              </span>
            )}
          </For>
        </div>
      </Section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Local primitives (only used on this page — promoted later when needed
// in features). Keeping them inline avoids inventing components prematurely.
// ──────────────────────────────────────────────────────────────────────

const dtClass = "font-mono text-mini uppercase tracking-wider text-text-muted";

function Section(props: { number: string; label: string; children: any }) {
  return (
    <section class="border-t border-rule py-8">
      <header class="mb-6 flex items-baseline justify-between">
        <h2 class="text-label font-mono uppercase tracking-wider text-text-muted">
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

const miniCodes: [string, string][] = [
  ["AN", "Anime"],
  ["TV", "Serie"],
  ["FM", "Film"],
  ["GM", "Spiel"],
  ["MG", "Manga"],
  ["MS", "Musik"],
];
