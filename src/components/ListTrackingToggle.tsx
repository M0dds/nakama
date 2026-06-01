import { createSignal, createEffect } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { useAuth } from "@/lib/auth";
import {
  setListTracking,
  listQueryKey,
  listsQueryKey,
  type ListSummary,
} from "@/lib/queries/lists";
import { homeQueryKey } from "@/lib/queries/home";
import { calendarQueryKey } from "@/lib/queries/calendar";
import { Segmented } from "@/components/Segmented";

type TrackingValue = "track" | "archive";

/**
 * Per-user "Auf Home tracken"-Toggle (list_members.tracks_home). OFF =
 * archive: items in this list drop off MY Home / Kalender / Logbuch, even
 * if other members still track it. Other members keep their own setting
 * independently.
 *
 * Two-state pill (Tracken / Archiv), matches the styleguide's mode segment
 * control vocabulary. Optimistic: flips the moment you click; reverts if
 * RLS silently blocks the write (0 rows updated). Reason for the disabled
 * + tooltip-less state during pending: the visible state change ("pressed
 * the other one now") makes it obvious something happened.
 */
export function ListTrackingToggle(props: {
  /** UUID — what setListTracking's underlying UPDATE filters on. */
  listId: string;
  /** URL-stable identifier — what listQueryKey/listsQueryKey are keyed on. */
  shortCode: string;
  initialEnabled: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = createSignal(props.initialEnabled);

  createEffect(() => setEnabled(props.initialEnabled));

  const mutation = createMutation(() => ({
    mutationFn: (next: boolean) => {
      const u = auth.user();
      if (!u) throw new Error("Nicht eingeloggt.");
      return setListTracking(u, { listId: props.listId, enabled: next });
    },
    onMutate: (next) => {
      setEnabled(next);
      const prev = queryClient.getQueryData<ListSummary | null>(
        listQueryKey(props.shortCode),
      );
      if (prev) {
        queryClient.setQueryData(listQueryKey(props.shortCode), {
          ...prev,
          tracksHome: next,
        });
      }
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      setEnabled(props.initialEnabled);
      if (ctx?.prev !== undefined)
        queryClient.setQueryData(listQueryKey(props.shortCode), ctx.prev);
    },
    onSuccess: (res, next) => {
      if (res.tracksHome === null) {
        // No row updated (caller isn't a member) — revert.
        setEnabled(!next);
        queryClient.invalidateQueries({
          queryKey: listQueryKey(props.shortCode),
        });
        return;
      }
      // Overview cache reflects this list's tracksHome too — patch it so
      // the "· Archiv" suffix on /lists updates without a refetch.
      queryClient.setQueryData<{
        private: ListSummary[];
        shared: ListSummary[];
      } | undefined>(listsQueryKey, (prevState) => {
        if (!prevState) return prevState;
        const patch = (l: ListSummary) =>
          l.id === props.listId ? { ...l, tracksHome: res.tracksHome! } : l;
        return {
          private: prevState.private.map(patch),
          shared: prevState.shared.map(patch),
        };
      });
      // Archiving changes home scope (Was kommt / Fortsetzen / Logbuch) and
      // the calendar — but those aren't mounted while toggling on the list
      // page, so the home/calendar realtime channels never fire. Invalidate
      // explicitly so the change shows on next visit instead of after the
      // 5-min staleTime. trackedItemIds() already gates on tracks_home.
      queryClient.invalidateQueries({ queryKey: homeQueryKey });
      queryClient.invalidateQueries({ queryKey: calendarQueryKey });
    },
  }));

  return (
    <div class="mt-5 border-t border-border pt-5">
      <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
        Auf Home tracken
      </p>
      <Segmented<TrackingValue>
        ariaLabel="Auf Home tracken"
        value={enabled() ? "track" : "archive"}
        onChange={(v) => mutation.mutate(v === "track")}
        disabled={mutation.isPending}
        options={[
          { value: "track", label: "Tracken" },
          { value: "archive", label: "Archiv" },
        ]}
      />
      <p class="mt-2 text-mini text-text-muted">
        <span class="text-text">Tracken:</span> Einträge dieser Liste erscheinen
        in deinem Home, Kalender und Logbuch.{" "}
        <span class="text-text">Archiv:</span> die Liste bleibt erhalten, taucht
        dort aber nicht auf. Jedes Mitglied entscheidet für sich.
      </p>
    </div>
  );
}
