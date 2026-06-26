import { Show, createEffect, createSignal, untrack } from "solid-js";

/**
 * Ambient cover-art backdrop — the depth layer that gives the glass header and
 * the whole page something real to refract. A cover image is blown up, heavily
 * blurred and PINNED (position: fixed) across the entire viewport, then graded
 * into the page bg so text stays legible. Because it's fixed, content scrolls
 * OVER a static image — a parallax-like depth read across the full page, not a
 * band that scrolls away. Deliberately restrained — a hint of depth, not a
 * dominant field. Decorative (aria-hidden, no pointer events); renders nothing
 * when there's no cover — glass over a flat bg is pointless, which is the whole
 * reason this layer exists.
 *
 * `coverUrl` is reactive: when it changes (e.g. hovering a different card on
 * Home) the two-buffer crossfade fades the new cover in over the old, so the
 * atmosphere drifts rather than hard-cutting (the app's "liquid" motion read).
 * Under prefers-reduced-motion the global dampener collapses the transition.
 *
 * `position: fixed` establishes its OWN stacking context; with -z-10 that
 * context sits at root level BELOW the ContentFrame + ColumnGuide hairlines
 * (z=-5, also fixed) so those stay crisp, and below all content (z≥0); the
 * sticky .glass HeadBar (z=20) refracts it. This relies on the page's <main>
 * NOT being a stacking context — otherwise this fixed layer's context would
 * nest inside it and paint above the root-level frame lines.
 */
export function CoverBackdrop(props: { coverUrl: string | null }) {
  // Two ping-pong buffers. `top` names the buffer currently shown at full
  // opacity; on a cover change we write the new url into the OTHER buffer and
  // flip `top` to it — the incoming layer fades in (opacity→1) while the
  // outgoing fades out (opacity→0). Bounded to exactly two <img> elements, so
  // rapid hover changes just re-flip; in-flight opacity transitions interrupt
  // gracefully.
  const [slotA, setSlotA] = createSignal<string | null>(props.coverUrl ?? null);
  const [slotB, setSlotB] = createSignal<string | null>(null);
  const [top, setTop] = createSignal<"a" | "b">("a");

  createEffect(() => {
    const next = props.coverUrl ?? null;
    const cur = untrack(() => (untrack(top) === "a" ? slotA() : slotB()));
    if (next === cur) return;
    if (untrack(top) === "a") {
      setSlotB(next);
      setTop("b");
    } else {
      setSlotA(next);
      setTop("a");
    }
  });

  return (
    <Show when={slotA() || slotB()}>
      <div
        aria-hidden
        class="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        {/* Overall wash intensity lives on this wrapper; the two buffers
            crossfade 1↔0 within it. Kept gentle (and gentler in dark). */}
        <div class="absolute inset-0 opacity-45 dark:opacity-30">
          <CoverLayer url={slotA()} visible={top() === "a"} />
          <CoverLayer url={slotB()} visible={top() === "b"} />
        </div>
        {/* Grade into the page so content stays legible over the whole height:
            a faint atmosphere at the top of the viewport, settling to near-bg
            toward the bottom. Viewport-relative (the layer is fixed). */}
        <div class="absolute inset-0 bg-gradient-to-b from-bg/45 via-bg/80 to-bg/96" />
      </div>
    </Show>
  );
}

/** One crossfade buffer: a blurred, overscanned cover that fades its opacity
 *  between 1 (live) and 0 (parked) on the canonical ease-quart curve. */
function CoverLayer(props: { url: string | null; visible: boolean }) {
  return (
    <Show when={props.url}>
      {(u) => (
        <img
          src={u()}
          alt=""
          class="absolute inset-0 size-full scale-125 object-cover blur-[80px] saturate-[1.25] transition-opacity duration-500 [transition-timing-function:var(--ease-quart)]"
          style={{ opacity: props.visible ? 1 : 0 }}
        />
      )}
    </Show>
  );
}
