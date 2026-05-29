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
      class={`inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-xs text-text-muted opacity-0 transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] hover:bg-bg hover:text-text active:cursor-grabbing group-hover:opacity-100 focus-within:opacity-100 ${props.class ?? ""}`}
      {...props.activators}
    >
      <GripVertical class="size-4" strokeWidth={1.75} aria-hidden />
    </button>
  );
}
