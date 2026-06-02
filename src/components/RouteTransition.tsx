import { createEffect, on, type ParentProps } from "solid-js";
import { useLocation } from "@solidjs/router";

/**
 * Route-change enter transition. The AppShell stays mounted across navigations
 * and only props.children swaps, so we replay a short animation on the content
 * container whenever the path changes — softening the otherwise hard cut. It's
 * deliberately a SINGLE container-level enter, not a per-element entrance
 * choreo (staggered choreo was built and rejected as "performed"/laggy — see
 * handshake §Motion-Philosophie; this is the reversal of that call, kept
 * subtle).
 *
 * Why `top` (position: relative) and NOT `transform: translateY`: a transform
 * creates a containing block for position:fixed descendants, and the page-level
 * ColumnGuide is fixed — a translate would trap + drift it for the animation's
 * duration (the same #4 portal-dialog gotcha). Animating `top` on a relatively-
 * positioned wrapper moves the in-flow content while the fixed guide stays
 * viewport-anchored (content visibly settles INTO the guide). opacity carries
 * the fade; `top` carries the bounce.
 *
 * `on(..., { defer: true })` (the default) skips the first run, so a hard page
 * load / deep link does NOT animate — only genuine in-app navigations do,
 * matching the navigation tracker's "initial load doesn't count" rule. Honors
 * prefers-reduced-motion (checked live).
 */
export function RouteTransition(props: ParentProps) {
  const location = useLocation();
  let el!: HTMLDivElement;

  const prefersReduce = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  createEffect(
    on(
      () => location.pathname,
      () => {
        if (prefersReduce() || !el) return;
        el.animate(
          [
            { opacity: 0, top: "10px" },
            { opacity: 1, top: "0px" },
          ],
          {
            duration: 420,
            // back-out: overshoots past the resting point then settles — the
            // bounce. Same spring family as the Was-kommt cards.
            easing: "cubic-bezier(0.34, 1.5, 0.5, 1)",
            fill: "backwards",
          },
        );
      },
    ),
  );

  return (
    <div ref={el} style={{ position: "relative", top: "0px" }}>
      {props.children}
    </div>
  );
}
