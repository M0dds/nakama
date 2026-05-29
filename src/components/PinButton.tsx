import { Pin } from "lucide-solid";
import { Tooltip } from "@/components/Tooltip";

/**
 * Hover-revealed pin toggle. Lives next to the row name on both /lists and
 * /lists/:shortCode rows. Two visual states:
 *
 *   • Unpinned (default)  — outline pin, muted color, opacity-0. Fades in on
 *                           the group-hover of the parent row, mirroring the
 *                           ListEntryActions affordance language.
 *   • Pinned (active)     — outline+filled pin, accent color, always
 *                           opacity-100. Stays visible at rest because it
 *                           communicates state, not just an action.
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
        class={`inline-flex size-7 shrink-0 items-center justify-center rounded-xs transition-opacity duration-200 [transition-timing-function:var(--ease-quart)] disabled:opacity-50 ${
          props.pinned
            ? "text-accent opacity-100 hover:bg-bg"
            : "pointer-events-none text-text-muted opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 hover:bg-bg hover:text-text"
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
