import { createSignal, createEffect } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { useAuth } from "@/lib/auth";
import {
  setListTracking,
  listQueryKey,
  listsQueryKey,
  type ListSummary,
} from "@/lib/queries/lists";
import { cn } from "@/lib/cn";

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
        // RLS silently blocked — revert.
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
    },
  }));

  const pick = (next: boolean) => {
    if (next === enabled() || mutation.isPending) return;
    mutation.mutate(next);
  };

  const optionClass = (active: boolean) =>
    cn(
      "rounded-xs px-3 py-1.5 font-mono text-mini uppercase tracking-wider transition-colors",
      active ? "bg-text text-bg" : "text-text-muted hover:text-text",
    );

  return (
    <div class="mt-5 border-t border-border pt-5">
      <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
        Auf Home tracken
      </p>
      <div class="inline-flex rounded-sm border border-border p-0.5">
        <button
          type="button"
          aria-pressed={enabled()}
          onClick={() => pick(true)}
          class={optionClass(enabled())}
        >
          Tracken
        </button>
        <button
          type="button"
          aria-pressed={!enabled()}
          onClick={() => pick(false)}
          class={optionClass(!enabled())}
        >
          Archiv
        </button>
      </div>
      <p class="mt-2 text-mini text-text-muted">
        Off bedeutet: Einträge dieser Liste fallen aus DEINEM Home, Kalender
        und Logbuch raus. Andere Mitglieder entscheiden für sich.
      </p>
    </div>
  );
}
