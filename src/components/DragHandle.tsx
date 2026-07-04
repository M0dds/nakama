import { GripVertical } from "lucide-solid";
import type { JSX } from "solid-js";

/**
 * Drag-handle affordance. Sits on the left edge of a row, hidden until the
 * row is hovered (mirrors the PinButton's affordance language). Spreading
 * the `activators` prop attaches solid-dnd's pointer listeners so only the
 * handle initiates a drag — the rest of the row stays clickable / linkable.
 *
 * `touch-none` blocks the default touch scrolling behaviour on the handle
 * so a touch drag actually drags instead of scrolling the page.
 */
interface Props {
  activators: JSX.HTMLAttributes<HTMLButtonElement>;
  noun?: string;
  /** Force-hide override. Mirrors PinButton's `hidden` — used by the row
   *  to mute side-buttons while RowActions are in a two-step confirm. */
  hidden?: boolean;
  /** Extra utility classes, appended after the defaults. Used to bump the
   *  left margin so the handle sits a little apart from the other icon-
   *  buttons in the same row cluster. */
  class?: string;
}

export function DragHandle(props: Props) {
  return (
    <button
      type="button"
      aria-label={props.noun ? `${props.noun} verschieben` : "Verschieben"}
      aria-hidden={props.hidden || undefined}
      tabIndex={props.hidden ? -1 : 0}
      // Fine pointers: hover-revealed, pointer-events follow visibility (an
      // invisible handle must never eat input). Coarse pointers: ALWAYS
      // visible — drag needs a permanent, honest grab point there, and its
      // touch-none strip is only acceptable as a visible affordance (an
      // opacity-0 handle was dead to thumb scrolling AND live enough to
      // start a server-persisted reorder after 8px).
      class={`inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-xs text-text-muted transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] hover:bg-bg hover:text-text active:cursor-grabbing ${
        props.hidden
          ? "pointer-events-none opacity-0"
          : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
      } ${props.class ?? ""}`}
      {...props.activators}
    >
      <GripVertical class="size-4" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
