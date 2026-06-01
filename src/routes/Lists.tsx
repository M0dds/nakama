import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import {
  createMutation,
  createQuery,
  useQueryClient,
} from "@tanstack/solid-query";
import {
  closestCenter,
  createSortable,
  DragDropProvider,
  SortableProvider,
} from "@thisbeyond/solid-dnd";
import { useAuth } from "@/lib/auth";
import {
  listsQueryKey,
  listsQueryOptions,
  reorderLists,
  setListPin,
  type ListSummary,
} from "@/lib/queries/lists";
import {
  MovePointerSensor,
  reorderSection,
  sortableRowStyle,
  topOfSection,
  useDragSettling,
} from "@/lib/sortable";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { CreateListForm } from "@/components/CreateListForm";
import { InvitationsInbox } from "@/components/InvitationsInbox";
import { RowActions } from "@/components/RowActions";
import { DragHandle } from "@/components/DragHandle";
import { Skeleton } from "@/components/Skeleton";

/**
 * /lists — overview. Left 2/3: "Deine Listen" (private) + "Geteilte Listen"
 * (shared, with anyone else). Right 1/3: "Neue Liste" create form, always
 * available. Sharing-related modules (incoming invitations) land in Phase 7.
 *
 * Split is by `is_shared`, not ownership: a list YOU created becomes
 * "geteilt" the moment you invite someone, but you stay the owner. So this
 * UI is forward-compatible.
 */
