import { Show, createSignal, createUniqueId } from "solid-js";
import type { ParentProps } from "solid-js";
import { ChevronDown } from "lucide-solid";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/media";

/**
 * A single Bento cell — the structural unit for every (non-header) page
 * section. No fill: transparent so the page bg + grain show through;
 * structure comes entirely from 1px grid lines (the border passed via class
 * from the page layout) running full-bleed to the viewport edge.
 *
 * Header is a mono uppercase instrument-label on the left + a tabular-nums
 * section number on the right. Numbers are decimal-padded strings ("01",
 * "02", "03", "04") — the section count never gets so big that this breaks.
 *
 * `collapsibleBelowMd` (opt-in) turns the header into a disclosure BUTTON
 * below `md`: a chevron sits right next to the label (the number stays alone
 * on the right, so the instrument read is untouched) and the body collapses
 * via the grid-rows 0fr↔1fr idiom (ReleaseNotesDialog). From `md` up the
 * section is forced open and renders the plain header — no phantom button in
 * the desktop DOM. `collapsible` folds at EVERY width instead (the /lists
 * category shelves — the one sanctioned desktop fold; everything else stays
 * mobile-only by design).
 *
 * Fold-state lifetime: per mount by default (secondary sections like Details/
 * Notizen re-collapse on every visit — that's their point). `persistKey`
 * (opt-in) remembers the user's choice in localStorage instead — for CONTENT
 * sections (Home's three, the /lists category shelves) where re-folding the
 * same rarely-used sections every visit would be busywork.
 */
export function BentoModule(
  props: ParentProps<{
    label: string;
    number: string;
    class?: string;
    collapsibleBelowMd?: boolean;
    /** Foldable at every width (not just below md). */
    collapsible?: boolean;
    defaultOpen?: boolean;
    /** Persist the fold state as `nakama:fold:<persistKey>`. */
    persistKey?: string;
  }>,
) {
  // The props are static at every call site — branch once (components run
  // once in Solid); the plain path stays byte-identical to before.
  if (!props.collapsibleBelowMd && !props.collapsible) {
    return (
      <section class={cn("p-5", props.class)}>
        <header class="mb-4 flex items-baseline justify-between">
          <SectionLabel label={props.label} />
          <SectionNumber number={props.number} />
        </header>
        {props.children}
      </section>
    );
  }

  const mdUp = useMediaQuery("(min-width: 768px)");
  const storageKey = props.persistKey
    ? `nakama:fold:${props.persistKey}`
    : null;
  const stored = storageKey ? localStorage.getItem(storageKey) : null;
  const [open, setOpen] = createSignal(
    stored !== null ? stored === "1" : (props.defaultOpen ?? true),
  );
  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (storageKey) localStorage.setItem(storageKey, next ? "1" : "0");
  };
  // collapsible folds everywhere; collapsibleBelowMd only below md (forced
  // open + plain header from md up).
  const foldableNow = () => props.collapsible || !mdUp();
  const expanded = () => !foldableNow() || open();
  const bodyId = createUniqueId();

  return (
    <section class={cn("p-5", props.class)}>
      {/* Spacing between header and body lives on the body inner (pt-4), not
          as header mb-4 — a collapsed section then reads as a compact label
          strip without dead margin above the section padding. */}
      <Show
        when={foldableNow()}
        fallback={
          <header class="flex items-baseline justify-between">
            <SectionLabel label={props.label} />
            <SectionNumber number={props.number} />
          </header>
        }
      >
        <button
          type="button"
          aria-expanded={open()}
          aria-controls={bodyId}
          onClick={toggle}
          class="-m-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 p-2 text-left"
        >
          <span class="flex min-w-0 items-baseline gap-2">
            <SectionLabel label={props.label} />
            <ChevronDown
              class="size-4 shrink-0 self-center text-text-muted transition-transform duration-300 [transition-timing-function:var(--ease-quart)]"
              classList={{ "rotate-180": open() }}
              strokeWidth={1.75}
              aria-hidden
            />
          </span>
          <SectionNumber number={props.number} />
        </button>
      </Show>
      <div
        id={bodyId}
        aria-hidden={!expanded()}
        class="grid transition-[grid-template-rows] duration-300 [transition-timing-function:var(--ease-quart)]"
        style={{ "grid-template-rows": expanded() ? "1fr" : "0fr" }}
      >
        {/* -mx-5/px-5 mirror the section's p-5: overflow-hidden is needed
            for the vertical 0fr collapse, but content full-bleeds via -mx-5
            (list rows, logbook feed) — widening the clip box to the section
            edge lets that bleed through instead of shearing it off. */}
        <div class="-mx-5 min-h-0 overflow-hidden px-5">
          <div class="pt-4">{props.children}</div>
        </div>
      </div>
    </section>
  );
}

function SectionLabel(props: { label: string }) {
  return (
    <h2 class="font-mono text-label uppercase tracking-[0.18em] text-text-muted">
      {props.label}
    </h2>
  );
}

function SectionNumber(props: { number: string }) {
  return (
    <span class="font-mono text-label font-medium tabular-nums tracking-tight text-text">
      {props.number}
    </span>
  );
}
