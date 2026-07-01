import { For, Show } from "solid-js";
import { Avatar } from "@/components/Avatar";

/**
 * Overlapping stack of member profile pictures with a "+N" overflow chip —
 * the generic version of CoWatcherMark's face row (which adds the Mitseher
 * eye + hover roster on top). Used on the /lists overview to show, at a
 * glance, who's in a list: a stack of faces = shared, nothing = just you.
 *
 * The `ring` matches the resting surface so overlapping faces read as
 * separated. Faces lead, the "+N" chip closes the row.
 */
const DEFAULT_MAX = 4;

export function AvatarStack(props: {
  members: { name: string | null; handle?: string | null; avatarUrl: string | null }[];
  /** Max faces before collapsing the rest into "+N". Default 4. */
  max?: number;
  /** Face diameter in px. Default 20. */
  size?: number;
}) {
  const max = () => props.max ?? DEFAULT_MAX;
  const faces = () => props.members.slice(0, max());
  const overflow = () => props.members.length - max();
  const size = () => props.size ?? 20;

  return (
    <Show when={props.members.length > 0}>
      <div
        class="flex shrink-0 items-center -space-x-1.5"
        aria-label={`${props.members.length} Mitglieder`}
      >
        <For each={faces()}>
          {(m) => (
            <Avatar
              handle={m.name ?? m.handle ?? "?"}
              avatarUrl={m.avatarUrl}
              size={size()}
              class="ring-2 ring-bg"
            />
          )}
        </For>
        <Show when={overflow() > 0}>
          <span
            class="flex items-center justify-center rounded-full bg-surface font-mono text-[10px] tabular-nums text-text-muted ring-2 ring-bg"
            style={{ width: `${size()}px`, height: `${size()}px` }}
          >
            +{overflow()}
          </span>
        </Show>
      </div>
    </Show>
  );
}
