import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { useLocation, useNavigate } from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { ArrowLeft, Calendar, House, List, Mail, Plus, User } from "lucide-solid";
import { NavButton } from "@/components/NavButton";
import { useAuth } from "@/lib/auth";
import { goBack as runBack } from "@/lib/navigation";
import { useToast } from "@/lib/toast";
import { myInvitationsOptions } from "@/lib/queries/sharing";
import { useRealtimeInvalidation } from "@/lib/realtime";

/** Fallback back target derived from the route — mirrors each detail page's
 *  header backHref. Only used for deep-links (when canGoBack() is false);
 *  in-app navigation returns to the real origin via history.back(). Null on the
 *  top-level tabs, where no back affordance shows. */
function backTarget(pathname: string): string | null {
  // List-scoped item → the specific list. Global item → Home (reached from
  // Home / Calendar / search, not a list). List detail → the overview.
  const listScopedItem = pathname.match(/^\/lists\/([^/]+)\/item\//);
  if (listScopedItem) return `/lists/${listScopedItem[1]}`;
  if (pathname.startsWith("/item/")) return "/";
  if (pathname.startsWith("/lists/")) return "/lists";
  return null;
}

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
 * On a route change the indicator elongates toward the destination — the
 * leading edge (in the travel direction) races ahead while the trailing
 * edge lags, then the tail catches up and it contracts onto the target. One
 * continuous WAAPI timeline (see place()); that stretch-and-contract is what
 * makes the accent feel like mercury instead of a hard slide.
 *
 * The bubble is ALWAYS rendered (not conditionally) so we never lose the
 * animatable element across path changes — the resting geometry gets patched
 * in place via `style` and the slide is a WAAPI overlay on top. Opacity gates
 * whether it's visible (0 on detail routes that don't match any tab; 1 once a
 * target is measured).
 */

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
  const navigate = useNavigate();
  const auth = useAuth();
  const isActive = (href: string) => location.pathname === href;
  const back = () => backTarget(location.pathname);

  // Pending-invitation count → badge on the "Listen" tab. The query lives here
  // (BottomNav mounts once via AppShell) and a global realtime sub keeps the
  // badge live regardless of which route the user is on — an invite arriving
  // while they're on Home/Kalender still ticks the count.
  const invitations = createQuery(() => ({
    ...myInvitationsOptions(auth.user()!),
    enabled: !!auth.user(),
  }));
  const inviteCount = () => invitations.data?.length ?? 0;

  useRealtimeInvalidation("global-invitations", [
    { table: "list_invitations", invalidates: [["invitations", "mine"]] },
  ]);

  // Toast a NEWLY arrived invitation — the canonical async case: someone
  // invites you while you're on another page, and the global sub above ticks
  // the inbox in the background. We seed the known-set silently on first load
  // (and on account switch), so only genuinely new ids fire a toast; existing
  // and removed invites stay quiet. The refs are plain `let` — they must not
  // be reactive, or the effect would loop.
  const toast = useToast();
  let knownInviteIds = new Set<string>();
  let knownFor: string | null = null;
  createEffect(() => {
    const uid = auth.user()?.id;
    const data = invitations.data;
    if (!uid || !data) return;
    const ids = new Set(data.map((i) => i.invitationId));
    if (knownFor !== uid) {
      knownFor = uid;
      knownInviteIds = ids;
      return;
    }
    const fresh = data.filter((i) => !knownInviteIds.has(i.invitationId));
    knownInviteIds = ids;
    for (const inv of fresh) {
      toast(`${inv.inviterName} hat dich zu „${inv.listName}“ eingeladen.`, {
        icon: Mail,
        action: { label: "Ansehen", onClick: () => navigate("/lists") },
      });
    }
  });

  /** History-aware back: prefer the actual previous entry (so /lists/foo
   *  back-from-/item lands on /lists/foo, not the generic fallback). Fall
   *  back to backTarget's path on a direct-deep-link. Same logic as the
   *  PageHeader's chevron, exposed as a nav affordance here. */
  const goBack = () => {
    const fallback = back();
    if (!fallback) return;
    pulseBack();
    // In-app origin via history.back(); deep-link → the route's fallback.
    runBack(navigate, fallback);
  };

  let pillEl: HTMLDivElement | undefined;
  const [bubble, setBubble] = createSignal<IndicatorBox | null>(null);
  // Mutable refs that persist across reactive runs without triggering them.
  let prevRest: IndicatorBox | null = null;
  let slideAnim: Animation | undefined;
  // First placement should snap (no transition from 0/0/0/0). After that
  // we enable transitions for the next render.
  const [animated, setAnimated] = createSignal(false);
  // Press feedback for the back-satellite. Two problems with the old
  // active:scale-95: (1) the accent FILL is the shared bubble — a sibling
  // span, not a child of the button — so scaling the button shrank only the
  // arrow + shadow and left the colour static, reading as disjoint/rigid;
  // (2) a press-STATE transform is invisible on a quick tap, because
  // pointerup reverses it before it registers. So we fire a ONE-SHOT recoil
  // (squash + slight "back"-ward lean, then recover) via WAAPI on BOTH the
  // button and the bubble — fixed duration, independent of how briefly the
  // button is held, and visible even when the route keeps the satellite in
  // the same slot (item→list), where the bubble would otherwise never move.
  let backBtnEl: HTMLButtonElement | undefined;
  let bubbleEl: HTMLSpanElement | undefined;
  let backAnims: Animation[] = [];
  const pulseBack = () => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Liquid, not a uniform shrink. A flat scale(0.86) reads rigid; mercury
    // deforms anisotropically and overshoots. So the blob wobbles round →
    // tall-oval (squashed against the "back" lean) → wide-oval (rebound past
    // 1) → settles round — the same stretch-and-contract family as the nav
    // bubble's capsule morph. Per-keyframe easing keeps the velocity organic
    // (a single easing across all frames is what made it feel choppy).
    const frames: Keyframe[] = [
      { transform: "translateX(0) scale(1, 1)", easing: "ease-out" },
      {
        transform: "translateX(-3px) scale(0.82, 1.12)",
        offset: 0.32,
        easing: "ease-in-out",
      },
      {
        transform: "translateX(1px) scale(1.09, 0.93)",
        offset: 0.62,
        easing: "ease-out",
      },
      { transform: "translateX(0) scale(1, 1)", offset: 1 },
    ];
    // composite:"add" so the recoil layers ON TOP of any in-flight slide
    // transform (e.g. list→lists fires both) instead of clobbering it.
    const opts: KeyframeAnimationOptions = { duration: 440, composite: "add" };
    backAnims.forEach((a) => a.cancel());
    backAnims = [backBtnEl?.animate(frames, opts), bubbleEl?.animate(frames, opts)].filter(
      Boolean,
    ) as Animation[];
  };

  const place = () => {
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
    // Resting geometry is ALWAYS the target box; the slide is a WAAPI overlay
    // on top (the bubble has no CSS transition on left/width to race it).
    setBubble(target);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (animated() && prev && prev.left !== target.left && bubbleEl && !reduce) {
      // Liquid morph as a pure TRANSFORM overlay (translateX + scaleX) on the
      // resting target box — GPU-composited, so no layout-thread jank, and it
      // composites cleanly with the press recoil (both composite:"add"). The
      // bubble maps back to its previous box at t=0, bulges wider at the
      // midpoint (the leading edge ahead of the trailing one → mercury
      // stretch), then settles to identity (= the target box) at t=1.
      //
      // The easings are the crux: segment 1 ACCELERATES (ease-in) and segment
      // 2 DECELERATES (ease-out), so velocity is at its PEAK through the
      // midpoint — one continuous surge. (A symmetric ease-out→ease-in pair
      // dropped to ~zero velocity at the waypoint and read as two jerky
      // steps.) LEAD/TRAIL set each edge's progress at the midpoint, swapped
      // by direction so whichever edge leads the travel gets LEAD.
      const cx = target.left + target.width / 2;
      const pL = prev.left;
      const pR = prev.left + prev.width;
      const tL = target.left;
      const tR = target.left + target.width;
      const goingRight = tL > pL;
      const LEAD = 0.85;
      const TRAIL = 0.3;
      const midL = pL + (tL - pL) * (goingRight ? TRAIL : LEAD);
      const midR = pR + (tR - pR) * (goingRight ? LEAD : TRAIL);
      const tf = (l: number, r: number) =>
        `translateX(${(l + r) / 2 - cx}px) scaleX(${(r - l) / target.width})`;
      // Velocity profile tuned for SNAP: a hard departure (seg1 start velocity
      // y1/x1 = 2.0), peak velocity carried through the midpoint (seg1 ends
      // and seg2 starts steep), and a quick settle. The midpoint is pulled
      // earlier (0.42) so the surge front-loads — most of the travel is done
      // early, the tail just settles. Short duration keeps it crisp.
      slideAnim?.cancel();
      slideAnim = bubbleEl.animate(
        [
          { transform: tf(pL, pR), easing: "cubic-bezier(0.25, 0.5, 0.9, 0.7)" },
          { transform: tf(midL, midR), offset: 0.42, easing: "cubic-bezier(0.1, 0.45, 0.6, 0.9)" },
          { transform: "translateX(0) scaleX(1)", offset: 1 },
        ],
        { duration: 240, composite: "add" },
      );
    }

    prevRest = target;

    // Enable animation for subsequent renders. Next frame so the initial
    // snap-to-target isn't itself animated.
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
      slideAnim?.cancel();
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
        {/* Back-Satellite — sits LEFT of the pill, attaches to the pill's
            relative origin via `absolute right-full`. Always in the DOM so
            the opacity transition has a class to switch FROM; data-accent
            is conditional, which is what the place()-effect targets to
            flow the bubble out of the nav and into the back button when
            entering a detail route. On exit (back to a tab), the bubble
            flows back into the pill and the back button fades out at the
            same time, so the accent reads as "drag the back button into /
            out of existence". Vertical: top-1/2 -mt-6 centers the size-12
            button against the pill's centerline. */}
        <button
          type="button"
          ref={backBtnEl!}
          onClick={goBack}
          aria-label="Zurück"
          tabIndex={back() ? 0 : -1}
          aria-hidden={!back()}
          data-accent={back() ? "" : undefined}
          class={`absolute right-full top-1/2 z-10 -mt-6 mr-3 inline-flex size-12 items-center justify-center rounded-full text-accent-on shadow-floating ${
            back() ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          style={{
            // Opacity is delayed 100 ms so the arrow only appears once the
            // bubble's slide morph has begun settling on the back-button slot
            // — otherwise the white-on-light arrow would briefly float over a
            // backgroundless slot before the accent fills in. Full opacity
            // lands around t=300 ms, when the bubble has arrived. Symmetric in
            // close: the arrow fades together with the bubble leaving its slot.
            // The press recoil is a one-shot WAAPI animation (pulseBack) — not
            // a CSS transition here.
            transition: "opacity 200ms var(--ease-quart) 100ms",
          }}
        >
          <ArrowLeft class="size-5" strokeWidth={1.75} aria-hidden />
        </button>

        {/* Sliding accent. Always rendered so the element persists across
            path changes (Solid would otherwise tear down + remount the
            <Show> child, killing the transition). Geometry is patched via
            inline style; transitions kick in after the first render so the
            initial measurement doesn't animate from 0. */}
        <span
          ref={bubbleEl!}
          aria-hidden
          class="pointer-events-none absolute rounded-full bg-accent"
          style={{
            left: `${bubble()?.left ?? 0}px`,
            top: `${bubble()?.top ?? 0}px`,
            width: `${bubble()?.width ?? 0}px`,
            height: `${bubble()?.height ?? 0}px`,
            opacity: bubble() ? 1 : 0,
            // The slide morph + the press recoil are BOTH WAAPI overlays
            // (place() animates left/width; pulseBack animates transform),
            // composited on top of this resting geometry. So CSS only owns
            // the opacity fade — no transition on left/width to race the
            // WAAPI slide.
            transition: "opacity 200ms ease-out",
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
          badge={inviteCount()}
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
