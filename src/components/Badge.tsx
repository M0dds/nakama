import type { ParentProps } from "solid-js";
import { cn } from "@/lib/cn";

/**
 * Inline badge for metadata. Three tones:
 *   default  — bordered mono mini-code (the AN / TV / FM / GM / MG type-codes)
 *   accent   — accent color text, no fill ("Neue Folge" highlight)
 *   muted    — just muted text, no border (sekundärer Stempel)
 *
 * Always rendered in mono, ALL CAPS, mini (12px) per the handshake. Don't add
 * a "large" badge — if you need something bigger, you're really wanting a
 * different component (probably a pill or a sub-heading).
 */
export type BadgeTone = "default" | "accent" | "muted";

const base =
  "inline-flex items-center font-mono text-mini font-medium uppercase tracking-wider";

const tones: Record<BadgeTone, string> = {
  default:
    "rounded-xs border border-border px-1.5 py-0.5 text-text",
  accent: "text-accent",
  muted: "text-text-muted",
};

export function Badge(props: ParentProps<{ tone?: BadgeTone; class?: string }>) {
  return (
    <span class={cn(base, tones[props.tone ?? "default"], props.class)}>
      {props.children}
    </span>
  );
}
