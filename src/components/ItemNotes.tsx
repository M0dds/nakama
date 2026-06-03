import { createSignal, For, Match, Show, Switch } from "solid-js";
import { createMutation, createQuery, useQueryClient } from "@tanstack/solid-query";
import { ExternalLink, Link2, Type, X } from "lucide-solid";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { UserChip } from "@/components/UserChip";
import {
  addLinkNote,
  addTextNote,
  deleteNote,
  itemNotesKey,
  itemNotesOptions,
  normalizeUrl,
  type ItemNote,
} from "@/lib/queries/notes";

/**
 * Shared notes board for one (list, item) — section 03 on the item detail page.
 * A list of blocks: free text or a named link rendered as a clickable pill.
 * Shared with the list's members (RLS); each member adds blocks and removes
 * their own. Optimistic add/delete with a realtime-backed refetch; deletes can
 * be undone from a toast (low-stakes, so no confirm dialog).
 *
 * Only mounted when the item has a list context (the parent gates on listId) —
 * the global item page has no single list to attach a board to.
 */
export function ItemNotes(props: { listId: string; itemId: string }) {
  const auth = useAuth();
  const qc = useQueryClient();
  const toast = useToast();

  const notes = createQuery(() => ({
    ...itemNotesOptions(auth.user()!, props.listId, props.itemId),
    enabled: !!auth.user(),
  }));

  const key = () => itemNotesKey(props.listId, props.itemId);
  const invalidate = () => qc.invalidateQueries({ queryKey: key() });

  // ── Add (optimistic append) ──────────────────────────────────────────────
  const optimisticAppend = (n: ItemNote) => {
    qc.setQueryData<ItemNote[]>(key(), (old) => [...(old ?? []), n]);
  };

  const addText = createMutation(() => ({
    mutationFn: (text: string) =>
      addTextNote({
        user: auth.user()!,
        listId: props.listId,
        itemId: props.itemId,
        text,
      }),
    onError: () => toast("Notiz konnte nicht gespeichert werden."),
    onSettled: () => invalidate(),
  }));

  const addLink = createMutation(() => ({
    mutationFn: (v: { label: string; url: string }) =>
      addLinkNote({
        user: auth.user()!,
        listId: props.listId,
        itemId: props.itemId,
        label: v.label,
        url: v.url,
      }),
    onError: () => toast("Link konnte nicht gespeichert werden."),
    onSettled: () => invalidate(),
  }));

  const del = createMutation(() => ({
    mutationFn: (n: ItemNote) => deleteNote(n.id),
    onMutate: (n: ItemNote) => {
      qc.setQueryData<ItemNote[]>(key(), (old) =>
        (old ?? []).filter((x) => x.id !== n.id),
      );
    },
    onError: () => {
      toast("Notiz konnte nicht gelöscht werden.");
      void invalidate();
    },
    onSuccess: (_d, n: ItemNote) => {
      toast("Notiz gelöscht.", {
        action: {
          label: "Rückgängig",
          onClick: () => {
            if (n.kind === "link" && n.url)
              addLink.mutate({ label: n.body, url: n.url });
            else addText.mutate(n.body);
          },
        },
      });
    },
    onSettled: () => invalidate(),
  }));

  // ── Local editor state ─────────────────────────────────────────────────────
  const [mode, setMode] = createSignal<"text" | "link" | null>(null);
  const [text, setText] = createSignal("");
  const [label, setLabel] = createSignal("");
  const [url, setUrl] = createSignal("");

  const reset = () => {
    setMode(null);
    setText("");
    setLabel("");
    setUrl("");
  };

  const submitText = () => {
    const t = text().trim();
    if (!t) return;
    addText.mutate(t);
    optimisticAppend(makeTemp("text", t, null));
    reset();
  };

  const submitLink = () => {
    const safe = normalizeUrl(url());
    const lbl = label().trim();
    if (!lbl || !safe) return;
    addLink.mutate({ label: lbl, url: safe });
    optimisticAppend(makeTemp("link", lbl, safe));
    reset();
  };

  const makeTemp = (
    kind: "text" | "link",
    body: string,
    url: string | null,
  ): ItemNote => ({
    id: `temp-${crypto.randomUUID()}`,
    kind,
    body,
    url,
    createdAt: new Date().toISOString(),
    authorUserId: auth.user()!.id,
    isSelf: true,
    authorName: null,
    authorHandle: null,
    authorAvatarUrl: null,
  });

  const linkValid = () => !!label().trim() && !!normalizeUrl(url());

  const btnGhost =
    "rounded-xs px-3 py-1.5 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:bg-surface hover:text-text";
  const btnSave =
    "rounded-xs bg-accent px-3 py-1.5 text-body text-accent-on transition-opacity hover:opacity-90 disabled:opacity-40";
  const inputCls =
    "w-full rounded-xs border border-border bg-bg px-3 py-2 text-body text-text placeholder:text-text-muted focus:border-accent focus:outline-none";

  return (
    <div>
      <Show
        when={notes.data && notes.data.length > 0}
        fallback={
          <Show when={!notes.isLoading && mode() === null}>
            <p class="text-body text-text-muted">
              Noch keine Notizen. Schreib etwas oder füg einen Link hinzu —
              alle Mitglieder dieser Liste sehen es.
            </p>
          </Show>
        }
      >
        <ul class="space-y-3">
          <For each={notes.data}>
            {(n) => (
              <li class="group flex items-start gap-2">
                <div class="min-w-0 flex-1">
                  <Switch>
                    <Match when={n.kind === "text"}>
                      <p class="whitespace-pre-wrap break-words text-body text-text">
                        {n.body}
                      </p>
                    </Match>
                    <Match when={n.kind === "link"}>
                      <a
                        href={normalizeUrl(n.url ?? "") ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex max-w-full items-center gap-1.5 rounded-xs border border-border bg-bg px-2.5 py-1 text-body text-text transition-colors hover:border-accent hover:text-accent"
                      >
                        <ExternalLink class="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                        <span class="truncate">{n.body}</span>
                      </a>
                    </Match>
                  </Switch>
                  {/* Attribution — only co-members' blocks carry a chip; your
                      own are implicitly yours. */}
                  <Show when={!n.isSelf && n.authorName}>
                    <div class="mt-1 text-mini text-text-muted">
                      <UserChip
                        name={n.authorName!}
                        handle={n.authorHandle}
                        avatarUrl={n.authorAvatarUrl}
                      >
                        <span class="font-mono uppercase tracking-wider underline decoration-border decoration-dotted underline-offset-2">
                          {n.authorName}
                        </span>
                      </UserChip>
                    </div>
                  </Show>
                </div>
                {/* Delete — own blocks only, hover-revealed. */}
                <Show when={n.isSelf && !n.id.startsWith("temp-")}>
                  <button
                    type="button"
                    onClick={() => del.mutate(n)}
                    aria-label="Notiz löschen"
                    class="shrink-0 rounded-xs p-1 text-text-muted opacity-0 transition-opacity hover:bg-surface hover:text-text focus:opacity-100 group-hover:opacity-100"
                  >
                    <X class="size-4" strokeWidth={1.75} aria-hidden />
                  </button>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      {/* Add controls / inline editors */}
      <Switch>
        <Match when={mode() === "text"}>
          <div class="mt-3 space-y-2">
            <textarea
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
              rows={3}
              maxlength="5000"
              placeholder="Notiz schreiben …"
              autofocus
              class={`${inputCls} resize-y`}
            />
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={submitText}
                disabled={!text().trim()}
                class={btnSave}
              >
                Speichern
              </button>
              <button type="button" onClick={reset} class={btnGhost}>
                Abbrechen
              </button>
            </div>
          </div>
        </Match>

        <Match when={mode() === "link"}>
          <div class="mt-3 space-y-2">
            <input
              value={label()}
              onInput={(e) => setLabel(e.currentTarget.value)}
              maxlength="200"
              placeholder="Bezeichnung (z. B. „Trailer“)"
              autofocus
              class={inputCls}
            />
            <input
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && linkValid()) submitLink();
              }}
              maxlength="2048"
              placeholder="https://…"
              inputmode="url"
              class={inputCls}
            />
            <Show when={url().trim() && !normalizeUrl(url())}>
              <p class="text-mini text-accent">Keine gültige Web-Adresse.</p>
            </Show>
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={submitLink}
                disabled={!linkValid()}
                class={btnSave}
              >
                Speichern
              </button>
              <button type="button" onClick={reset} class={btnGhost}>
                Abbrechen
              </button>
            </div>
          </div>
        </Match>

        <Match when={mode() === null}>
          <div class="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("text")}
              class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xs border border-border py-2 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:border-text-muted hover:text-text"
            >
              <Type class="size-3.5" strokeWidth={1.75} aria-hidden />
              Text
            </button>
            <button
              type="button"
              onClick={() => setMode("link")}
              class="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xs border border-border py-2 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:border-text-muted hover:text-text"
            >
              <Link2 class="size-3.5" strokeWidth={1.75} aria-hidden />
              Link
            </button>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
