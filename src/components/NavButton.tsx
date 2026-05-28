import { A } from "@solidjs/router";
import type { Component } from "solid-js";

/**
 * Single item inside the inverted-color nav pill. Inactive items show their
 * icon at 70% opacity of nav-fg; active items get a full accent fill behind
 * the icon (we paint that as a simple background here — the Logbook's "liquid
 * sliding indicator" lands as a polish step later). Hover lifts inactive
 * items to full opacity with a subtle nav-fg/10 wash.
 *
 * `aria-current="page"` exposes the active item to assistive tech without us
 * having to maintain a separate visual+a11y split.
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
      class={`relative z-10 flex size-11 items-center justify-center rounded-full transition-colors ${
        props.isActive
          ? "bg-accent text-accent-on"
          : "text-nav-fg/70 hover:bg-nav-fg/10 hover:text-nav-fg"
      }`}
    >
      <props.icon class="size-5" strokeWidth={1.75} />
    </A>
  );
}