export default function Lists() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  // The query depends on `auth.user()`. createQuery's options factory is
  // reactive — when user() flips from null to a User on session settle, the
  // query re-evaluates and the queryFn finally runs.
  const lists = createQuery(() => ({
    ...listsQueryOptions(auth.user()!),
    enabled: !!auth.user(),
  }));

  // Live updates: a partner creating a list, joining, leaving, or
  // toggling tracks_home anywhere reflects here without a refresh.
  // The episode tables drive the "Neue Folge" badge — new episodes
  // appearing OR the caller's ticks invalidate the per-list count.
  useRealtimeInvalidation("lists-overview", [
    { table: "lists", invalidates: [listsQueryKey] },
    { table: "list_members", invalidates: [listsQueryKey] },
    { table: "list_items", invalidates: [listsQueryKey] },
    { table: "episodes", invalidates: [listsQueryKey] },
    { table: "episode_watches", invalidates: [listsQueryKey] },
    // Incoming invites: refresh the inbox cards + the overview (an accepted
    // invite surfaces a new shared list).
    {
      table: "list_invitations",
      invalidates: [["invitations", "mine"], listsQueryKey],
    },
  ]);

  // Pin toggle. Optimistic: flip pinned + bump sortOrder to MIN(target
  // section)-1 so the row jumps to the top of its new section instantly.
  // The server write goes through set_list_pin, which computes the canonical
  // sort_order server-side (so input.sortOrder is optimistic-only). On error:
  // rollback to the snapshot. On success: invalidate so the canonical sort
  // order from the server replaces the optimistic one.
  const pinMut = createMutation(() => ({
    mutationFn: (input: { list: ListSummary; pinned: boolean; sortOrder: number }) =>
      setListPin({
        listId: input.list.id,
        userId: auth.user()!.id,
        pinned: input.pinned,
      }),
    onMutate: async (input) => {
      // Suppress hover-bg while the re-sort slides rows under the cursor —
      // same settle window the drag path uses, otherwise the rows passing
      // under the pointer flicker (B-fix follow-up to the pin RPC work).
      settle();
      await queryClient.cancelQueries({ queryKey: listsQueryKey });
      const prev = queryClient.getQueryData<{
        private: ListSummary[];
        shared: ListSummary[];
      }>(listsQueryKey);
      if (!prev) return { prev };
      const patch = (arr: ListSummary[]) =>
        [...arr]
          .map((l) =>
            l.id === input.list.id
              ? { ...l, pinned: input.pinned, sortOrder: input.sortOrder }
              : l,
          )
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return a.sortOrder - b.sortOrder;
          });
      queryClient.setQueryData(listsQueryKey, {
        private: patch(prev.private),
        shared: patch(prev.shared),
      });
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(listsQueryKey, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
    },
  }));

  // Pin toggle: float the freshly-(un)pinned row to the top of its new
  // section. sortOrder math is shared with /lists/:short — see topOfSection.
  const handleTogglePin = (list: ListSummary) => {
    const data = lists.data;
    if (!data) return;
    const targetPinned = !list.pinned;
    const targetSection = [...data.private, ...data.shared].filter(
      (l) => l.pinned === targetPinned && l.id !== list.id,
    );
    pinMut.mutate({
      list,
      pinned: targetPinned,
      sortOrder: topOfSection(targetSection),
    });
  };

  // Drag-reorder. Source of truth = the cached lists array; we slice it
  // by (visibility, pinned) into 4 sortable sections and let each section
  // own its own SortableProvider so drag-swap is bounded within section.
  // On drop, build the new ordered ID list for the affected section, patch
  // the cache optimistically (sort_order = i+1 in that section), then push
  // the same payload to the server.
  const reorderMut = createMutation(() => ({
    mutationFn: (input: {
      orderedListIds: string[];
      // Pre-patch snapshot captured at the call site (the optimistic patch is
      // applied inline in the drag handler, before mutate). Carried through
      // the variables so onError can roll back — there is no onMutate here, so
      // the old ctx.prev read was always undefined and the rollback inert.
      prev: { private: ListSummary[]; shared: ListSummary[] };
    }) =>
      reorderLists({
        userId: auth.user()!.id,
        orderedListIds: input.orderedListIds,
      }),
    onError: (_err, input) => {
      queryClient.setQueryData(listsQueryKey, input.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
    },
  }));

  // Drag-reorder + hover-bg suppression. The hook owns dragSettling + the
  // unconditional settle scheduling; we provide only the actual reorder
  // logic. Refuse cross-section drops (pinned/unpinned stay separate;
  // pin-state changes go through the pin click, not the drag).
  const { dragSettling, onDragStart, onDragEnd, settle } = useDragSettling(
    ({ draggable, droppable }) => {
      if (!droppable || draggable.id === droppable.id) return;
      const fromSection = (draggable.data as { section: SectionKey }).section;
      const toSection = (droppable.data as { section: SectionKey }).section;
      if (fromSection !== toSection) return;

      const data = queryClient.getQueryData<{
        private: ListSummary[];
        shared: ListSummary[];
      }>(listsQueryKey);
      if (!data) return;

      const { visibility, pinned } = sectionParts(fromSection);
      const arr = visibility === "private" ? data.private : data.shared;
      const sectionRows = arr.filter((l) => l.pinned === pinned);

      const reordered = reorderSection(
        sectionRows,
        draggable.id as string,
        droppable.id as string,
        (l) => l.id,
      );
      if (!reordered) return;
      const { nextSection, sortMap } = reordered;

      const patch = (rows: ListSummary[]) =>
        [...rows]
          .map((l) =>
            sortMap.has(l.id) ? { ...l, sortOrder: sortMap.get(l.id)! } : l,
          )
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return a.sortOrder - b.sortOrder;
          });

      // `data` is the pre-patch snapshot (patch() returns fresh arrays, so the
      // original object's arrays are untouched) — hand it to the mutation as
      // the rollback target before overwriting the cache.
      const prev = data;
      queryClient.setQueryData(listsQueryKey, {
        private: visibility === "private" ? patch(data.private) : data.private,
        shared: visibility === "shared" ? patch(data.shared) : data.shared,
      });

      reorderMut.mutate({ orderedListIds: nextSection.map((l) => l.id), prev });
    },
  );

  return (
    <main class="w-full">
      <PageHeader title="Listen" />

      <ColumnGuide />

      <DragDropProvider
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetector={closestCenter}
      >
        <MovePointerSensor />
        <div class="flex flex-col md:flex-row md:items-start">
          {/* Linke Spalte 2/3 — Einladungen + Deine Listen + Geteilte Listen */}
          <div class="md:w-2/3">
            <InvitationsInbox />
            <Show
              when={lists.data}
              fallback={
                <BentoModule label="Deine Listen" number="01">
                  <ListRowsSkeleton />
                </BentoModule>
              }
            >
              {(data) => (
                <>
                  <BentoModule
                    label="Deine Listen"
                    number="01"
                    class={
                      data().shared.length > 0
                        ? "border-b border-rule"
                        : undefined
                    }
                  >
                    <Show
                      when={data().private.length > 0}
                      fallback={<PrivateEmpty />}
                    >
                      <ListRows
                        lists={data().private}
                        visibility="private"
                        dragSettling={dragSettling}
                        onTogglePin={handleTogglePin}
                      />
                    </Show>
                  </BentoModule>

                  <Show when={data().shared.length > 0}>
                    <BentoModule label="Geteilte Listen" number="02">
                      <ListRows
                        lists={data().shared}
                        visibility="shared"
                        dragSettling={dragSettling}
                        onTogglePin={handleTogglePin}
                      />
                    </BentoModule>
                  </Show>
                </>
              )}
            </Show>
          </div>

          {/* Rechte Spalte 1/3 — Neue Liste */}
          <div class="border-t border-rule md:w-1/3 md:border-t-0">
            <BentoModule label="Neue Liste" number="03">
              <CreateListForm />
            </BentoModule>
          </div>
        </div>
      </DragDropProvider>
    </main>
  );
}

