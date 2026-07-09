import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { Check, ChevronDown } from "lucide-solid";

export interface SelectOption {
  id: string;
  label: string;
  /** Mono-mini tag on the option's right edge (popover only) — disambiguates
   *  same-named options, e.g. the list category in the AddSheet picker
   *  ("Watchlist · ANIME" vs "Watchlist · SERIE"). */
  meta?: string;
}

/**
 * Styled single-select dropdown — in-house replacement for native <select>,
 * so the picker matches the site instead of the OS chrome. Same popover
 * vocabulary as the calendar's list filter: bordered trigger, surface
 * popover with a check on the active option, click-outside + Esc to close.
 */
export function SelectMenu(props: {
  value: string;
  options: SelectOption[];
  onChange: (id: string) => void;
  ariaLabel?: string;
  /** Borderless, content-width trigger that reads like a ghost button (hover
   *  tint, hard corners) instead of a full bordered field — used where the
   *  picker should weigh about as much as an icon button (AddSheet header).
   *  The popover keeps its border + a min-width so it stays usable. */
  ghost?: boolean;
}) {
  let wrapper: HTMLDivElement | undefined;
  const [open, setOpen] = createSignal(false);

  createEffect(() => {
    if (!open()) return;
    const onDown = (e: MouseEvent) => {
      if (wrapper && !wrapper.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    });
  });

  const selected = () => props.options.find((o) => o.id === props.value);

  return (
    <div ref={wrapper!} class="relative">
      <button
        type="button"
        onClick={() => setOpen(!open())}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-label={props.ariaLabel}
        class={
          props.ghost
            ? "flex max-w-full items-center gap-1.5 rounded-xs px-2 py-1 text-body text-text transition-colors hover:bg-surface focus:outline-none"
            : "flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-transparent py-2 pl-3 pr-2.5 text-body text-text transition-colors hover:border-text-muted focus:border-accent focus:outline-none"
        }
      >
        <span class="truncate">{selected()?.label ?? "—"}</span>
        <ChevronDown
          class={`size-4 shrink-0 text-text-muted transition-transform ${
            open() ? "rotate-180" : ""
          }`}
          strokeWidth={1.75}
        />
      </button>

      <Show when={open()}>
        <div
          role="listbox"
          class={`absolute z-30 mt-1 max-h-60 overflow-y-auto rounded-sm border border-border bg-surface p-1 shadow-raised ${
            props.ghost ? "left-0 min-w-[12rem]" : "inset-x-0"
          }`}
        >
          <For each={props.options}>
            {(o) => {
              const active = () => o.id === props.value;
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={active()}
                  onClick={() => {
                    props.onChange(o.id);
                    setOpen(false);
                  }}
                  class="flex w-full items-center justify-between gap-2 rounded-xs px-2.5 py-1.5 text-left text-body text-text transition-colors hover:bg-bg"
                >
                  <span class="min-w-0 truncate">{o.label}</span>
                  <span class="flex shrink-0 items-center gap-2">
                    <Show when={o.meta}>
                      <span class="font-mono text-mini uppercase tracking-wider text-text-muted">
                        {o.meta}
                      </span>
                    </Show>
                    <Show when={active()}>
                      <Check
                        class="size-3.5 shrink-0 text-accent"
                        strokeWidth={2.5}
                      />
                    </Show>
                  </span>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
