import { Show } from "solid-js";

/**
 * Round member avatar — profile image when available, else a mono initial on
 * an accent fill (same vocabulary as the Profil-page identity block). Round is
 * the one sanctioned non-hard-corner shape for identity (mirrors the BottomNav
 * pill exception); everything else stays `rounded-xs`.
 *
 * Used by the Mitglieder roster (Phase 7c) and the Mitseher hover-overlay
 * (Phase 7f). `handle` may carry a leading "@" — we strip it for the initial.
 */
export function Avatar(props: {
  handle: string;
  avatarUrl?: string | null;
  /** Diameter in px. Default 32. */
  size?: number;
  /** Extra classes — e.g. ring for the stacked overlay. */
  class?: string;
}) {
  const px = () => props.size ?? 32;
  const initial = () =>
    props.handle.replace(/^@/, "").charAt(0).toUpperCase() || "?";

  return (
    <div
      class={`shrink-0 overflow-hidden rounded-full border border-border bg-accent ${
        props.class ?? ""
      }`}
      style={{ width: `${px()}px`, height: `${px()}px` }}
    >
      <Show
        when={props.avatarUrl}
        fallback={
          <span
            class="flex size-full items-center justify-center font-mono font-medium text-accent-on"
            style={{ "font-size": `${Math.round(px() * 0.42)}px` }}
          >
            {initial()}
          </span>
        }
      >
        <img
          src={props.avatarUrl!}
          alt=""
          class="size-full object-cover"
          loading="lazy"
        />
      </Show>
    </div>
  );
}