// Section keys identify which of the four sortable groups a draggable
// belongs to (visibility × pin-state). They live in solid-dnd's per-
// draggable data so onDragEnd can refuse cross-section drops.
type Visibility = "private" | "shared";
type SectionKey =
  | "private-pinned"
  | "private-unpinned"
  | "shared-pinned"
  | "shared-unpinned";

function sectionKey(visibility: Visibility, pinned: boolean): SectionKey {
  return `${visibility}-${pinned ? "pinned" : "unpinned"}` as SectionKey;
}

function sectionParts(key: SectionKey): { visibility: Visibility; pinned: boolean } {
  const [visibility, state] = key.split("-") as [Visibility, "pinned" | "unpinned"];
  return { visibility, pinned: state === "pinned" };
}

/** Accent label next to the list name when items in it have recent
 *  released-but-unwatched episodes/chapters. Singular vs plural + type-aware;
 *  mixed lists fall back to a neutral "N neu". Returns null when there's
 *  nothing new — caller renders nothing. */
/** Badge wording for a list's new-episode tally. Singular vs plural only — no
 *  count number (by design: "es muss nicht zählen, nur Mehrzahl angeben"). */
function newCountLabel(counts: {
  folgen: number;
  kapitel: number;
}): string | null {
  const { folgen, kapitel } = counts;
  if (folgen + kapitel === 0) return null;
  // Mixed (dormant — kapitel stays 0 until manga gets an air-date signal):
  // both kinds present ⇒ several releases ⇒ neutral plural.
  if (folgen > 0 && kapitel > 0) return "Neue Releases";
  if (kapitel > 0) return kapitel === 1 ? "Neues Kapitel" : "Neue Kapitel";
  return folgen === 1 ? "Neue Folge" : "Neue Folgen";
}

/** "12 Einträge · privat · Archiv" — count, visibility, optional archive marker. */
function metaLine(list: ListSummary): string {
  const count =
    list.itemCount === 0
      ? "Noch leer"
      : `${list.itemCount} ${list.itemCount === 1 ? "Eintrag" : "Einträge"}`;
  const visibility = list.isShared ? "geteilt" : "privat";
  return list.tracksHome
    ? `${count} · ${visibility}`
    : `${count} · ${visibility} · Archiv`;
}

/**
 * Row layout, projektweit pattern: the hover bg fills the FULL column
 * width (so it bleeds through the BentoModule's p-5 via `-mx-5`), while
 * the divider hairlines + the content stay inset at `px-5`. The divider
 * is a `::after` pseudo-element on each `<li>` so it's independent of the
 * row's bg fill, and hidden on the last row. Apply this same shape any
 * time a list lives inside a BentoModule.
 *
 * Right-edge cluster: PinButton + DragHandle, both hover-revealed. The
 * handle has an extra `ml-2` so it reads as a separate slot from the pin
 * (matches the visual rhythm on /lists/:shortCode rows, where the same
 * gap separates the actions cluster from the handle). No chevron — the
 * affordances on the right are now the row's "I lead somewhere" hint.
 *
 * <A> wraps the name block only — PinButton + DragHandle sit as siblings
 * (handshake gotcha: buttons-inside-anchors is invalid HTML + flaky in
 * click handling).
 */
