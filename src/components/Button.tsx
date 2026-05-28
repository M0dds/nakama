import type { JSX, ParentProps } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "@/lib/cn";

/**
 * Primary CTA button. Three variants:
 *   primary    — accent fill, white text (the recommended action)
 *   secondary  — hairline border, text color (the alternative)
 *   ghost      — no border, just text + hover bg (close buttons, cancels)
 *
 * Sizing is one stop: 8/16 padding, 15px body type. Smaller/larger ARE possible
 * later but only with a justification — the current handshake calls for one
 * consistent button height so the layout grid doesn't drift across pages.
 *
 * Hard corners (rounded-sm = 4px), no shadow — material aesthetic. Disabled
 * gets cursor-not-allowed because a button that doesn't react needs to FEEL
 * dead too, not just look dead.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps
  extends ParentProps,
    Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-on hover:opacity-90",
  secondary: "border border-border text-text hover:bg-surface",
  ghost: "text-text hover:bg-surface",
};

export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, ["variant", "class", "children"]);
  return (
    <button
      type="button"
      {...rest}
      class={cn(base, variants[local.variant ?? "primary"], local.class)}
    >
      {local.children}
    </button>
  );
}
