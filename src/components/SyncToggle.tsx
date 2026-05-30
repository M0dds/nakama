import { createSignal, Show } from "solid-js";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { Check, X } from "lucide-solid";
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
 * the item was opened FROM a specific list (listItemId via the list-scoped
 * route / link-state) AND that list is actually shared with ≥1 co-member — sync
 * is meaningless otherwise. Context (name, shared flag, member count) comes from
 * syncContextOptions(listItemId).
 *
 * Sync-instances model: turning sync ON starts a FRESH shared instance at 0 (no
 * backfill) — ticks from here write instance rows shared among the list's
 * members, while the caller's own global progress stays untouched. Turning OFF
 * (unsync_item) merges the instance back into every member's global progress
 * (Auto-Merge) and tears it down. Both are consequential, so a flip doesn't fire
 * immediately: clicking the Segmented previews the direction (bubble slides) and
 * an inline confirm explains the effect; only ✓ commits. Either committed flip
 * changes which lane this item's episode page reads (global ↔ instance), so we
 * invalidate the episodes + co-watcher + list-badge caches on success.
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

  // The committed/actual sync state, straight from the context query (the
  // mutation optimistically patches it, so this reacts on confirm).
  const enabled = () => ctx.data?.syncEnabled ?? false;
  // The direction the user picked but hasn't confirmed yet (null = nothing
  // pending). The Segmented bubble previews it; the inline confirm commits or
  // cancels.
  const [pending, setPending] = createSignal<boolean | null>(null);

  const mut = createMutation(() => ({
    mutationFn: (next: boolean) =>
      setItemSync({ listItemId: props.listItemId, enabled: next }),
    onMutate: (next) => {
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
    onError: (_e, _next, c) => {
      if (c?.prev !== undefined)
        qc.setQueryData(syncContextKey(props.listItemId), c.prev);
    },
    onSettled: () => setPending(null),
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

  // Picking the direction already shown = cancel; picking the other = arm the
  // confirm.
  const requestChange = (v: SyncValue) => {
    const next = v === "on";
    setPending(next === enabled() ? null : next);
  };
  const confirm = () => {
    const next = pending();
    if (next !== null) mut.mutate(next);
  };

  return (
    <Show when={ctx.data?.isShared && (ctx.data?.memberCount ?? 0) > 1}>
      <div class="mt-5 border-t border-border pt-5">
        <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
          Mit „{ctx.data!.listName}" synchronisieren
        </p>
        <Segmented<SyncValue>
          ariaLabel="Mit Mitgliedern synchronisieren"
          value={(pending() ?? enabled()) ? "on" : "off"}
          onChange={requestChange}
          disabled={mut.isPending}
          options={[
            { value: "on", label: "An" },
            { value: "off", label: "Aus" },
          ]}
        />

        <Show
          when={pending() !== null}
          fallback={
            <p class="mt-2 text-mini text-text-muted">
              An: ihr seht diesen Titel von vorne gemeinsam — eine frische,
              geteilte Spur ab null. Häkchen gelten dann für alle Mitglieder;
              dein eigener Stand bleibt davon unberührt. Beim Ausschalten fließt
              der gemeinsame Fortschritt in den Einzelstand jedes Mitglieds
              zurück.
            </p>
          }
        >
          {/* Inline confirm — explains the consequence of the picked direction,
              commits on ✓, cancels on ✗ (same vocabulary as ResetItemButton). */}
          <div class="mt-3">
            <p class="text-mini text-text-muted">
              {pending()
                ? "Frische gemeinsame Spur ab null — dein eigener Stand bleibt erhalten, Häkchen gelten ab jetzt für alle Mitglieder."
                : "Der gemeinsame Stand fließt in den Einzelstand jedes Mitglieds zurück. Nichts geht verloren."}
            </p>
            <div class="mt-2 flex items-center gap-2">
              <span class="flex-1 font-mono text-mini uppercase tracking-wider text-text-muted">
                {pending() ? "Synchronisierung starten?" : "Synchronisierung beenden?"}
              </span>
              <button
                type="button"
                aria-label={pending() ? "Ja, synchronisieren" : "Ja, beenden"}
                disabled={mut.isPending}
                onClick={confirm}
                class="inline-flex size-6 items-center justify-center rounded-xs bg-accent text-accent-on transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check class="size-3.5" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                aria-label="Abbrechen"
                disabled={mut.isPending}
                onClick={(e) => {
                  e.currentTarget.blur();
                  setPending(null);
                }}
                class="inline-flex size-6 items-center justify-center rounded-xs border border-border text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
              >
                <X class="size-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
