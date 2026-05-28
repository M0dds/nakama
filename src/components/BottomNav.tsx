import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useLocation } from "@solidjs/router";
import { Calendar, House, List, Plus, User } from "lucide-solid";
import { NavButton } from "@/components/NavButton";

/**
 * Single floating nav, bottom-centered on every viewport. 5 items:
 *
 *   [ Home · Listen · Kalender · + · Profil ]
 *
 * The `+` is the "Hinzufügen" affordance — opens an AddSheet (search +
 * add-to-list). The sheet lands with Phase 4; for now `+` is wired to a
 * no-op callback so the trigger pattern is in place.
 *
 * Liquid sliding accent indicator: a single absolute-positioned span lives
 * inside the pill (z-0) and "rests" on whichever button carries the
 * [data-accent] attribute (NavButton sets it when isActive). On a route
 * change the indicator stretches into a capsule spanning OLD → NEW, then
 * contracts to the destination. That two-phase motion is what makes the
 * accent feel like liquid mercury instead of a hard slide. On detail
 * routes no tab matches, so the bubble stays at the last position — a
 * back-button "satellite" that the bubble flows OUT of the pill onto is
 * the natural next step (parked as polish).
 */
const SETTLE_MS = 100; // capsule lingers this long before contracting

interface IndicatorBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function BottomNav(props: { onAddClick?: () => void }) {
  const location = useLocation();
  const isActive = (href: string) => location.pathname === href;

  let pillEl: HTMLDivElement | undefined;
  const [bubble, setBubble] = createSignal<IndicatorBox | null>(null);
  // Mutable refs that persist across reactive runs without triggering them.
  let prevRest: IndicatorBox | null = null;
  let settleTimer: number | null = null;

  const place = () => {
    if (settleTimer !== null) {
      window.clearTimeout(settleTimer);
      settleTimer = null;
    }
    if (!pillEl) return;
    const el = pillEl.querySelector<HTMLElement>("[data-accent]");
    if (!el) return; // no active tab on this route — bubble stays put

    const target: IndicatorBox = {
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    };
    const prev = prevRest;

    if (prev && prev.left !== target.left) {
      // Phase 1 — stretch into a capsule spanning the old and new buttons.
      const leftEdge = Math.min(prev.left, target.left);
      const rightEdge = Math.max(
        prev.left + prev.width,
        target.left + target.width,
      );
      setBubble({
        left: leftEdge,
        top: target.top,
        width: rightEdge - leftEdge,
        height: target.height,
      });
      // Phase 2 — contract to the destination.
      settleTimer = window.setTimeout(() => setBubble(target), SETTLE_MS);
    } else {
      // First appearance OR same position — snap (no stretch).
      setBubble(target);
    }
    prevRest = target;
  };

  // Re-place whenever the path changes. queueMicrotask defers until after
  // Solid finishes patching the DOM (so the new data-accent target exists).
  createEffect(() => {
    // touch the reactive dependency
    location.pathname;
    queueMicrotask(place);
  });

  onMount(() => {
    const onResize = () => place();
    window.addEventListener("resize", onResize);
    onCleanup(() => {
      window.removeEventListener("resize", onResize);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    });
  });

  return (
    <nav
      aria-label="Hauptnavigation"
      class="fixed inset-x-0 bottom-[26px] z-40 flex justify-center px-4"
    >
      <div
        ref={pillEl!}
        class="relative flex items-center gap-1 rounded-full bg-nav-bg p-1.5 shadow-floating"
      >
        {/* Sliding accent — z-0, BEHIND the buttons (which are z-10). The
            transition handles both stretch and contract phases; the JS
            just sets the geometry. */}
        <Show when={bubble()}>
          {(box) => (
            <span
              aria-hidden
              class="pointer-events-none absolute rounded-full bg-accent transition-all duration-200 ease-quart"
              style={{
                left: `${box().left}px`,
                top: `${box().top}px`,
                width: `${box().width}px`,
                height: `${box().height}px`,
              }}
            />
          )}
        </Show>

        <NavButton
          icon={House}
          label="Home"
          href="/"
          isActive={isActive("/")}
        />
        <NavButton
          icon={List}
          label="Listen"
          href="/lists"
          isActive={isActive("/lists")}
        />
        <NavButton
          icon={Calendar}
          label="Kalender"
          href="/calendar"
          isActive={isActive("/calendar")}
        />
        {/* + opens the AddSheet (Phase 4). Not a route — sits in-between as
            a button so it never owns the active tab state. */}
        <button
          type="button"
          onClick={props.onAddClick}
          aria-label="Hinzufügen"
          class="relative z-10 flex size-11 items-center justify-center rounded-full text-nav-fg/70 transition-colors hover:bg-nav-fg/10 hover:text-nav-fg"
        >
          <Plus class="size-5" strokeWidth={1.75} aria-hidden />
        </button>
        <NavButton
          icon={User}
          label="Profil"
          href="/profile"
          isActive={isActive("/profile")}
        />
      </div>
    </nav>
  );
}
