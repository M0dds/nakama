import { createSignal, For, Show } from "solid-js";
import { A, useParams } from "@solidjs/router";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import { useAuth } from "@/lib/auth";
import {
  listQueryOptions,
  listItemsQueryOptions,
  listQueryKey,
  listItemsQueryKey,
  listsQueryKey,
  setListItemPin,
  type ListEntry,
} from "@/lib/queries/lists";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { EditableListName } from "@/components/EditableListName";
import { DeleteListButton } from "@/components/DeleteListButton";
import { ListEntryActions } from "@/components/ListEntryActions";
import { ListTrackingToggle } from "@/components/ListTrackingToggle";
import { MoveItemDialog } from "@/components/MoveItemDialog";
import { NotFound } from "@/components/NotFound";
import { PinButton } from "@/components/PinButton";

/**
 * /lists/:id — detail view. Layout mirrors the Logbook handshake:
 *
 *   Left 2/3:  Einträge (01)  — items in the list (empty until Phase 4)
 *   Right 1/3: Details (02)   — meta + tracks_home toggle
 *              Mitglieder (03) — sharing module (lands in Phase 7)
 *
 * Heading is the inline-renamable list name. Aside slot carries the
 * inline-confirm DeleteListButton (owner only).
 *
 * On a missing/invisible/non-uuid id, the query returns null → we route to
 * the lists overview instead of showing a stale shell.
 */
export default function ListDetail() {
  // Solid Router types params as Partial<Record>; the :shortCode segment
  // guarantees a value at runtime, so the non-null assertion is safe.
  const params = useParams<{ shortCode: string }>();
  const auth = useAuth();
  const queryClient = useQueryClient();

  const list = createQuery(() => ({
    ...listQueryOptions(auth.user()!, params.shortCode),
    enabled: !!auth.user() && !!params.shortCode,
  }));

  const items = createQuery(() => ({
    ...listItemsQueryOptions(params.shortCode),
    enabled: !!params.shortCode,
  }));

  // Shared per-list pin toggle. Mirrors the optimistic pattern on /lists,
  // but the data shape here is a flat array.
  const pinMut = createMutation(() => ({
    mutationFn: (input: { entry: ListEntry; pinned: boolean; sortOrder: number }) =>
      setListItemPin({
        listItemId: input.entry.listItemId,
        pinned: input.pinned,
        sortOrder: input.sortOrder,
      }),
    onMutate: async (input) => {
      const key = listItemsQueryKey(params.shortCode);
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<ListEntry[]>(key);
      if (!prev) return { prev };
      const next = [...prev]
        .map((e) =>
          e.listItemId === input.entry.listItemId
            ? { ...e, pinned: input.pinned, sortOrder: input.sortOrder }
            : e,
        )
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        });
      queryClient.setQueryData(key, next);
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev)
        queryClient.setQueryData(listItemsQueryKey(params.shortCode), ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: listItemsQueryKey(params.shortCode),
      });
    },
  }));

  const handleTogglePin = (entry: ListEntry) => {
    const all = items.data;
    if (!all) return;
    const targetPinned = !entry.pinned;
    const targetSection = all.filter(
      (e) => e.pinned === targetPinned && e.listItemId !== entry.listItemId,
    );
    const minSort =
      targetSection.length > 0
        ? Math.min(...targetSection.map((e) => e.sortOrder))
        : 1;
    pinMut.mutate({ entry, pinned: targetPinned, sortOrder: minSort - 1 });
  };

  // Granular realtime — a rename on the lists table refreshes BOTH the
  // overview cache (so /lists sees the new name) and this detail cache.
  useRealtimeInvalidation(`list-${params.shortCode}`, [
    {
      table: "lists",
      invalidates: [listQueryKey(params.shortCode), listsQueryKey],
    },
    {
      table: "list_members",
      invalidates: [listQueryKey(params.shortCode), listsQueryKey],
    },
    {
      table: "list_items",
      invalidates: [
        listItemsQueryKey(params.shortCode),
        listQueryKey(params.shortCode),
      ],
    },
  ]);

  // Resolved-but-null → list doesn't exist OR RLS scoped it away. Render
  // the NotFound surface inline (no privacy text — the message itself is
  // intentionally indistinguishable between the two cases). Replaces the
  // previous silent navigate("/lists") that hid the failure.
  const notFound = () => !list.isLoading && list.data === null;

  // Move-Dialog state — owning it at the route level (not in each row's
  // ListEntryActions) lets the modal portal cleanly to the page and reuse
  // a single instance for whichever row is being moved.
  const [movingEntry, setMovingEntry] = createSignal<ListEntry | null>(null);

  const createdLabel = (iso: string) =>
    new Date(iso).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  const dtClass =
    "font-mono text-mini uppercase tracking-wider text-text-muted";

  return (
    <Show when={!notFound()} fallback={<NotFound kind="list" />}>
    <>
    <main class="w-full">
      <PageHeader
        kicker="LISTEN"
        title={
          <Show when={list.data} fallback={<span>…</span>}>
            {(data) => (
              <EditableListName
                listId={data().id}
                shortCode={data().shortCode}
                initialName={data().name}
              />
            )}
          </Show>
        }
        backHref="/lists"
        aside={
          <Show when={list.data?.isOwner}>
            <DeleteListButton
              listId={list.data!.id}
              listName={list.data!.name}
            />
          </Show>
        }
      />

      <ColumnGuide />

      <div class="flex flex-col md:flex-row md:items-start">
        {/* Einträge — left 2/3 */}
        <div class="md:w-2/3">
          <BentoModule label="Einträge" number="01">
            <Show
              when={list.data?.description}
            >
              <p class="mb-5 text-body text-text-muted">
                {list.data!.description}
              </p>
            </Show>
            <Show
              when={!items.isLoading}
              fallback={
                <p class="px-4 py-8 text-body text-text-muted">
                  Lade Einträge …
                </p>
              }
            >
              <Show
                when={items.data && items.data.length > 0}
                fallback={<EntriesEmpty />}
              >
                <ListEntries
                  items={items.data!}
                  listShortCode={params.shortCode}
                  onRequestMove={(entry) => setMovingEntry(entry)}
                  onTogglePin={handleTogglePin}
                />
              </Show>
            </Show>
          </BentoModule>
        </div>

        {/* Details — right 1/3 */}
        <div class="border-t border-rule md:w-1/3 md:border-t-0">
          <BentoModule label="Details" number="02">
            <Show
              when={list.data}
              fallback={<p class="text-body text-text-muted">Lade …</p>}
            >
              {(data) => (
                <>
                  <dl class="space-y-3 text-body">
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class={dtClass}>Sichtbarkeit</dt>
                      <dd class="text-text">
                        {data().isShared ? "Geteilt" : "Privat"}
                      </dd>
                    </div>
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class={dtClass}>Einträge</dt>
                      <dd class="tabular-nums text-text">
                        {data().itemCount}
                      </dd>
                    </div>
                    <div class="flex items-baseline justify-between gap-3">
                      <dt class={`${dtClass} shrink-0`}>Erstellt</dt>
                      <dd class="min-w-0 text-right text-text">
                        {createdLabel(data().createdAt)}
                      </dd>
                    </div>
                  </dl>

                  <ListTrackingToggle
                    listId={data().id}
                    shortCode={data().shortCode}
                    initialEnabled={data().tracksHome}
                  />
                </>
              )}
            </Show>
          </BentoModule>
        </div>
      </div>
    </main>
    <MoveItemDialog
      open={!!movingEntry()}
      onClose={() => setMovingEntry(null)}
      listItemId={movingEntry()?.listItemId ?? ""}
      itemTitle={movingEntry()?.title ?? ""}
      currentListShortCode={params.shortCode}
    />
    </>
    </Show>
  );
}