function ListRows(props: {
  lists: ListSummary[];
  visibility: Visibility;
  dragSettling: () => boolean;
  onTogglePin: (list: ListSummary) => void;
}) {
  // Two sortable groups per visibility — pinned + unpinned. Each section's
  // ids are derived from the sorted query data, so SortableProvider's swap
  // preview stays in sync with the current visual order.
  const pinned = () => props.lists.filter((l) => l.pinned);
  const unpinned = () => props.lists.filter((l) => !l.pinned);
  const pinnedIds = () => pinned().map((l) => l.id);
  const unpinnedIds = () => unpinned().map((l) => l.id);

  return (
    <ul class="-mx-5">
      <SortableProvider ids={pinnedIds()}>
        <For each={pinned()}>
          {(list) => (
            <SortableListRow
              list={list}
              visibility={props.visibility}
              dragSettling={props.dragSettling}
              onTogglePin={props.onTogglePin}
            />
          )}
        </For>
      </SortableProvider>
      <SortableProvider ids={unpinnedIds()}>
        <For each={unpinned()}>
          {(list) => (
            <SortableListRow
              list={list}
              visibility={props.visibility}
              dragSettling={props.dragSettling}
              onTogglePin={props.onTogglePin}
            />
          )}
        </For>
      </SortableProvider>
    </ul>
  );
}

function SortableListRow(props: {
  list: ListSummary;
  visibility: Visibility;
  dragSettling: () => boolean;
  onTogglePin: (list: ListSummary) => void;
}) {
  const sortable = createSortable(props.list.id, {
    section: sectionKey(props.visibility, props.list.pinned),
  });

  return (
    <li
      ref={sortable}
      style={sortableRowStyle(sortable)}
      class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden"
      classList={{
        "z-10 opacity-90 shadow-floating bg-bg": sortable.isActiveDraggable,
      }}
    >
      <div
        class="group flex items-center gap-2 px-5 py-3.5"
        classList={{
          "transition-colors hover:bg-surface": !props.dragSettling(),
        }}
      >
        <A
          href={`/lists/${props.list.shortCode}`}
          class="block min-w-0 flex-1"
        >
          <div class="flex min-w-0 items-start gap-3">
            <h3 class="min-w-0 truncate text-body-lg font-medium text-text">
              {props.list.name}
            </h3>
            {/* Only tracked lists surface the new-episode badge — an archived
                (tracks_home off) list shouldn't nag about new releases. */}
            <Show
              when={
                props.list.tracksHome
                  ? newCountLabel(props.list.newCounts)
                  : null
              }
            >
              {(label) => (
                <span class="shrink-0 font-mono text-mini uppercase text-accent">
                  {label()}
                </span>
              )}
            </Show>
          </div>
          <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
            {metaLine(props.list)}
          </p>
        </A>
        <RowActions
          pinned={props.list.pinned}
          noun="Liste"
          onTogglePin={() => props.onTogglePin(props.list)}
        />
        <DragHandle
          activators={sortable.dragActivators}
          noun={props.list.name}
          class="ml-2"
        />
      </div>
    </li>
  );
}

/** Loading placeholder for the list rows. Mirrors the row layout — title +
 *  meta line inset at px-5, full-width hairline dividers — so the real rows
 *  drop in without a layout shift when the query resolves. */
function ListRowsSkeleton() {
  return (
    <ul class="-mx-5">
      <For each={Array.from({ length: 4 })}>
        {() => (
          <li class="relative px-5 py-3.5 after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
            <Skeleton class="h-4 w-44" />
            <Skeleton class="mt-2 h-3 w-28" />
          </li>
        )}
      </For>
    </ul>
  );
}

function PrivateEmpty() {
  return (
    <div class="rounded-sm border border-border px-5 py-6 text-center">
      <p class="text-body text-text">Noch keine Listen.</p>
      <p class="mx-auto mt-1 max-w-md text-body text-text-muted">
        Eine private Liste sammelt, was du allein verfolgst. Lade jemanden ein,
        und sie wandert rüber zu „Geteilte Listen". Lege rechts eine neue Liste
        an.
      </p>
    </div>
  );
}
