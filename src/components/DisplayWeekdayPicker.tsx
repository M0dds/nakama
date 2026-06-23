import { createSignal, For, Show } from "solid-js";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { useAuth } from "@/lib/auth";
import { WEEKDAY_OPTIONS } from "@/lib/format";
import {
  globalDisplayPrefsKey,
  globalDisplayPrefsOptions,
  setGlobalDisplayWeekday,
  setInstanceDisplayWeekday,
} from "@/lib/queries/display-prefs";
import { syncContextKey } from "@/lib/queries/sharing";
import { homeQueryKey } from "@/lib/queries/home";
import { calendarQueryKey } from "@/lib/queries/calendar";
import { listsQueryKey } from "@/lib/queries/lists";

const FULL_DAY: Record<number, string> = {
  0: "Sonntag",
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
};

/**
 * "Anzeige-Tag" picker on the item-detail Details module (series / anime). Snaps
 * an item's *availability signal* — "Was kommt", calendar, and the new-episode
 * badge — to a chosen weekday: the first such weekday on/after the real release.
 * Fixes the regional drop ("From" airs US-Sun, here Mon) and a group's watch
 * night ("wir schauen freitags"). The episode list keeps the real air dates.
 *
 * Lane-aware, mirroring the sync model: on a synced instance the value is
 * GROUP-shared (instanceLI set → written via the member-scoped RPC, read from
 * syncContext); otherwise it's the viewer's PER-USER global override. The same
 * control edits whichever lane the detail page is currently in.
 */
export function DisplayWeekdayPicker(props: {
  itemId: string;
  /** Synced instance to write (group-shared), or null → per-user global lane. */
  instanceLI: string | null;
  /** Current group-shared weekday for the synced instance (from syncContext). */
  instanceWeekday: number | null;
}) {
  const auth = useAuth();
  const qc = useQueryClient();

  // Global-lane value comes from the per-user batch; only needed off-instance.
  const globalPrefs = createQuery(() => ({
    ...globalDisplayPrefsOptions(auth.user()!),
    enabled: !!auth.user() && !props.instanceLI,
  }));

  // Optimistic override (undefined = none; null is a valid "cleared" value).
  const [optimistic, setOptimistic] = createSignal<number | null | undefined>(
    undefined,
  );

  const current = (): number | null => {
    const o = optimistic();
    if (o !== undefined) return o;
    if (props.instanceLI) return props.instanceWeekday;
    return globalPrefs.data?.get(props.itemId) ?? null;
  };

  const mut = createMutation(() => ({
    mutationFn: (weekday: number | null) =>
      props.instanceLI
        ? setInstanceDisplayWeekday(props.instanceLI, weekday)
        : setGlobalDisplayWeekday(auth.user()!.id, props.itemId, weekday),
    onMutate: (weekday: number | null) => setOptimistic(weekday),
    onError: () => setOptimistic(undefined),
    onSettled: () => {
      setOptimistic(undefined);
      const uid = auth.user()?.id;
      if (uid)
        void qc.invalidateQueries({ queryKey: globalDisplayPrefsKey(uid) });
      if (props.instanceLI)
        void qc.invalidateQueries({
          queryKey: syncContextKey(props.instanceLI),
        });
      // The availability signal these feed depends on the override.
      void qc.invalidateQueries({ queryKey: homeQueryKey });
      void qc.invalidateQueries({ queryKey: calendarQueryKey });
      void qc.invalidateQueries({ queryKey: listsQueryKey });
      void qc.invalidateQueries({ queryKey: ["list"] });
    },
  }));

  // Re-tapping the active day clears the override.
  const pick = (w: number) => mut.mutate(current() === w ? null : w);

  return (
    <div class="mt-5 border-t border-border pt-5">
      <p class="mb-3 flex items-baseline justify-between gap-3 font-mono text-mini uppercase tracking-wider text-text-muted">
        <span>Anzeige-Tag</span>
        <span class="text-text-muted/70">
          {props.instanceLI ? "für die Gruppe" : "nur für dich"}
        </span>
      </p>
      <div class="flex gap-1">
        <For each={WEEKDAY_OPTIONS}>
          {(opt) => (
            <button
              type="button"
              onClick={() => pick(opt.value)}
              aria-pressed={current() === opt.value}
              class="h-8 flex-1 rounded-xs border font-mono text-mini font-medium uppercase tracking-wider transition-colors"
              classList={{
                "border-accent bg-accent text-accent-on":
                  current() === opt.value,
                "border-border text-text-muted hover:bg-surface hover:text-text":
                  current() !== opt.value,
              }}
            >
              {opt.label}
            </button>
          )}
        </For>
      </div>
      <p class="mt-2 text-mini text-text-muted">
        <Show
          when={current() !== null}
          fallback="Neue Folgen erscheinen am echten Erscheinungstag."
        >
          „Was kommt", Kalender & Badge zeigen neue Folgen am{" "}
          {FULL_DAY[current()!]} (erster {FULL_DAY[current()!]} nach Release).
        </Show>
      </p>
    </div>
  );
}
