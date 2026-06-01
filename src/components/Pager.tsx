import { For, Show } from "solid-js";
import { ChevronLeft, ChevronRight } from "lucide-solid";

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
 * rest of the chrome; the active page carries the accent. Renders nothing for
 * a single page. Content swaps are a hard cut (no entrance choreo on content —
 * see handshake §Motion-Philosophie); only the page-button colors transition.
 */
export function Pager(props: {
  /** 1-based current page. */
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  const go = (p: number) => {
    if (p < 1 || p > props.pageCount || p === props.page) return;
    props.onPage(p);
  };

  return (
    <Show when={props.pageCount > 1}>
      <nav
        class="mt-1 flex items-center justify-center gap-1 py-2 font-mono text-mini uppercase tracking-wider"
        aria-label="Seiten"
      >
        <button
          type="button"
          onClick={() => go(props.page - 1)}
          disabled={props.page <= 1}
          aria-label="Vorige Seite"
          class="flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-text disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft class="size-4" strokeWidth={1.75} />
        </button>

        <For each={pageWindow(props.page, props.pageCount)}>
          {(p) =>
            p === "ellipsis" ? (
              <span class="flex size-7 items-center justify-center text-text-muted">
                …
              </span>
            ) : (
              <button
                type="button"
                onClick={() => go(p)}
                aria-current={p === props.page ? "page" : undefined}
                class="flex size-7 items-center justify-center rounded-xs tabular-nums transition-colors"
                classList={{
                  "bg-accent text-accent-on": p === props.page,
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
          class="flex size-7 items-center justify-center rounded-xs text-text-muted transition-colors hover:bg-surface hover:text-text disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight class="size-4" strokeWidth={1.75} />
        </button>
      </nav>
    </Show>
  );
}
