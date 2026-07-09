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
 * the desktop DOM. State resets per mount (no storage).
 */
export function BentoModule(
  props: ParentProps<{
    label: string;
    number: string;
    class?: string;
    collapsibleBelowMd?: boolean;
    defaultOpen?: boolean;
  }>,
) {
  // The prop is static at every call site — branch once (components run
  // once in Solid); the plain path stays byte-identical to before.
  if (!props.collapsibleBelowMd) {
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
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);
  const expanded = () => mdUp() || open();
  const bodyId = createUniqueId();

  return (
    <section class={cn("p-5", props.class)}>
      {/* Spacing between header and body lives on the body inner (pt-4), not
          as header mb-4 — a collapsed section then reads as a compact label
          strip without dead margin above the section padding. */}
      <Show
        when={!mdUp()}
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
          onClick={() => setOpen((o) => !o)}
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
        <div class="min-h-0 overflow-hidden">
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
