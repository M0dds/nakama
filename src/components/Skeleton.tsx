/**
 * Loading placeholder block — surface-tinted, hard-cornered, gently pulsing.
 *
 * Shape-preserving by contract: size each block (via `class`) to match the
 * content it stands in for, so when the real data arrives it replaces the
 * skeleton WITHOUT a layout shift. That's the whole point over a "Lade …"
 * label — the frame stays put, only the fill swaps.
 *
 * The pulse is `motion-safe:` so prefers-reduced-motion gets a static block.
 */
export function Skeleton(props: { class?: string }) {
  return (
    <div
      aria-hidden
      class={`motion-safe:animate-pulse rounded-xs bg-surface ${props.class ?? ""}`}
    />
  );
}
