import type { ParentProps } from "solid-js";

/**
 * Root layout wrapper around every route. The grain overlay sits as a fixed
 * pseudo-layer above the bg — flat depth via texture, not shadow. Real navs
 * (bottom-pill, page-header) land in Phase 2.
 */
export default function App(props: ParentProps) {
  return (
    <>
      <div
        aria-hidden
        class="grain-layer pointer-events-none fixed inset-0 z-50 opacity-[0.025] mix-blend-multiply dark:opacity-[0.04] dark:mix-blend-screen"
      />
      <div class="relative min-h-svh">{props.children}</div>
    </>
  );
}
