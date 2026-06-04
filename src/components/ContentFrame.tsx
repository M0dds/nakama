/**
 * The two vertical hairlines that frame the capped content area, left + right,
 * bleeding the full viewport height (like the ColumnGuide). They mark the edges
 * of the centered, --content-max-capped frame — and ONLY appear once that frame
 * margin actually opens.
 *
 * Each line lives on the INNER edge of a gutter-wide, full-height clip box
 * anchored to the viewport edge. The gutter is `max(0, (100vw − --content-max)
 * / 2)` — the same margin the centered AppShell frame produces:
 *
 *   - Viewport ≤ --content-max → gutter is 0 → the clip box collapses to 0
 *     width and `overflow: hidden` clips the hairline away entirely. No stray
 *     rule hugging the screen edge; the page reads edge-to-edge.
 *   - Viewport > --content-max → the box opens to the gutter width and the
 *     hairline lands exactly at the content frame's edge, turning the side
 *     margin into a deliberate frame (content, hover fills, ColumnGuide all stop
 *     at an intentional boundary instead of floating with lopsided padding).
 *
 * Driving visibility off the gutter (not a hardcoded media-query breakpoint)
 * keeps --content-max the single source of truth — change the token and the
 * frame follows.
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
        class="pointer-events-none fixed inset-y-0 left-0 overflow-hidden"
        style={{ width: gutter, "z-index": -5 }}
      >
        <span class="absolute inset-y-0 right-0 w-px bg-rule" />
      </div>
      <div
        aria-hidden
        class="pointer-events-none fixed inset-y-0 right-0 overflow-hidden"
        style={{ width: gutter, "z-index": -5 }}
      >
        <span class="absolute inset-y-0 left-0 w-px bg-rule" />
      </div>
    </>
  );
}
