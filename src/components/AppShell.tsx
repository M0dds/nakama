import { createSignal, onMount, Show, type ParentProps } from "solid-js";
import { BottomNav } from "@/components/BottomNav";
import { AddSheet } from "@/components/AddSheet";
import { ContentFrame } from "@/components/ContentFrame";
import { ReleaseNotesDialog } from "@/components/ReleaseNotesDialog";
import { PwaUpdater } from "@/components/PwaUpdater";
import { ToastProvider } from "@/lib/toast";
import { APP_VERSION } from "@/lib/version";
import { compareVersions, latestNote } from "@/lib/release-notes";

const LAST_SEEN_VERSION_KEY = "nakama:last-seen-version";

/**
 * Layout wrapper for every authed app surface (Home, Listen, Detailseiten,
 * Profil). Mounted ONCE by the AppLayout route — see src/routes/index.tsx —
 * so the BottomNav + AddSheet plumbing survives navigation between protected
 * surfaces.
 *
 * Two distinct states for the AddSheet, so the nav-pill ↔ search-pill morph
 * stays a SINGLE continuous animation in both directions:
 *
 *   - addMounted  controls whether <AddSheet> is in the DOM at all. We keep
 *                 it mounted for ~300ms after the user closes, so the exit
 *                 animation can play to completion.
 *   - addVisible  controls what the morph "looks like" — it flips synchronously
 *                 with the user's intent (open/close click), so the nav-pill
 *                 starts fading in/out in lockstep with the search-pill's
 *                 morph in the AddSheet. Without this split, the nav would
 *                 only start fading back IN after AddSheet had already
 *                 finished unmounting — two sequential animations instead
 *                 of one, which reads as a flash/flicker on close.
 */
export function AppShell(props: ParentProps) {
  const [addMounted, setAddMounted] = createSignal(false);
  const [addVisible, setAddVisible] = createSignal(false);
  // 500ms with ease-quart in both directions — entry plays forward, exit
  // plays the same curve in reverse. Symmetric feel, predictable timing.
  const ANIM_MS = 500;

  const openAdd = () => {
    setAddMounted(true);
    // Double-rAF: a single rAF isn't enough in Solid's render loop. With one
    // rAF the browser may apply BOTH the mount and the visible-flip styles
    // in the same frame, skipping the initial (scale-50 + opacity-0) state
    // entirely — the card then "just appears" instead of animating in. Two
    // rAFs guarantee one paint of the initial state before we trigger the
    // transition, so CSS interpolates from "small + invisible" → "big +
    // visible" properly.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setAddVisible(true));
    });
  };

  const closeAdd = () => {
    if (!addVisible()) return; // ignore double-close while fade-out is in flight
    setAddVisible(false);
    window.setTimeout(() => setAddMounted(false), ANIM_MS);
  };

  // ── "Was ist neu" auto-open ──────────────────────────────────────────────
  // Compare the running version against the one the user last saw. On a real
  // forward bump (and only when a changelog entry exists for it) the dialog
  // pops once; we then record the new version so it won't repeat.
  //
  // A null/missing key means "never recorded" — a brand-new user (fresh signup)
  // or someone from before this feature shipped. We seed silently WITHOUT
  // popping: the "freshly updated" framing only makes sense for a returning
  // user, and a first-launch user just finished onboarding. The full history
  // stays reachable manually via the profile version label.
  const [notesOpen, setNotesOpen] = createSignal(false);

  onMount(() => {
    const latest = latestNote();
    if (!latest) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    } catch {
      return; // storage blocked → skip, never block the app
    }
    const stamp = () => {
      try {
        localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION);
      } catch {
        /* ignore */
      }
    };
    if (seen === null) {
      stamp(); // first run → seed silently
      return;
    }
    if (
      compareVersions(APP_VERSION, seen) > 0 &&
      latest.version === APP_VERSION
    ) {
      setNotesOpen(true);
      stamp();
    }
  });

  return (
    <ToastProvider>
      {/* Centered, width-capped content frame (--content-max). On wide screens
          the page no longer sprawls edge-to-edge; the ColumnGuide stays
          full-bleed and re-aligns to this frame's 2/3 boundary. Bottom padding
          = nav height (44 px) + offset (26 px) + breathing (24 px); the pill is
          `position: fixed` so it doesn't reserve flow space itself. */}
      <div class="mx-auto w-full max-w-[var(--content-max)] pb-[94px]">
        {props.children}
      </div>
      <ContentFrame />
      <BottomNav onAddClick={openAdd} addSheetOpen={addVisible()} />
      <Show when={addMounted()}>
        <AddSheet visible={addVisible()} onClose={closeAdd} />
      </Show>
      <ReleaseNotesDialog
        open={notesOpen()}
        onClose={() => setNotesOpen(false)}
      />
      <PwaUpdater />
    </ToastProvider>
  );
}
