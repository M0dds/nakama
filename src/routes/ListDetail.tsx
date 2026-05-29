import { createSignal, For, Show } from "solid-js";
import { A, useParams } from "@solidjs/router";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import {
  closestCenter,
  createSortable,
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
} from "@thisbeyond/solid-dnd";
import { useAuth } from "@/lib/auth";
import {
  listQueryOptions,
  listItemsQueryOptions,
  listQueryKey,
  listItemsQueryKey,
  listsQueryKey,
  reorderListItems,
  setListItemPin,
  type ListEntry,
} from "@/lib/queries/lists";
import {
  reorderSection,
  sortableRowStyle,
  topOfSection,
  useDragSettling,
} from "@/lib/sortable";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { EditableListName } from "@/components/EditableListName";
import { DeleteListButton } from "@/components/DeleteListButton";
import { RowActions, type Confirming } from "@/components/RowActions";
import { ListTrackingToggle } from "@/components/ListTrackingToggle";
import { MoveItemDialog } from "@/components/MoveItemDialog";
import { NotFound } from "@/components/NotFound";
import { DragHandle } from "@/components/DragHandle";

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
    ...listItemsQueryOptions(auth.user()!, params.shortCode),
    enabled: !!auth.user() && !!params.shortCode,
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
    pinMut.mutate({
      entry,
      pinned: targetPinned,
      sortOrder: topOfSection(targetSection),
    });
  };

  // Drag-reorder within pinned OR unpinned section. Cross-section drops
  // are refused — handshake decision: pin-state changes go through the
  // pin click, not the drag.
  const reorderMut = createMutation(() => ({
    mutationFn: (input: { listId: string; orderedListItemIds: string[] }) =>
      reorderListItems({
        listId: input.listId,
        orderedListItemIds: input.orderedListItemIds,
      }),
    onError: (_err, _input, ctx) => {
      const prev = (ctx as { prev?: unknown } | undefined)?.prev;
      if (prev)
        queryClient.setQueryData(listItemsQueryKey(params.shortCode), prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: listItemsQueryKey(params.shortCode),
      });
    },
  }));

  // Drag-reorder + hover-bg suppression. The hook owns the settle window;
  // we provide only the reorder logic. Refuse cross-section drops — pin-
  // state changes go through the pin click, not the drag.
  const { dragSettling, onDragStart, onDragEnd } = useDragSettling(
    ({ draggable, droppable }) => {
      if (!droppable || draggable.id === droppable.id) return;
      const fromPinned = (draggable.data as { pinned: boolean }).pinned;
      const toPinned = (droppable.data as { pinned: boolean }).pinned;
      if (fromPinned !== toPinned) return;

      const listId = list.data?.id;
      if (!listId) return;

      const all = queryClient.getQueryData<ListEntry[]>(
        listItemsQueryKey(params.shortCode),
      );
      if (!all) return;

      const section = all.filter((e) => e.pinned === fromPinned);
      const reordered = reorderSection(
        section,
        draggable.id as string,
        droppable.id as string,
        (e) => e.listItemId,
      );
      if (!reordered) return;
      const { nextSection, sortMap } = reordered;

      const next = [...all]
        .map((e) =>
          sortMap.has(e.listItemId)
            ? { ...e, sortOrder: sortMap.get(e.listItemId)! }
            : e,
        )
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        });
      queryClient.setQueryData(listItemsQueryKey(params.shortCode), next);

      reorderMut.mutate({
        listId,
        orderedListItemIds: nextSection.map((e) => e.listItemId),
      });
    },
  );

  // Granular realtime — a rename on the lists table refreshes BOTH the
  // overview cache (so /lists sees the new name) and this detail cache.
  // The episode tables drive the per-row "Neue Folge" badges: new air
  // dates OR the caller's ticks invalidate the items query.
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
    {
      table: "episodes",
      invalidates: [listItemsQueryKey(params.shortCode)],
    },
    {
      table: "episode_watches",
      invalidates: [listItemsQueryKey(params.shortCode)],
    },
  ]);

  // Resolved-but-null → list doesn't exist OR RLS scoped it away. Render
  // the NotFound surface inline (no privacy text — the message itself is
  // intentionally indistinguishable between the two cases). Replaces the
  // previous silent navigate("/lists") that hid the failure.
  const notFound = () => !list.isLoading && list.data === null;

  // Move-Dialog state — owning it at the route level (not in each row's
  // RowActions) lets the modal portal cleanly to the page and reuse
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
                <DragDropProvider
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  collisionDetector={closestCenter}
                >
                  <DragDropSensors />
                  <ListEntries
                    items={items.data!}
                    listShortCode={params.shortCode}
                    dragSettling={dragSettling}
                    onRequestMove={(entry) => setMovingEntry(entry)}
                    onTogglePin={handleTogglePin}
                  />
                </DragDropProvider>
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

/** Per-row "Neue Folge" / "Neues Kapitel" badge label, or null if the
 *  entry has no recent unwatched release. Type-aware: anime/series get
 *  "Neue Folge", manga gets "Neues Kapitel"; movies/games get nothing
 *  (no episode model). */
