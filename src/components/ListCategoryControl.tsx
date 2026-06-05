import { createSignal, createEffect, Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import {
  updateListCategory,
  listQueryKey,
  listsQueryKey,
  LIST_CATEGORIES,
  type ListCategory,
  type ListSummary,
} from "@/lib/queries/lists";
import { useToast } from "@/lib/toast";
import { Segmented } from "@/components/Segmented";

type CategoryValue = ListCategory | "all";

const categoryLabel = (cat: ListCategory | null): string =>
  cat ? LIST_CATEGORIES.find((c) => c.value === cat)?.label ?? cat : "Alle";

/**
 * The list's media category (F9). Owner-only edit via the shared liquid
 * Segmented (Alle · Anime · Manga · Serien · Filme · Spiele) — writes ride the
 * owner-only `lists_update_owner` policy, so a non-owner sees it read-only (and
 * only when a real category is set; an "Alle" list shows nothing to them).
 *
 * Optimistic: flips the local + both cache lanes (single-list detail AND the
 * overview, so /lists re-sections live), reverts if the write is RLS-blocked.
 *
 * dulden + warnen: setting a category never touches existing entries — if some
 * don't match the new category, they stay, and a toast just names how many.
 */
export function ListCategoryControl(props: {
  /** UUID — what updateListCategory's UPDATE filters on. */
  listId: string;
  /** URL-stable identifier — what listQueryKey/listsQueryKey are keyed on. */
  shortCode: string;
  initialCategory: ListCategory | null;
  isOwner: boolean;
  /** How many current entries DON'T match a prospective category — drives the
   *  dulden+warnen toast. Supplied by the parent, which holds the items query. */
  countMismatched: (cat: ListCategory) => number;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [category, setCategory] = createSignal<ListCategory | null>(
    props.initialCategory,
  );
  createEffect(() => setCategory(props.initialCategory));

  const mutation = createMutation(() => ({
    mutationFn: (next: ListCategory | null) =>
      updateListCategory({ listId: props.listId, category: next }),
    onMutate: (next) => {
      setCategory(next);
      const prevSingle = queryClient.getQueryData<ListSummary | null>(
        listQueryKey(props.shortCode),
      );
      if (prevSingle) {
        queryClient.setQueryData(listQueryKey(props.shortCode), {
          ...prevSingle,
          category: next,
        });
      }
      // Patch the overview too, so /lists re-sections without waiting for the
      // realtime/refetch round-trip.
      const prevOverview = queryClient.getQueryData<{
        private: ListSummary[];
        shared: ListSummary[];
      }>(listsQueryKey);
      if (prevOverview) {
        const patch = (l: ListSummary) =>
          l.id === props.listId ? { ...l, category: next } : l;
        queryClient.setQueryData(listsQueryKey, {
          private: prevOverview.private.map(patch),
          shared: prevOverview.shared.map(patch),
        });
      }
      return { prevSingle, prevOverview };
    },
    onError: (_e, _next, ctx) => {
      setCategory(props.initialCategory);
      if (ctx?.prevSingle !== undefined)
        queryClient.setQueryData(listQueryKey(props.shortCode), ctx.prevSingle);
      if (ctx?.prevOverview !== undefined)
        queryClient.setQueryData(listsQueryKey, ctx.prevOverview);
    },
    onSuccess: (res, next) => {
      if (res.blocked) {
        // No row updated (RLS — not the owner). The control only renders the
        // editor for the owner, so this is a defensive revert.
        setCategory(props.initialCategory);
        void queryClient.invalidateQueries({
          queryKey: listQueryKey(props.shortCode),
        });
        return;
      }
      // dulden + warnen — existing mismatched entries are kept; name them.
      if (next) {
        const n = props.countMismatched(next);
        if (n > 0) {
          toast(
            `${n} ${n === 1 ? "Eintrag passt" : "Einträge passen"} nicht zu „${categoryLabel(next)}“ — sie bleiben erhalten.`,
          );
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: listQueryKey(props.shortCode),
      });
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
    },
  }));

  const options = [{ value: "all" as const, label: "Alle" }, ...LIST_CATEGORIES];
  const value = (): CategoryValue => category() ?? "all";

  return (
    <Show when={props.isOwner || category()}>
      <div class="mt-5 border-t border-border pt-5">
        <p class="mb-3 font-mono text-mini uppercase tracking-wider text-text-muted">
          Kategorie
        </p>
        <Show
          when={props.isOwner}
          fallback={<p class="text-body text-text">{categoryLabel(category())}</p>}
        >
          <Segmented<CategoryValue>
            fill
            ariaLabel="Kategorie"
            value={value()}
            onChange={(v) => mutation.mutate(v === "all" ? null : v)}
            disabled={mutation.isPending}
            options={options}
          />
          <p class="mt-2 text-mini text-text-muted">
            Legt fest, was in die Liste darf. „Alle" = keine Beschränkung; die
            Liste steht dann unter „Meine Listen".
          </p>
        </Show>
      </div>
    </Show>
  );
}
