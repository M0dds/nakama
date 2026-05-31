/**
 * The two vertical hairlines that frame the capped content area, left + right,
 * bleeding the full viewport height (like the ColumnGuide). They sit exactly at
 * the content frame's edges — the same `max(0, (100vw − --content-max) / 2)`
 * gutter the centered AppShell frame produces.
 *
 * On a viewport NARROWER than --content-max the gutter is 0, so both lines sit
 * flush at the viewport edges (effectively invisible) — the page reads
 * edge-to-edge as before. On a WIDER viewport the lines pull in to the gutter,
 * turning the side margin into a deliberate frame: content reads as bounded
 * (its hover fills, rows and the ColumnGuide all stop at an intentional edge)
 * rather than floating with lopsided padding.
 *
 * `position: fixed` (not borders on a container) so the rules span top-to-
 * bottom regardless of content height — the instrument-panel read. `z-index:
 * -5` parks them behind opaque content, matching the ColumnGuide. Rendered once
 * in AppShell so every route is framed identically.
 */
export function ContentFrame() {
  const gutter = "max(0px, calc((100vw - var(--content-max)) / 2))";
  return (
    <>
      <div
        aria-hidden
        class="pointer-events-none fixed inset-y-0 w-px bg-rule"
        style={{ left: gutter, "z-index": -5 }}
      />
      <div
        aria-hidden
        class="pointer-events-none fixed inset-y-0 w-px bg-rule"
        style={{ right: gutter, "z-index": -5 }}
      />
    </>
  );
}
