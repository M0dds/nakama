import { createSignal, createEffect, Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { Pencil } from "lucide-solid";
import { useToast } from "@/lib/toast";
import {
  updateDisplayName,
  myProfileKey,
  type MyProfile,
} from "@/lib/queries/profile";

/**
 * Inline-editable display name for the Profil identity block. Mirrors
 * `EditableListName` — hover lifts a pencil, click swaps to an input in the
 * same body-lg typo, Enter/blur commits, Escape reverts — but writes
 * `profiles.display_name` (self only, profiles_update_own RLS) and patches the
 * `myProfileKey` cache optimistically.
 *
 * Unlike a list name, an empty value is allowed: it clears display_name to
 * null and the line falls back to showing the @handle (passed in so the empty
 * state still reads as the user's identity, not a blank).
 */
export function EditableDisplayName(props: {
  userId: string;
  /** Current display_name, or null if unset. */
  initialName: string | null;
  /** Bare @handle (no leading @) — the empty-state fallback + placeholder. */
  handle: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = createSignal(props.initialName);
  const [draft, setDraft] = createSignal(props.initialName ?? "");
  const [editing, setEditing] = createSignal(false);
  let inputRef: HTMLInputElement | undefined;

  // Resync when the cache patches in a fresh value (e.g. another tab edits).
  createEffect(() => {
    setName(props.initialName);
    if (!editing()) setDraft(props.initialName ?? "");
  });

  const key = () => myProfileKey(props.userId);

  const mutation = createMutation(() => ({
    mutationFn: (next: string | null) =>
      updateDisplayName({ userId: props.userId, displayName: next }),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: key() });
      const prev = queryClient.getQueryData<MyProfile | null>(key());
      queryClient.setQueryData<MyProfile | null>(key(), (p) =>
        p ? { ...p, displayName: next } : p,
      );
      return { prev };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(key(), ctx.prev);
      setDraft(name() ?? "");
      toast("Name konnte nicht gespeichert werden.");
    },
    onSuccess: (res, next) => {
      if (res.blocked) {
        // RLS silently dropped the write — revert to server truth.
        queryClient.invalidateQueries({ queryKey: key() });
        setDraft(name() ?? "");
        toast("Name konnte nicht gespeichert werden.");
        return;
      }
      setName(next);
    },
  }));

  const startEdit = () => {
    setDraft(name() ?? "");
    setEditing(true);
    queueMicrotask(() => inputRef?.select());
  };

  const commit = () => {
    setEditing(false);
    const next = draft().trim();
    const normalized = next.length > 0 ? next : null;
    if (normalized === (name() ?? null)) {
      setDraft(name() ?? "");
      return;
    }
    mutation.mutate(normalized);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(name() ?? "");
  };

  return (
    <Show
      when={editing()}
      fallback={
        <button
          type="button"
          onClick={startEdit}
          class="group -ml-1 inline-flex max-w-full items-center gap-2 rounded-xs px-1 text-left transition-colors hover:bg-surface"
        >
          <span
            class="truncate font-mono text-body-lg font-medium transition-colors group-hover:text-accent"
            classList={{
              "text-text": name() != null,
              "text-text-muted": name() == null,
            }}
          >
            {name() ?? `@${props.handle}`}
          </span>
          <Pencil
            class="size-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
            strokeWidth={1.75}
          />
        </button>
      }
    >
      <input
        ref={inputRef!}
        type="text"
        value={draft()}
        placeholder={`@${props.handle}`}
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
        class="-ml-1 w-full max-w-xs rounded-xs bg-transparent px-1 font-mono text-body-lg font-medium text-text outline-none ring-1 ring-accent placeholder:text-text-muted"
        autofocus
      />
    </Show>
  );
}
