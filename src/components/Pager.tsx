import { For, Show } from "solid-js";
import { ChevronLeft, ChevronRight } from "lucide-solid";
import { createLiquidBubble } from "@/lib/liquid-bubble";

/** The page numbers to render for `current` of `count`, with ellipsis markers
 *  in the gaps. Always shows the first and last page plus a ±1 window around
 *  the current one; collapses everything else into "…". Up to 7 pages render
 *  in full (no ellipsis needed). One Piece (~43 pages) → `1 … 5 6 7 … 43`. */
export function pageWindow(current: number, count: number): (number | "ellipsis")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(count - 1, current + 1);
  if (start > 2) out.push("ellipsis");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < count - 1) out.push("ellipsis");
  out.push(count);
  return out;
}

/**
 * Numbered pager — shared by Home's "Fortsetzen" and the item episode list so
 * paging reads identically everywhere. Hard corners + mono mini-caps like the
 * rest of the chrome; the active page carries the accent on a LIQUID bubble
 * that morphs from the old page to the new one (createLiquidBubble — the exact
 * mercury motion of the BottomNav / Segmented tab switcher). Renders nothing
 * for a single page. The content the pager drives still swaps as a hard cut —
 * only the indicator is liquid (handshake §Motion-Philosophie).
 */
export function Pager(props: {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  let navEl: HTMLElement | undefined;
  let bubbleEl: HTMLSpanElement | undefined;

  const { box } = createLiquidBubble({
    container: () => navEl,
    bubble: () => bubbleEl,
    // Track pageCount too: it flips 1→N when the <Show> first mounts (so the
    // refs become available and the bubble can place itself), and it changes
    // when the number window reshuffles — both want a re-measure.
    track: () => [props.page, props.pageCount],
  });

  const go = (p: number) => {
    if (p < 1 || p > props.pageCount || p === props.page) return;
    props.onPage(p);
  };

  return (
    <Show when={props.pageCount > 1}>
      <nav
        ref={navEl!}
        class="relative mt-1 flex items-center justify-center gap-1 py-2 font-mono text-mini uppercase tracking-wider"
        aria-label="Seiten"
      >
        {/* Liquid accent bubble — always rendered so it persists across page
            changes; geometry patches via inline style, the slide is a WAAPI
            transform overlay (see createLiquidBubble). */}
        <span
          ref={bubbleEl!}
          aria-hidden
          class="pointer-events-none absolute rounded-xs bg-accent"
          style={{
            left: `${box()?.left ?? 0}px`,
            top: `${box()?.top ?? 0}px`,
            width: `${box()?.width ?? 0}px`,
            height: `${box()?.height ?? 0}px`,
            opacity: box() ? 1 : 0,
            transition: "opacity 200ms ease-out",
          }}
        />

        <button
          type="button"
          onClick={() => go(props.page - 1)}
          disabled={props.page <= 1}
          aria-label="Vorige Seite"
          class="relative z-10 flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-text disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft class="size-4" strokeWidth={1.75} />
        </button>

        <For each={pageWindow(props.page, props.pageCount)}>
          {(p) =>
            p === "ellipsis" ? (
              <span class="relative z-10 flex size-7 items-center justify-center text-text-muted">
                …
              </span>
            ) : (
              <button
                type="button"
                onClick={() => go(p)}
                data-active={p === props.page ? "true" : "false"}
                aria-current={p === props.page ? "page" : undefined}
                class="relative z-10 flex size-7 items-center justify-center rounded-xs tabular-nums transition-colors"
                classList={{
                  "text-accent-on": p === props.page,
                  "text-text-muted hover:bg-surface hover:text-text":
                    p !== props.page,
                }}
              >
                {p}
              </button>
            )
          }
        </For>

        <button
          type="button"
          onClick={() => go(props.page + 1)}
          disabled={props.page >= props.pageCount}
          aria-label="Nächste Seite"
          class="relative z-10 flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-text disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight class="size-4" strokeWidth={1.75} />
        </button>
      </nav>
    </Show>
  );
}
