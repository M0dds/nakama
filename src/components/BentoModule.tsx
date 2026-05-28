import type { ParentProps } from "solid-js";
import { cn } from "@/lib/cn";

/**
 * A single Bento cell — the structural unit for every (non-header) page
 * section. No fill: transparent so the page bg + grain show through;
 * structure comes entirely from 1px grid lines (the border passed via class
 * from the page layout) running full-bleed to the viewport edge.
 *
 * Header is a mono uppercase instrument-label on the left + a tabular-nums
 * section number on the right. Numbers are decimal-padded strings ("01",
 * "02", "03", "04") — the section count never gets so big that this breaks.
 */
export function BentoModule(
  props: ParentProps<{ label: string; number: string; class?: string }>,
) {
  return (
    <section class={cn("p-5", props.class)}>
      <header class="mb-4 flex items-baseline justify-between">
        <h2 class="font-mono text-label uppercase tracking-[0.18em] text-text-muted">
          {props.label}
        </h2>
        <span class="font-mono text-label font-medium tabular-nums tracking-tight text-text">
          {props.number}
        </span>
      </header>
      {props.children}
    </section>
  );
}
