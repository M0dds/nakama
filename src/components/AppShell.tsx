import { createSignal, Show, type ParentProps } from "solid-js";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";

/**
 * Layout wrapper for every authed app surface (Home, Listen, Detailseiten,
 * Profil). Mounted ONCE by the AppLayout route — see src/routes/index.tsx —
 * so the BottomNav + AddSheet plumbing survives navigation between protected
 * surfaces. Adds the bottom safe-area so the last content row isn't covered
 * by the floating nav pill.
 *
 * The grain layer + base color come from <App> in src/App.tsx — every route
 * lands inside that wrapper. AppShell only adds the nav-aware spacing + the
 * `+`-button affordance.
 */
export function AppShell(props: ParentProps) {
  // AddSheet state lives here so the `+` button in the floating nav can
  // open it regardless of which route is showing. The sheet itself reads
  // the current path to pre-select the target list when relevant.
  const [addOpen, setAddOpen] = createSignal(false);

  return (
    <>
      {/* Add space at the bottom equal to nav height (44 px) + bottom offset
          (26 px) + breathing (24 px). The pill is `position: fixed` so it
          doesn't reserve flow space on its own. */}
      <div class="pb-[94px]">{props.children}</div>
      <BottomNav onAddClick={() => setAddOpen(true)} />
      <Show when={addOpen()}>
        <AddSheet onClose={() => setAddOpen(false)} />
      </Show>
    </>
  );
}