function EntriesEmpty() {
  return (
    <div class="px-4 py-8">
      <p class="text-body-lg text-text">Noch keine Einträge.</p>
      <p class="mt-1.5 max-w-md text-body text-text-muted">
        Über das <span class="font-mono">+</span> in der Navigation suchst du
        Anime &amp; Manga und legst sie hier ab.
      </p>
    </div>
  );
}

/** Type-Label fürs Meta-Line. Bewusst hardgecodet — die zukünftigen Werte
 *  (`series`, `movie`, `game`) bekommen ihre eigenen Labels wenn sie landen. */
function typeLabel(type: string): string {
  switch (type) {
    case "manga":
      return "Manga";
    case "anime":
      return "Anime";
    case "series":
      return "Serie";
    case "movie":
      return "Film";
    case "game":
      return "Spiel";
    default:
      return type;
  }
}

/** Items als Rows in einer Liste. Pattern: -mx-5 ul, hover-bg blutet zu den
 *  Spaltenrändern, ::after-Hairline pro li (inkl. last). Cover + Titel sind
 *  in einem <A>-Link; rechts daneben sitzt ListEntryActions als Sibling
 *  (NICHT im <a> verschachtelt — Buttons in einem Anchor sind ungültiges
 *  HTML + verhalten sich unzuverlässig beim Klick). Default ohne Chevron;
 *  die ge-faded-in Action-Icons sind die hover-affordance. */
function ListEntries(props: {
  items: ListEntry[];
  listShortCode: string;
  onRequestMove: (entry: ListEntry) => void;
  onTogglePin: (entry: ListEntry) => void;
}) {
  return (
    <ul class="-mx-5">
      <For each={props.items}>
        {(entry) => (
          <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border">
            <div class="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface">
              <A
                href={`/item/${entry.type}/${entry.slug}`}
                class="flex min-w-0 flex-1 items-center gap-3"
              >
                <div class="size-12 shrink-0 overflow-hidden rounded-xs border border-border bg-surface">
                  <Show
                    when={entry.coverUrl}
                    fallback={
                      <div class="flex size-full items-center justify-center font-mono text-mini text-text-muted">
                        {entry.type === "manga" ? "M" : "A"}
                      </div>
                    }
                  >
                    <img
                      src={entry.coverUrl!}
                      alt=""
                      class="size-full object-cover"
                      loading="lazy"
                    />
                  </Show>
                </div>
                <div class="min-w-0 flex-1">
                  <h3 class="min-w-0 truncate text-body-lg font-medium text-text">
                    {entry.title}
                  </h3>
                  <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
                    {typeLabel(entry.type)}
                  </p>
                </div>
              </A>
              <PinButton
                pinned={entry.pinned}
                noun="Eintrag"
                onToggle={() => props.onTogglePin(entry)}
              />
              <ListEntryActions
                itemId={entry.itemId}
                listItemId={entry.listItemId}
                itemTitle={entry.title}
                itemType={entry.type}
                itemSlug={entry.slug}
                listShortCode={props.listShortCode}
                onRequestMove={() => props.onRequestMove(entry)}
              />
            </div>
          </li>
        )}
      </For>
    </ul>
  );
}
