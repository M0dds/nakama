import { createSignal, createEffect, Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Pencil, Plus } from "lucide-solid";
import {
  updateListDescription,
  listQueryKey,
  type ListSummary,
} from "@/lib/queries/lists";

/**
 * Inline-editable list description, sized for the top of the Einträge module.
 * Sibling to EditableListName — same posture (hover lifts a pencil, click swaps
 * to an editor, optimistic patch, RLS-block revert) but multi-line (textarea)
 * and clearable: unlike the name, an empty value is legal and clears it.
 *
 * Owner-only (PRELAUNCH-2 / lists_update_owner): only the creator gets the edit
 * affordance — and an empty description shows a quiet "+ Beschreibung
 * hinzufügen" prompt so the owner can ADD one (the gap the feedback flagged:
 * a personal list's description couldn't be changed at all). Non-owners see the
 * text read-only, or nothing when it's empty.
 *
 * Only the detail cache (listQueryKey) is patched — the /lists overview doesn't
 * surface descriptions, so there's nothing to keep in sync there.
 */
export function EditableListDescription(props: {
  /** UUID — what the underlying UPDATE filters on. */
  listId: string;
  /** URL-stable identifier — what listQueryKey is keyed on. */
  shortCode: string;
  initialDescription: string | null;
  /** Only the owner gets the editor; others read-only (or nothing if empty). */
  isOwner: boolean;
}) {
  const queryClient = useQueryClient();
  const [desc, setDesc] = createSignal(props.initialDescription ?? "");
  const [draft, setDraft] = createSignal(props.initialDescription ?? "");
  const [editing, setEditing] = createSignal(false);
  let inputRef: HTMLTextAreaElement | undefined;

  // Resync when the cache patches the parent with a fresh value (realtime, or
  // another tab). Same pattern as EditableListName.
  createEffect(() => {
    setDesc(props.initialDescription ?? "");
    setDraft(props.initialDescription ?? "");
  });

  const detailKey = () => listQueryKey(props.shortCode);

  const mutation = createMutation(() => ({
    mutationFn: (next: string) =>
      updateListDescription({ listId: props.listId, description: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: detailKey() });
      const prev = queryClient.getQueryData<ListSummary | null>(detailKey());
      const value = next.trim() || null;
      if (prev)
        queryClient.setQueryData(detailKey(), { ...prev, description: value });
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev !== undefined)
        queryClient.setQueryData(detailKey(), ctx.prev);
      setDraft(desc());
    },
    onSuccess: (res) => {
      if (res.blocked) {
        // RLS silently blocked — revert the optimistic patch.
        queryClient.invalidateQueries({ queryKey: detailKey() });
        setDraft(desc());
        return;
      }
      setDesc(res.description ?? "");
    },
  }));

  const startEdit = () => {
    setDraft(desc());
    setEditing(true);
    queueMicrotask(() => inputRef?.focus());
  };

  const commit = () => {
    setEditing(false);
    const next = draft().trim();
    if (next === desc().trim()) {
      setDraft(desc());
      return;
    }
    mutation.mutate(next);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(desc());
  };

  return (
    <Show
      when={props.isOwner}
      fallback={
        // Non-owner: read-only, or nothing when empty.
        <Show when={desc()}>
          <p class="mb-5 whitespace-pre-line text-body text-text-muted">
            {desc()}
          </p>
        </Show>
      }
    >
      <Show
        when={editing()}
        fallback={
          <Show
            when={desc()}
            fallback={
              // Empty + owner: quiet "add description" prompt.
              <button
                type="button"
                onClick={startEdit}
                class="mb-5 inline-flex items-center gap-1.5 rounded-xs px-1 -ml-1 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                <Plus class="size-3.5" strokeWidth={1.75} aria-hidden />
                Beschreibung hinzufügen
              </button>
            }
          >
            <button
              type="button"
              onClick={startEdit}
              class="group mb-5 flex w-full items-start gap-2 rounded-xs px-1 -ml-1 text-left transition-colors hover:bg-surface"
            >
              <span class="whitespace-pre-line text-body text-text-muted transition-colors group-hover:text-text">
                {desc()}
              </span>
              <Pencil
                class="mt-1 size-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
                strokeWidth={1.75}
                aria-hidden
              />
            </button>
          </Show>
        }
      >
        <div class="mb-5">
          <textarea
            ref={inputRef!}
            rows={3}
            maxlength="500"
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              // Esc cancels; Cmd/Ctrl+Enter commits (plain Enter = newline).
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="Worum geht's in dieser Liste?"
            class="w-full resize-y rounded-xs bg-transparent px-1 -ml-1 text-body text-text outline-none ring-1 ring-accent placeholder:text-text-muted"
          />
          <p class="mt-1 px-1 -ml-1 font-mono text-mini text-text-muted">
            ⌘↵ speichern · Esc abbrechen
          </p>
        </div>
      </Show>
    </Show>
  );
}
