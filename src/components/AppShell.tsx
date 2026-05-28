import type { ParentProps } from "solid-js";
import { BottomNav } from "@/components/BottomNav";

/**
 * Layout wrapper for every authed app surface (Home, Listen, Detailseiten,
 * Profil). Adds the floating BottomNav and a bottom safe-area on the content
 * so the last row isn't obscured by the pill. Login + AuthCallback +
 * Styleguide live OUTSIDE this shell (no nav).
 *
 * The grain layer + base color come from <App> in src/App.tsx — every route
 * lands inside that wrapper. AppShell only adds the nav-aware spacing.
 */
export function AppShell(props: ParentProps) {
  return (
    <>
      {/* Add space at the bottom equal to nav height (44 px) + bottom offset
          (26 px) + breathing (24 px). The pill is `position: fixed` so it
          doesn't reserve flow space on its own. */}
      <div class="pb-[94px]">{props.children}</div>
      <BottomNav />
    </>
  );
}
