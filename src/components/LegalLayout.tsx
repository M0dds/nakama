import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { StandaloneHeader, StandaloneFooter } from "@/components/StandaloneShell";

/**
 * Layout for the legal pages (/privacy, /imprint). Standalone like /features —
 * no AppShell/BottomNav — and shares the same StandaloneHeader/Footer chrome as
 * Features + Styleguide so all three read as one site — same max-w-5xl
 * content width too.
 */
export function LegalLayout(props: {
  kicker: string;
  title: string;
  updated?: string;
  children: JSX.Element;
}) {
  return (
    <main class="mx-auto max-w-5xl">
      <StandaloneHeader />

      <article class="px-5 pb-16 pt-10">
        <p class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
          {props.kicker}
        </p>
        <h1 class="mt-4 text-heading-lg font-medium tracking-tight text-text">
          {props.title}
        </h1>
        <Show when={props.updated}>
          <p class="mt-2 font-mono text-mini tabular-nums text-text-muted">
            Stand: {props.updated}
          </p>
        </Show>
        <div class="mt-10 space-y-10">{props.children}</div>
      </article>

      <StandaloneFooter />
    </main>
  );
}

/** A titled prose block inside a legal page. */
export function LegalSection(props: { title: string; children: JSX.Element }) {
  return (
    <section class="space-y-3">
      <h2 class="text-body-lg font-medium tracking-tight text-text">
        {props.title}
      </h2>
      <div class="space-y-3 text-body leading-relaxed text-text-muted">
        {props.children}
      </div>
    </section>
  );
}

/**
 * A clearly-marked gap for the operator to fill in (name, address, email …).
 * Dashed accent border so it's unmistakable in the rendered page — the page
 * must NOT ship with any Placeholder still visible.
 */
export function Placeholder(props: { children: JSX.Element }) {
  return (
    <span class="mx-0.5 inline-block rounded-xs border border-dashed border-accent bg-accent/10 px-1.5 py-0.5 font-mono text-mini uppercase tracking-wider text-accent">
      {props.children}
    </span>
  );
}
