import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { ChevronLeft } from "lucide-solid";
import { goBack as runBack } from "@/lib/navigation";

/**
 * Full-bleed instrument header shared across the app surface. Same component
 * on Home, Listen, Detailseiten — everywhere. Layout:
 *
 *   ● KICKER                                             [aside slot]
 *   ←  Title
 *   ─────────────────────────────── (rule baseline)
 *
 * The accent dot (Hanko mark) precedes every kicker — tab pages and detail
 * pages alike — so the kicker row reads as the same instrument app-wide.
 *
 * `kicker` defaults to the brand name "Nakama"; detail pages override with a
 * breadcrumb string ("LISTEN", a list name, an item type) so the user always
 * sees where they came from.
 *
 * `backHref` enables a chevron-back button to the LEFT of the title. Clicking
 * navigates back via History (router.back) when there's a referrer in the
 * router history, else routes to the fallback href. The chevron is sized to
 * the heading's line-height so it doesn't push the kicker row.
 *
 * Header is full-bleed by design; page content sits in its own reading-width
 * wrapper below it. The bottom rule is a 100vw breakout line (not a border-b)
 * so it still spans BOTH viewport edges when the content frame is capped on
 * ultrawide screens — the header sits centered in that frame, so a centered
 * 100vw line reaches the edges. Mirrors the ColumnGuide's full-bleed intent.
 */
export function PageHeader(props: {
  kicker?: JSX.Element;
  title: JSX.Element;
  aside?: JSX.Element;
  backHref?: string;
}) {
  const navigate = useNavigate();
  // Context-aware back (in-app origin via history, deep-link via fallback href).
  // See src/lib/navigation.ts.
  const goBack = () => runBack(navigate, props.backHref);

  return (
    // Sticky so the instrument header (kicker + title + aside) stays pinned
    // while the surface scrolls. The `.glass` frosted material (src/index.css)
    // lives on a FULL-BLEED backing layer (below) so the pane spans the whole
    // viewport width while the header CONTENT stays aligned to the capped
    // content frame — content scrolling behind it reads through instead of
    // being hard-occluded. This is the reference glass surface the rest of the
    // redesign extends from. z-index sits above page content but below the
    // AddSheet (z-40) / Toaster (z-30) overlays. `position: sticky` (+ z-20)
    // also makes this a stacking context + the positioning context for the
    // absolute full-bleed backing + bottom rule. Works because no scroll-
    // container ancestor exists — body's `overflow-x: clip` doesn't establish
    // one, so sticky resolves against the viewport.
    // pt folds in --safe-top (edge-to-edge PWA): the glass backing spans the
    // header's full box, so it extends up UNDER the iOS status bar and the
    // kicker/title start below it. Elsewhere the var is 0px → plain pt-6.
    <header class="sticky top-0 z-20 flex items-end justify-between px-5 pb-3 pt-[calc(1.5rem+var(--safe-top))]">
      {/* Full-bleed frosted backing. The header itself is capped to the content
          frame (it lives inside AppShell's --content-max wrapper), so without
          this the glass ended at the content edge — and now that a full-bleed
          cover wash sits behind the header, that darker glass band showed hard
          left/right seams. Breaking the backing out to w-screen makes the glass
          run edge-to-edge; the content keeps its frame alignment. -z-10 is
          scoped to this header's own (z-20) stacking context → behind the header
          content but still above the page, so its backdrop-filter refracts the
          wash + content scrolling underneath. Mirrors the bottom rule's breakout. */}
      <div
        aria-hidden
        class="glass pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2"
      />
      {/* Frame hairlines continued THROUGH the header band. The full-bleed glass
          backing would otherwise occlude the ContentFrame's vertical rules
          (z=-5) where they pass behind the header (z-20). These mirror
          ContentFrame exactly — a gutter-wide clip box hung off each content
          edge (right-full / left-full) with the rule on its inner edge — so each
          line shows ONLY when a gutter is open (viewport > --content-max) and
          lands precisely on the content-frame boundary, painted on top of the
          glass. Result: the frame reads continuously top-to-bottom. */}
      <div
        aria-hidden
        class="pointer-events-none absolute inset-y-0 right-full overflow-hidden"
        style={{ width: "max(0px, calc((100vw - var(--content-max)) / 2))" }}
      >
        <span class="absolute inset-y-0 right-0 w-px bg-rule" />
      </div>
      <div
        aria-hidden
        class="pointer-events-none absolute inset-y-0 left-full overflow-hidden"
        style={{ width: "max(0px, calc((100vw - var(--content-max)) / 2))" }}
      >
        <span class="absolute inset-y-0 left-0 w-px bg-rule" />
      </div>
      {/* min-w-0 + shrink-0 on the aside: the title block yields to the
          action cluster and NEVER wraps the header taller — long titles
          ellipsize instead (the truncation itself lives in the title
          content: ItemDetail's span / EditableListName, since an
          overflow-hidden h1 would clip EditableListName's focus ring). */}
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span
            aria-hidden
            class="size-2 shrink-0 rounded-full bg-accent"
          />
          {typeof props.kicker === "string" || props.kicker === undefined ? (
            <span class="font-mono text-mini uppercase tracking-[0.25em] text-text-muted">
              {props.kicker ?? "Nakama"}
            </span>
          ) : (
            props.kicker
          )}
        </div>
        <div class="mt-0.5 flex items-center gap-2">
          <Show when={props.backHref}>
            {(fallback) => (
              <BackButton onClick={goBack} fallbackHref={fallback()} />
            )}
          </Show>
          <h1 class="min-w-0 text-heading font-medium tracking-tight text-text">
            {props.title}
          </h1>
        </div>
      </div>
      {/* Aside slot: fixed at h-6 (24px — matches our icon-button height)
          and items-center. Every aside content sits centered in a 24px
          band; size-6 icon-buttons (the confirm/deny cluster) fill the
          band exactly, plain text is centered the same way. Result: the
          text baseline is identical between "Liste löschen" trigger and
          "Wirklich löschen? ✓ ✗" confirm — no shift, no jump. */}
      <div class="inline-flex h-6 shrink-0 items-center pl-3">{props.aside}</div>

      {/* Full-bleed bottom rule — escapes the capped content frame so it
          reaches both viewport edges (the header is centered in the frame, so
          a centered 100vw line spans edge-to-edge). body { overflow-x: clip }
          absorbs the scrollbar-width overshoot. */}
      <div
        aria-hidden
        class="pointer-events-none absolute bottom-0 left-1/2 h-px w-screen -translate-x-1/2 bg-rule"
      />
    </header>
  );
}

/** Small left-pointing chevron sized to the heading line-height — same height
 *  as the h1 so the row doesn't grow. */
function BackButton(props: { onClick: () => void; fallbackHref: string }) {
  return (
    <A
      href={props.fallbackHref}
      onClick={(e) => {
        e.preventDefault();
        props.onClick();
      }}
      aria-label="Zurück"
      class="-ml-1 inline-flex h-7 w-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-text"
    >
      <ChevronLeft class="size-4" strokeWidth={1.75} />
    </A>
  );
}
