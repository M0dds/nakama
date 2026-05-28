import { createSignal, createEffect, onCleanup, For, Show } from "solid-js";
import { Check, ChevronDown } from "lucide-solid";

export interface SelectOption {
  id: string;
  label: string;
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
        class="flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-transparent py-2 pl-3 pr-2.5 text-body text-text transition-colors hover:border-text-muted focus:border-accent focus:outline-none"
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
          class="absolute inset-x-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-sm border border-border bg-surface p-1 shadow-raised"
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
                  <span class="truncate">{o.label}</span>
                  <Show when={active()}>
                    <Check
                      class="size-3.5 shrink-0 text-accent"
                      strokeWidth={2.5}
                    />
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
