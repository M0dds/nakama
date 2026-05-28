import { A } from "@solidjs/router";
import type { Component } from "solid-js";

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
}

export function NavButton(props: NavButtonProps) {
  return (
    <A
      href={props.href}
      aria-label={props.label}
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
    </A>
  );
}
