/**
 * Full-viewport-height column divider at the 2/3 boundary of the page.
 * Used by every page that splits content into a 2/3 (left) + 1/3 (right)
 * Bento layout — Home, Listen, Listen-Detail, Item-Detail.
 *
 * Why `position: fixed inset-y-0` instead of a flex/grid border:
 * a border on the column container would only run as far as the shorter
 * column. We want the line to bleed all the way from the viewport top edge
 * to the bottom edge regardless of content — that's the "instrument panel"
 * read. Fixed positioning escapes content height entirely.
 *
 * `z-index: -5` parks it behind opaque content (cards, popovers) but above
 * the body background, so headers and modules paint over it where needed.
 * Hidden below the `md` breakpoint — on mobile the columns stack vertically,
 * so a vertical column guide is meaningless.
 */
export function ColumnGuide() {
  return (
    <div
      aria-hidden
      class="pointer-events-none fixed inset-y-0 hidden w-px bg-rule md:block"
      style={{ left: "66.6667%", "z-index": -5 }}
    />
  );
}
