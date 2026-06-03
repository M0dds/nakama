import { createSignal, createEffect, Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Pencil } from "lucide-solid";
import {
  renameList,
  listsQueryKey,
  listQueryKey,
  type ListSummary,
} from "@/lib/queries/lists";

/**
 * Inline-renameable list name, sized for the PageHeader title slot. Hover
 * lifts a pencil icon + colors the text accent; clicking swaps to an input
 * in the same heading typo. Enter / blur commits, Escape reverts. Empty
 * names are silently rejected (no destructive write).
 *
 * Owner-only (PRELAUNCH-2): only the list creator may rename — RLS
 * (lists_update_owner) enforces it, and we hide the edit affordance for
 * non-owners so they never hit a silent revert. The mutation `.select()`s
 * the persisted name back; if RLS silently blocked the write (0 rows, no
 * error) the returned name is null and we revert the optimistic patch.
 */
export function EditableListName(props: {
  /** UUID — what renameList's underlying UPDATE filters on. */
  listId: string;
  /** URL-stable identifier — what listQueryKey is keyed on. */
  shortCode: string;
  initialName: string;
  /** Only the owner gets the inline-edit affordance; others see it read-only. */
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = createSignal(props.initialName);
  const [draft, setDraft] = createSignal(props.initialName);
  const [editing, setEditing] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  // Resync if SSR-prop-equivalent changes (e.g. realtime patches the cache
  // and the parent re-renders with a fresh initialName). Solid analogue of
  // the React useEffect([initialName]) sync pattern.
  createEffect(() => {
    setName(props.initialName);
    setDraft(props.initialName);
  });

  const mutation = createMutation(() => ({
    mutationFn: (next: string) => renameList({ listId: props.listId, name: next }),
    onMutate: async (next) => {
      // Optimistic patch: update both the detail cache + the list-in-overview
      // immediately so the heading swaps in 0 ms. We rollback in onError.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listQueryKey(props.shortCode) }),
        queryClient.cancelQueries({ queryKey: listsQueryKey }),
      ]);
      const prevDetail = queryClient.getQueryData<ListSummary | null>(
        listQueryKey(props.shortCode),
      );
      const prevOverview = queryClient.getQueryData<{
        private: ListSummary[];
        shared: ListSummary[];
      }>(listsQueryKey);

      if (prevDetail)
        queryClient.setQueryData(listQueryKey(props.shortCode), {
          ...prevDetail,
          name: next,
        });
      if (prevOverview) {
        const patch = (l: ListSummary) =>
          l.id === props.listId ? { ...l, name: next } : l;
        queryClient.setQueryData(listsQueryKey, {
          private: prevOverview.private.map(patch),
          shared: prevOverview.shared.map(patch),
        });
      }
      return { prevDetail, prevOverview };
    },
    onError: (_e, _next, ctx) => {
      // Rollback both caches to their pre-mutation snapshots.
      if (ctx?.prevDetail !== undefined)
        queryClient.setQueryData(listQueryKey(props.shortCode), ctx.prevDetail);
      if (ctx?.prevOverview !== undefined)
        queryClient.setQueryData(listsQueryKey, ctx.prevOverview);
      setDraft(name());
    },
    onSuccess: (res, next) => {
      if (res.name === null) {
        // RLS silently blocked — revert the optimistic patch.
        queryClient.invalidateQueries({
          queryKey: listQueryKey(props.shortCode),
        });
        queryClient.invalidateQueries({ queryKey: listsQueryKey });
        setDraft(name());
        return;
      }
      setName(next);
    },
  }));

  const startEdit = () => {
    setDraft(name());
    setEditing(true);
    // After the input mounts, focus + select all so typing replaces.
    queueMicrotask(() => inputRef?.select());
  };

  const commit = () => {
    setEditing(false);
    const next = draft().trim();
    if (!next || next === name()) {
      setDraft(name());
      return;
    }
    mutation.mutate(next);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(name());
  };

  return (
    <Show
      when={props.isOwner}
      fallback={
        // Non-owner: read-only heading, same typo as the editable display so
        // the title baseline is identical whether or not you can rename.
        <span class="-ml-1 inline-flex items-center px-1 text-heading font-medium tracking-tight text-text">
          {name()}
        </span>
      }
    >
    <Show
      when={editing()}
      fallback={
        // No border on the display button — the input below uses `ring`
        // (a box-shadow, draws OUTSIDE the box) instead of a real border,
        // so swapping between states doesn't shift the heading by a pixel.
        // That also keeps the heading height identical to the plain <h1>
        // used on routes like /lists, so navigating in/out reads as one
        // continuous baseline.
        <button
          type="button"
          onClick={startEdit}
          class="group inline-flex items-center gap-2 rounded-xs px-1 -ml-1 text-heading font-medium tracking-tight text-text transition-colors hover:bg-surface hover:text-accent"
        >
          <span>{name()}</span>
          <Pencil
            class="size-4 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={1.75}
          />
        </button>
      }
    >
      <input
        ref={inputRef!}
        type="text"
        maxlength="120"
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        class="-ml-1 w-full max-w-md rounded-xs bg-transparent px-1 text-heading font-medium tracking-tight text-text outline-none ring-1 ring-accent"
        autofocus
      />
    </Show>
    </Show>
  );
}
