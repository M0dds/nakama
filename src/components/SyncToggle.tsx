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
 * Turning sync ON runs backfill_sync_for_list_item server-side, which unions
 * every member's existing watches for this item — so both sides land in
 * lock-step (now AND in the past). That changes the caller's own watched set,
 * so we invalidate the episodes + co-watcher + list-badge caches on success.
 * Turning OFF is non-destructive (no watches are removed).
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
    onSuccess: (_void, next) => {
      void qc.invalidateQueries({ queryKey: syncContextKey(props.listItemId) });
      if (next) {
        // Backfill merged watches in — refresh everything that reads them.
        void qc.invalidateQueries({
          queryKey: episodesQueryKey(props.type, props.slug),
        });
        void qc.invalidateQueries({ queryKey: coWatchersKey(props.itemId) });
        void qc.invalidateQueries({ queryKey: listsQueryKey });
        void qc.invalidateQueries({ queryKey: ["list"] });
      }
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
          An: euer Fortschritt bleibt im Gleichschritt — Häkchen, die du oder
          Mitglieder setzen, gelten für alle. Beim Einschalten wird bestehender
          Fortschritt zusammengeführt.
        </p>
      </div>
    </Show>
  );
}
