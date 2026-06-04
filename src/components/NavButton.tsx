import { A } from "@solidjs/router";
import { Show, type Component } from "solid-js";

/**
 * Single item inside the inverted-color nav pill. The accent FILL is NOT
 * drawn here — it's a single sliding bubble owned by <BottomNav> that
 * targets whichever button has `data-accent`. NavButton only sets the icon
 * color: accent-on when active (the bubble paints behind it), nav-fg/70
 * otherwise. That separation is what lets the indicator stretch + contract
 * across positions without re-mounting any element.
 *
 * `aria-current="page"` exposes the active item to assistive tech without
 * us having to maintain a separate visual+a11y split.
 */
interface NavButtonProps {
  icon: Component<{ class?: string; strokeWidth?: number }>;
  label: string;
  href: string;
  isActive: boolean;
  /** Notification count (e.g. pending invitations). >0 renders an accent
   *  badge on the icon. Absolutely positioned so it never changes the
   *  button's offset box — the BottomNav indicator measures `offsetWidth`/
   *  `offsetLeft` to place the sliding bubble, and a layout-affecting badge
   *  would shift it. */
  badge?: number;
  /** Screen-reader description for the badge (the badge is shared between
   *  invitations and the update indicator). Defaults to the invitation
   *  phrasing. */
  badgeLabel?: string;
}

export function NavButton(props: NavButtonProps) {
  return (
    <A
      href={props.href}
      aria-label={
        props.badge
          ? `${props.label}, ${props.badgeLabel ?? `${props.badge} neue Einladungen`}`
          : props.label
      }
      aria-current={props.isActive ? "page" : undefined}
      // data-accent marks this button as the indicator's target. Direct
      // attribute binding (not spread) — Solid's compiler handles the
      // `undefined` case by NOT emitting the attribute, so the spread
      // form was producing inconsistent output.
      data-accent={props.isActive ? "" : undefined}
      class={`relative z-10 flex size-11 items-center justify-center rounded-full transition-colors ${
        props.isActive
          ? "text-accent-on"
          : "text-nav-fg/70 hover:bg-nav-fg/10 hover:text-nav-fg"
      }`}
    >
      <props.icon class="size-5" strokeWidth={1.75} />
      <Show when={(props.badge ?? 0) > 0}>
        <span
          aria-hidden
          class="absolute -right-0.5 -top-0.5 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-medium leading-none text-accent-on ring-2 ring-nav-bg"
        >
          {props.badge! > 9 ? "9+" : props.badge}
        </span>
      </Show>
    </A>
  );
}
