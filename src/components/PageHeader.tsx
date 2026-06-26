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
    // while the surface scrolls. The `.glass` material (src/index.css) makes it
    // a frosted pane: content scrolling behind the pinned header reads through
    // instead of being hard-occluded — the header floats over the surface. This
    // is the reference glass surface the rest of the redesign extends from.
    // z-index sits above page content but below the AddSheet (z-40) / Toaster
    // (z-30) overlays. `position: sticky` also serves as the positioning context
    // for the absolute full-bleed bottom rule (was `relative`). Works because no
    // scroll-container ancestor exists — body's `overflow-x: clip` doesn't
    // establish one, so sticky resolves against the viewport.
    <header class="glass sticky top-0 z-20 flex items-end justify-between px-5 pb-3 pt-6">
      <div>
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
          <h1 class="text-heading font-medium tracking-tight text-text">
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
      <div class="inline-flex h-6 items-center">{props.aside}</div>

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
