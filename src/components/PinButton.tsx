import { Pin } from "lucide-solid";
import { Tooltip } from "@/components/Tooltip";

/**
 * Hover-revealed pin toggle. Lives next to the row name on both /lists and
 * /lists/:shortCode rows. Both states fade in on the parent row's group-hover
 * (mirroring the RowActions affordance language) — the AT-REST pinned
 * indicator is the PinBadge on the cover, not this icon. The icon only colours:
 *
 *   • Unpinned  — outline pin, muted color → text on hover.
 *   • Pinned    — outline+filled pin, accent (orange) so a hover reveals that
 *                 the pin is currently active and a click would un-pin it.
 *
 * The component is type=button + stops event propagation, so it can sit
 * safely inside or alongside an <A> link without triggering navigation
 * when clicked.
 */
interface Props {
  pinned: boolean;
  /** Forwarded to aria-label + Tooltip. "Liste" / "Eintrag". */
  noun: string;
  pending?: boolean;
  /** Force-hide override. Fades out + disables pointer events regardless of
   *  pinned-state. Used by the row to mute side-buttons while sibling
   *  RowActions are in a two-step confirm — the pinned pin shouldn't
   *  compete with a destructive prompt for attention. */
  hidden?: boolean;
  /** Force-show override — the row's coarse-pointer "⋯" toggle is open.
   *  Hover can't reveal anything on touch, so the toggle pins the whole
   *  cluster visible instead (`hidden` still wins). */
  forceVisible?: boolean;
  onToggle: () => void;
}

export function PinButton(props: Props) {
  return (
    <Tooltip
      label={
        props.pinned ? `${props.noun} entpinnen` : `${props.noun} anpinnen`
      }
    >
      <button
        type="button"
        disabled={props.pending}
        onClick={(e) => {
          // Pin button may sit inside the row's <A> wrapper (lists overview)
          // or beside it (list detail). Stop both so neither path triggers
          // navigation.
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.blur();
          props.onToggle();
        }}
        aria-label={
          props.pinned ? `${props.noun} entpinnen` : `${props.noun} anpinnen`
        }
        aria-pressed={props.pinned}
        aria-hidden={props.hidden || undefined}
        tabIndex={props.hidden ? -1 : 0}
        class={`inline-flex size-7 shrink-0 items-center justify-center rounded-xs disabled:opacity-50 ${
          // Conditional transition: ON when not hidden (so hover-reveal +
          // sticky-pinned both fade smoothly), OFF when hidden so the
          // disappear matches the destructive cluster's hard-cut Show swap
          // — otherwise the pin would linger 200ms after Reset/Move/Remove
          // are already gone, reading as a flash.
          //
          // Coarse-pointer rest state: a FOLDABLE cluster (destructive
          // bundle) is display:none on the RowActions ROOT until the "⋯"
          // toggle opens it via forceVisible. A pin-ONLY cluster (overview
          // rows) never folds — there the pin is simply always visible on
          // touch (pointer-coarse overrides below, like the drag handle);
          // hover can never reveal anything there.
          props.hidden
            ? "pointer-events-none opacity-0"
            : props.forceVisible
              ? `transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] opacity-100 hover:bg-bg ${
                  props.pinned ? "text-accent" : "text-text-muted hover:text-text"
                }`
              : `transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] pointer-events-none opacity-0 hover:bg-bg group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 ${
                  props.pinned ? "text-accent" : "text-text-muted hover:text-text"
                }`
        }`}
      >
        <Pin
          class="size-4"
          strokeWidth={1.75}
          fill={props.pinned ? "currentColor" : "none"}
          aria-hidden
        />
      </button>
    </Tooltip>
  );
}
