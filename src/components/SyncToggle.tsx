import { createEffect, createSignal, Show } from "solid-js";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { episodesQueryKey } from "@/lib/queries/episodes";
import { listsQueryKey } from "@/lib/queries/lists";
import {
  coWatchersKey,
  setItemSync,
  syncContextKey,
  syncContextOptions,
  type SyncContext,
} from "@/lib/queries/sharing";
import { Segmented } from "@/components/Segmented";

type SyncValue = "on" | "off";

/**
 * Per-item sync toggle on the item-detail Details module. Only rendered when
 * the item was opened FROM a specific list (listItemId in the router link
 * state) AND that list is actually shared with ≥1 co-member — sync is
 * meaningless otherwise. The context (name, shared flag, member count) comes
 * from syncContextOptions(listItemId).
 *
 * Sync-instances model: turning sync ON starts a FRESH shared instance at 0
 * (no backfill) — ticks from here write instance rows shared among the list's
 * members, while the caller's own global progress stays untouched. Turning OFF
 * (unsync_item) merges the instance back into every member's global progress
 * (Auto-Merge) and tears it down. Either flip changes which lane this item's
 * episode page reads (global ↔ instance), so we invalidate the episodes +
 * co-watcher + list-badge caches on success in both directions.
 */
export function SyncToggle(props: {
  listItemId: string;
  itemId: string;
  type: string;
  slug: string;
}) {
  const qc = useQueryClient();

  const ctx = createQuery(() => ({
    ...syncContextOptions(props.listItemId),
    enabled: !!props.listItemId,
  }));

  const [enabled, setEnabled] = createSignal(false);
  createEffect(() => {
    if (ctx.data) setEnabled(ctx.data.syncEnabled);
  });

  const mut = createMutation(() => ({
    mutationFn: (next: boolean) =>
      setItemSync({ listItemId: props.listItemId, enabled: next }),
    onMutate: (next) => {
      setEnabled(next);
      const prev = qc.getQueryData<SyncContext | null>(
        syncContextKey(props.listItemId),
      );
      if (prev)
        qc.setQueryData(syncContextKey(props.listItemId), {
          ...prev,
          syncEnabled: next,
        });
      return { prev };
    },
    onError: (_e, next, c) => {
      setEnabled(!next);
      if (c?.prev !== undefined)
        qc.setQueryData(syncContextKey(props.listItemId), c.prev);
    },
    onSuccess: () => {
      // Both directions move watch state: enable switches this item's episode
      // page from the global lane to a fresh empty instance; disable merges the
      // instance back into everyone's global progress. Refresh everything that
      // reads this item's watches either way (the episodes query keys on the
      // lane, so the prefix invalidation clears global + instance entries).
      void qc.invalidateQueries({ queryKey: syncContextKey(props.listItemId) });
      void qc.invalidateQueries({
        queryKey: episodesQueryKey(props.type, props.slug),
      });
      void qc.invalidateQueries({ queryKey: coWatchersKey(props.itemId) });
      void qc.invalidateQueries({ queryKey: listsQueryKey });
      void qc.invalidateQueries({ queryKey: ["list"] });
    },
  }));

  return (
    <Show when={ctx.data?.isShared && (ctx.data?.memberCount ?? 0) > 1}>
      <div class="mt-5 border-t border-border pt-5">
        <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
          Mit „{ctx.data!.listName}" synchronisieren
        </p>
        <Segmented<SyncValue>
          ariaLabel="Mit Mitgliedern synchronisieren"
          value={enabled() ? "on" : "off"}
          onChange={(v) => mut.mutate(v === "on")}
          disabled={mut.isPending}
          options={[
            { value: "on", label: "An" },
            { value: "off", label: "Aus" },
          ]}
        />
        <p class="mt-2 text-mini text-text-muted">
          An: ihr seht diesen Titel von vorne gemeinsam — eine frische,
          geteilte Spur ab null. Häkchen gelten dann für alle Mitglieder; dein
          eigener Stand bleibt davon unberührt. Beim Ausschalten fließt der
          gemeinsame Fortschritt in den Einzelstand jedes Mitglieds zurück.
        </p>
      </div>
    </Show>
  );
}
