import { createSignal, For, Show } from "solid-js";
import { Eye } from "lucide-solid";
import type { CoWatcher } from "@/lib/queries/sharing";
import { Avatar } from "@/components/Avatar";

/**
 * Mitseher-Indikator — a subtle eye marker shown when ≥1 co-member has watched
 * the same episode. Hovering reveals an overlay of their profile pictures +
 * @handles + relative time. Sits left of the "watched" dot in the item episode
 * list and the calendar day-pane.
 *
 * The marker lives inside the row's tap/long-press button, so it stops its own
 * pointer + click events from bubbling — interacting with the indicator never
 * toggles the episode underneath it. Hover (mouseenter/leave) doesn't bubble,
 * so it works regardless.
 *
 * Overlay grows leftward from the right edge (right-0) to avoid clipping at the
 * column's right side. Cheap viewport heuristic — no JS positioning needed
 * because the indicator always sits in the right cluster.
 */
export function CoWatcherMark(props: { watchers: CoWatcher[] }) {
  const [open, setOpen] = createSignal(false);

  return (
    <Show when={props.watchers.length > 0}>
      <div
        class="relative flex items-center"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <Eye
          class="size-3.5 text-text-muted"
          strokeWidth={1.75}
          aria-label={`${props.watchers.length} Mitseher`}
        />
        <Show when={open()}>
          <div class="absolute right-0 top-full z-30 mt-2 min-w-max rounded-sm border border-border bg-surface p-2 shadow-raised">
            <p class="mb-1.5 px-1 font-mono text-mini uppercase tracking-wider text-text-muted">
              Mitseher
            </p>
            <ul class="space-y-1">
              <For each={props.watchers}>
                {(w) => (
                  <li class="flex items-center gap-2 pr-1">
                    <Avatar handle={w.name} avatarUrl={w.avatarUrl} size={24} />
                    <div class="min-w-0">
                      <p class="truncate text-mini text-text">{w.name}</p>
                      <p class="font-mono text-mini text-text-muted">
                        {w.timeLabel}
                      </p>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </div>
    </Show>
  );
}
