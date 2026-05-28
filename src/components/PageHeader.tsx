import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { ChevronLeft } from "lucide-solid";

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
 * wrapper below it.
 */
export function PageHeader(props: {
  kicker?: JSX.Element;
  title: JSX.Element;
  aside?: JSX.Element;
  backHref?: string;
}) {
  const navigate = useNavigate();
  const goBack = () => {
    // History-aware back: if we got here via in-app navigation, the router
    // has a previous entry; otherwise we land at the fallback (e.g. /lists
    // from /lists/[id]). We can't reliably introspect router history yet, so
    // attempt window.history.back() and fall back to navigate() if no entry.
    if (window.history.length > 1) window.history.back();
    else if (props.backHref) navigate(props.backHref);
  };

  return (
    <header class="flex items-end justify-between border-b border-rule px-5 pb-3 pt-6">
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
      {props.aside}
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
