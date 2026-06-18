import { createSignal, For, Show } from "solid-js";
import { Eye } from "lucide-solid";
import type { CoWatcher } from "@/lib/queries/sharing";
import { Avatar } from "@/components/Avatar";

/**
 * Mitseher-Indikator — shown when ≥1 co-member has watched the same episode.
 * An eye marker leads a stack of up to MAX_FACES overlapping profile pictures
 * (the rest collapse into a "+N" chip); hovering reveals the full roster with
 * @handles + relative time. Sits left of the "watched" dot in the item episode
 * list and the film/game "seen by" row.
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
const MAX_FACES = 3;

export function CoWatcherMark(props: { watchers: CoWatcher[] }) {
  const [open, setOpen] = createSignal(false);
  const faces = () => props.watchers.slice(0, MAX_FACES);
  const overflow = () => props.watchers.length - MAX_FACES;

  return (
    <Show when={props.watchers.length > 0}>
      <div
        class="relative flex items-center gap-1.5"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        aria-label={`${props.watchers.length} Mitseher`}
      >
        <Eye
          class="size-3.5 shrink-0 text-text-muted"
          strokeWidth={1.75}
          aria-hidden
        />
        {/* Up to MAX_FACES overlapping profile pictures; "+N" when more. The
            ring matches the resting row bg so the faces read as separated. */}
        <div class="flex items-center -space-x-1.5">
          <For each={faces()}>
            {(w) => (
              <Avatar
                handle={w.name}
                avatarUrl={w.avatarUrl}
                size={20}
                class="ring-2 ring-bg"
              />
            )}
          </For>
          <Show when={overflow() > 0}>
            <span class="flex size-5 items-center justify-center rounded-full bg-surface font-mono text-[10px] tabular-nums text-text-muted ring-2 ring-bg">
              +{overflow()}
            </span>
          </Show>
        </div>
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
                      {/* The unique @handle — the anti-spoof identity. Skipped
                          when it just repeats the display label. */}
                      <Show when={w.handle && w.handle !== w.name}>
                        <p class="truncate font-mono text-mini text-text-muted">
                          {w.handle}
                        </p>
                      </Show>
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
