import { createSignal, Show } from "solid-js";
import { createMutation, useQueryClient } from "@tanstack/solid-query";
import { ListPlus } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import {
  createList,
  listsQueryKey,
  type ListSummary,
} from "@/lib/queries/lists";
import { Button } from "@/components/Button";

/**
 * Form: Name (required) + Description (optional). On submit, the mutation
 * fires; on success, `setQueryData` patches the lists cache so the new row
 * appears INSTANTLY on the overview without a refetch. We also invalidate
 * to let the realtime/refetch correct anything we got wrong.
 *
 * The submit button stays disabled while the name is empty + while the
 * mutation is in flight — disabled buttons need a tooltip explaining why
 * (handshake rule), but the pending state changes the button text to
 * "Lege an …" which is self-explanatory.
 */
export function CreateListForm() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  const mutation = createMutation(() => ({
    mutationFn: (input: { name: string; description?: string }) => {
      const u = auth.user();
      if (!u) throw new Error("Nicht eingeloggt.");
      return createList(u, input);
    },
    onSuccess: (newList: ListSummary) => {
      queryClient.setQueryData<
        { private: ListSummary[]; shared: ListSummary[] } | undefined
      >(listsQueryKey, (prev) => {
        if (!prev) return prev;
        return newList.isShared
          ? { ...prev, shared: [newList, ...prev.shared] }
          : { ...prev, private: [newList, ...prev.private] };
      });
      // Refetch in the background as a sanity-check against any optimistic
      // drift (counts, server-side computed fields).
      queryClient.invalidateQueries({ queryKey: listsQueryKey });
      toast(`Liste „${newList.name}“ erstellt.`, { icon: ListPlus });
      setName("");
      setDescription("");
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  }));

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (!name().trim()) return;
    mutation.mutate({
      name: name(),
      description: description() || undefined,
    });
  };

  const inputClass =
    "w-full rounded-sm border border-border bg-transparent px-3 py-2 text-body text-text outline-none transition-colors placeholder:text-text-muted focus:border-accent";
  const labelClass =
    "mb-1.5 block font-mono text-mini uppercase tracking-wider text-text-muted";

  return (
    <form onSubmit={onSubmit} class="space-y-3">
      <div>
        <label class={labelClass} for="list-name">
          Name
        </label>
        <input
          id="list-name"
          name="name"
          required
          maxlength="120"
          autocomplete="off"
          placeholder="z.B. Lieblings-Anime"
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
          class={inputClass}
        />
      </div>
      <div>
        <label class={labelClass} for="list-desc">
          Beschreibung · optional
        </label>
        <input
          id="list-desc"
          name="description"
          maxlength="500"
          autocomplete="off"
          placeholder="Kurzer Hinweis worum es geht"
          value={description()}
          onInput={(e) => setDescription(e.currentTarget.value)}
          class={inputClass}
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={!name().trim() || mutation.isPending}
        class="w-full"
      >
        {mutation.isPending ? "Lege an …" : "Liste anlegen"}
      </Button>

      <Show when={error()}>
        <p role="status" class="text-mini text-accent">
          {error()}
        </p>
      </Show>
    </form>
  );
}