function newEpisodeLabel(entry: ListEntry): string | null {
  if (!entry.hasNewEpisode) return null;
  if (entry.type === "manga") return "Neues Kapitel";
  if (entry.type === "anime" || entry.type === "series") return "Neue Folge";
  return null;
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
 *  in einem <A>-Link; rechts daneben sitzt RowActions als Sibling
 *  (NICHT im <a> verschachtelt — Buttons in einem Anchor sind ungültiges
 *  HTML + verhalten sich unzuverlässig beim Klick). Default ohne Chevron;
 *  die ge-faded-in Action-Icons sind die hover-affordance. */
function ListEntries(props: {
  items: ListEntry[];
  listShortCode: string;
  dragSettling: () => boolean;
  onRequestMove: (entry: ListEntry) => void;
  onTogglePin: (entry: ListEntry) => void;
}) {
  const pinned = () => props.items.filter((e) => e.pinned);
  const unpinned = () => props.items.filter((e) => !e.pinned);
  const pinnedIds = () => pinned().map((e) => e.listItemId);
  const unpinnedIds = () => unpinned().map((e) => e.listItemId);

  return (
    <ul class="-mx-5">
      <SortableProvider ids={pinnedIds()}>
        <For each={pinned()}>
          {(entry) => (
            <SortableEntryRow
              entry={entry}
              listShortCode={props.listShortCode}
              dragSettling={props.dragSettling}
              onRequestMove={props.onRequestMove}
              onTogglePin={props.onTogglePin}
            />
          )}
        </For>
      </SortableProvider>
      <SortableProvider ids={unpinnedIds()}>
        <For each={unpinned()}>
          {(entry) => (
            <SortableEntryRow
              entry={entry}
              listShortCode={props.listShortCode}
              dragSettling={props.dragSettling}
              onRequestMove={props.onRequestMove}
              onTogglePin={props.onTogglePin}
            />
          )}
        </For>
      </SortableProvider>
    </ul>
  );
}

function SortableEntryRow(props: {
  entry: ListEntry;
  listShortCode: string;
  dragSettling: () => boolean;
  onRequestMove: (entry: ListEntry) => void;
  onTogglePin: (entry: ListEntry) => void;
}) {
  const sortable = createSortable(props.entry.listItemId, {
    pinned: props.entry.pinned,
  });
  // The row OWNS the confirm-state signal so PinButton + DragHandle can
  // read the same source as RowActions' Show — single sync flush,
  // no callback roundtrip. When non-null, pin + drag-handle fade out (same
  // 200ms ease-quart) so the destructive prompt owns the row's attention.
  const [confirming, setConfirming] = createSignal<Confirming>(null);

  return (
    <li
      ref={sortable}
      style={sortableRowStyle(sortable)}
      class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border"
      classList={{
        "z-10 opacity-90 shadow-floating bg-bg": sortable.isActiveDraggable,
      }}
    >
      <div
        class="group flex items-center gap-2 px-5 py-3"
        classList={{
          "transition-colors hover:bg-surface": !props.dragSettling(),
        }}
      >
        <A
          href={`/item/${props.entry.type}/${props.entry.slug}`}
          class="flex min-w-0 flex-1 items-center gap-3"
        >
          <div class="size-12 shrink-0 overflow-hidden rounded-xs border border-border bg-surface">
            <Show
              when={props.entry.coverUrl}
              fallback={
                <div class="flex size-full items-center justify-center font-mono text-mini text-text-muted">
                  {props.entry.type === "manga" ? "M" : "A"}
                </div>
              }
            >
              <img
                src={props.entry.coverUrl!}
                alt=""
                class="size-full object-cover"
                loading="lazy"
              />
            </Show>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex min-w-0 items-start gap-3">
              <h3 class="min-w-0 truncate text-body-lg font-medium text-text">
                {props.entry.title}
              </h3>
              <Show when={newEpisodeLabel(props.entry)}>
                {(label) => (
                  <span class="shrink-0 font-mono text-mini uppercase text-accent">
                    {label()}
                  </span>
                )}
              </Show>
            </div>
            <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
              {typeLabel(props.entry.type)}
            </p>
          </div>
        </A>
        <RowActions
          pinned={props.entry.pinned}
          noun="Eintrag"
          onTogglePin={() => props.onTogglePin(props.entry)}
          destructive={{
            itemId: props.entry.itemId,
            listItemId: props.entry.listItemId,
            itemTitle: props.entry.title,
            itemType: props.entry.type,
            itemSlug: props.entry.slug,
            listShortCode: props.listShortCode,
            onRequestMove: () => props.onRequestMove(props.entry),
            confirming,
            setConfirming,
          }}
        />
        <DragHandle
          activators={sortable.dragActivators}
          noun={props.entry.title}
          hidden={confirming() !== null}
          class="ml-2"
        />
      </div>
    </li>
  );
}
