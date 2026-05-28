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
 * Liquid sliding accent indicator + back-button satellite (out of the
 * pill's left edge on detail routes) are deliberately deferred — they're
 * polish, not blockers, and the liquid measurement needs more thought in
 * Solid (where useEffect-style observers behave differently). For now the
 * active tab gets a simple accent fill via NavButton.
 */
export function BottomNav(props: { onAddClick?: () => void }) {
  const location = useLocation();
  const isActive = (href: string) => location.pathname === href;

  return (
    <nav
      aria-label="Hauptnavigation"
      class="fixed inset-x-0 bottom-[26px] z-40 flex justify-center px-4"
    >
      <div class="flex items-center gap-1 rounded-full bg-nav-bg p-1.5 shadow-floating">
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
