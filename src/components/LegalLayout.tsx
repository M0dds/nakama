import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { ArrowLeft } from "lucide-solid";
import { goBack } from "@/lib/navigation";

/**
 * Shared chrome for the legal pages (/privacy, /imprint). Standalone like
 * /features — no AppShell/BottomNav, its own frosted top bar (mirrors the
 * in-app HeadBar), a readable max-w-3xl prose column, and a footer that
 * cross-links the legal surfaces. Reachable both in-app (Profile "Über") and
 * publicly (Login/Features footer), so the back affordance uses the
 * context-aware goBack (history.back when there's in-app history, else "/").
 */
export function LegalLayout(props: {
  kicker: string;
  title: string;
  updated?: string;
  children: JSX.Element;
}) {
  const navigate = useNavigate();
  return (
    <main class="mx-auto max-w-3xl">
      <header class="sticky top-0 z-20 flex items-center justify-between bg-bg/55 px-5 py-4 backdrop-blur-md">
        <A href="/" class="flex items-center gap-2">
          <span aria-hidden class="size-2 shrink-0 rounded-full bg-accent" />
          <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
            Nakama
          </span>
        </A>
        <button
          type="button"
          onClick={() => goBack(navigate, "/")}
          class="inline-flex items-center gap-1.5 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft class="size-3.5" strokeWidth={1.75} aria-hidden />
          Zurück
        </button>
      </header>

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

      <footer class="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule px-5 py-6 font-mono text-mini uppercase tracking-wider text-text-muted">
        <A href="/features" class="transition-colors hover:text-text">
          Features
        </A>
        <A href="/login" class="transition-colors hover:text-text">
          Anmelden
        </A>
      </footer>
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
