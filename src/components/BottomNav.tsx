import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
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
 * inside the pill (behind the buttons) and "rests" on whichever button
 * carries the [data-accent] attribute (NavButton sets it when isActive).
 * On a route change the indicator stretches into a capsule spanning
 * OLD → NEW, then contracts to the destination. That two-phase motion
 * is what makes the accent feel like mercury instead of a hard slide.
 *
 * The bubble is ALWAYS rendered (not conditionally) so we never lose the
 * transition-able element across path changes — the geometry just gets
 * patched in place via `style`. Opacity gates whether it's visible (0 on
 * detail routes that don't match any tab; 1 once a target is measured).
 */
const SETTLE_MS = 100; // capsule lingers this long before contracting

interface IndicatorBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function BottomNav(props: {
  onAddClick?: () => void;
  /** While AddSheet is open, the ENTIRE nav-pill is the morph-origin of the
   *  search-pill. The nav-pill fades to opacity-0 (synced 300ms with the
   *  search-pill's morph) so the user sees one continuous element
   *  transforming from "navigation" into "search" — Apple-style toolbar
   *  swap. We keep the nav-pill in the DOM (visibility, not display) so
   *  its bounding rect stays measurable for the morph origin/return. */
  addSheetOpen?: boolean;
}) {
  const location = useLocation();
  const isActive = (href: string) => location.pathname === href;

  let pillEl: HTMLDivElement | undefined;
  const [bubble, setBubble] = createSignal<IndicatorBox | null>(null);
  // Mutable refs that persist across reactive runs without triggering them.
  let prevRest: IndicatorBox | null = null;
  let settleTimer: number | null = null;
  // First placement should snap (no transition from 0/0/0/0). After that
  // we enable transitions for the next render.
  const [animated, setAnimated] = createSignal(false);

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

    // Enable transitions for subsequent renders. We do this on the next
    // frame so the initial snap-to-target isn't itself animated.
    if (!animated()) {
      requestAnimationFrame(() => setAnimated(true));
    }
  };

  // Plain createEffect (no `on()` wrapper) — fires on initial setup AND
  // on every pathname change. Reading `location.pathname` inside the
  // body is what makes it reactive. requestAnimationFrame waits for the
  // DOM patch (new data-accent target) before we querySelector.
  createEffect(() => {
    void location.pathname; // explicit reactive read
    requestAnimationFrame(place);
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
      class="fixed inset-x-0 bottom-[26px] z-30 flex justify-center px-4"
    >
      <div
        ref={pillEl!}
        data-add-anchor
        class={`relative flex items-center gap-1 rounded-full bg-nav-bg p-1.5 shadow-floating ${
          props.addSheetOpen ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        style={{
          // Sequential handoff with the search-pill in AddSheet — see the
          // comment there for the full reasoning. Short version: on CLOSE
          // (addSheetOpen: true → false), the NavBar rises BEFORE the
          // search-pill falls; on OPEN (addSheetOpen: false → true), the
          // search-pill rises BEFORE the NavBar falls. The 50ms windows
          // never overlap, so the combined nav-bg pill stays at full
          // opacity throughout — no crossfade dip.
          transition: `opacity 50ms linear ${
            props.addSheetOpen ? "50ms" : "400ms"
          }`,
        }}
      >
        {/* Sliding accent. Always rendered so the element persists across
            path changes (Solid would otherwise tear down + remount the
            <Show> child, killing the transition). Geometry is patched via
            inline style; transitions kick in after the first render so the
            initial measurement doesn't animate from 0. */}
        <span
          aria-hidden
          class={`pointer-events-none absolute rounded-full bg-accent ${
            animated() ? "transition-all duration-200 ease-out" : ""
          }`}
          style={{
            left: `${bubble()?.left ?? 0}px`,
            top: `${bubble()?.top ?? 0}px`,
            width: `${bubble()?.width ?? 0}px`,
            height: `${bubble()?.height ?? 0}px`,
            opacity: bubble() ? 1 : 0,
          }}
        />

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
        {/* + sits CENTER. Opens the AddSheet (Phase 4). Not a route — sits
            in-between two tabs so it never owns the active tab state. When
            the sheet opens, the parent nav-pill fades out (the whole pill
            morphs into the search-pill); the `+` rides along with that
            fade — no special handling needed here. */}
        <button
          type="button"
          onClick={props.onAddClick}
          aria-label="Hinzufügen"
          class="relative z-10 flex size-11 items-center justify-center rounded-full text-nav-fg/70 transition-colors hover:bg-nav-fg/10 hover:text-nav-fg"
        >
          <Plus class="size-5" strokeWidth={1.75} aria-hidden />
        </button>
        <NavButton
          icon={Calendar}
          label="Kalender"
          href="/calendar"
          isActive={isActive("/calendar")}
        />
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
