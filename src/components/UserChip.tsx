import { Show } from "solid-js";
import type { JSX } from "solid-js";
import { Avatar } from "@/components/Avatar";
import { Tooltip } from "@/components/Tooltip";

/**
 * Hover identity card — wraps a user's name (in a Logbuch sentence, the roster,
 * a co-watcher line) and reveals avatar + display name + @handle on hover. The
 * point is anti-spoofing: two members can share a display name ("Johann"), but
 * the @handle is unique (DB UNIQUE constraint), so the card lets you verify who
 * actually acted without cluttering the inline sentence. Profil-card layout,
 * just smaller. Built on the Tooltip primitive (shared positioning/clamping).
 *
 * `name` is the primary label (display_name ▸ @handle); `handle` is the bare
 * "@username" shown as a sub-line only when it differs from the name (i.e. the
 * user has a real display name). For self / unknown actors, callers should
 * render plain text instead of a chip.
 */
export function UserChip(props: {
  name: string;
  handle?: string | null;
  avatarUrl?: string | null;
  children: JSX.Element;
}) {
  return (
    <Tooltip
      label={props.name}
      openDelay={300}
      content={
        <div class="flex items-center gap-2.5">
          <Avatar
            handle={props.handle ?? props.name}
            avatarUrl={props.avatarUrl}
            size={36}
          />
          <div class="leading-tight">
            <div class="whitespace-nowrap text-body font-medium text-text">
              {props.name}
            </div>
            <Show when={props.handle && props.handle !== props.name}>
              <div class="-mt-0.5 whitespace-nowrap font-mono text-mini text-text-muted">
                {props.handle}
              </div>
            </Show>
          </div>
        </div>
      }
    >
      {props.children}
    </Tooltip>
  );
}
