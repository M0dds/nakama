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
  DragDropSensors,
  SortableProvider,
  transformStyle,
  type DragEvent,
} from "@thisbeyond/solid-dnd";
import { useAuth } from "@/lib/auth";
import {
  listsQueryKey,
  listsQueryOptions,
  reorderLists,
  setListPin,
  type ListSummary,
} from "@/lib/queries/lists";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { CreateListForm } from "@/components/CreateListForm";
import { PinButton } from "@/components/PinButton";
import { DragHandle } from "@/components/DragHandle";

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
  useRealtimeInvalidation("lists-overview", [
    { table: "lists", invalidates: [listsQueryKey] },
    { table: "list_members", invalidates: [listsQueryKey] },
    { table: "list_items", invalidates: [listsQueryKey] },
  ]);

  // Pin toggle. Optimistic: flip pinned + bump sortOrder to MIN(target
  // section)-1 so the row jumps to the top of its new section instantly.
  // The server write mirrors that math (caller passes the same sortOrder).
  // On error: rollback to the snapshot. On success: invalidate so the
  // canonical sort order from the server replaces the optimistic one.
  const pinMut = createMutation(() => ({
    mutationFn: (input: { list: ListSummary; pinned: boolean; sortOrder: number }) =>
      setListPin({
        listId: input.list.id,
        userId: auth.user()!.id,
        pinned: input.pinned,
        sortOrder: input.sortOrder,
      }),
    onMutate: async (input) => {
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

  // Compute the new sortOrder for a pin toggle: MIN(target section) - 1,
  // so the just-pinned (or freshly-unpinned) row floats to the top of its
  // new section. Sections aren't crossed by drag-reorder either — this
  // keeps both flows consistent.
  const handleTogglePin = (list: ListSummary) => {
    const data = lists.data;
    if (!data) return;
    const all = [...data.private, ...data.shared];
    const targetPinned = !list.pinned;
    const targetSection = all.filter(
      (l) => l.pinned === targetPinned && l.id !== list.id,
    );
    const minSort =
      targetSection.length > 0
        ? Math.min(...targetSection.map((l) => l.sortOrder))
        : 1;
    pinMut.mutate({ list, pinned: targetPinned, sortOrder: minSort - 1 });
  };

  // Drag-reorder. Source of truth = the cached lists array; we slice it
  // by (visibility, pinned) into 4 sortable sections and let each section
  // own its own SortableProvider so drag-swap is bounded within section.
  // On drop, build the new ordered ID list for the affected section, patch
  // the cache optimistically (sort_order = i+1 in that section), then push
  // the same payload to the server.
  const reorderMut = createMutation(() => ({
    mutationFn: (input: { orderedListIds: string[] }) =>
      reorderLists({
        userId: auth.user()!.id,
        orderedListIds: input.orderedListIds,
      }),
    onError: (_err, _input, ctx) => {
      const prev = (ctx as { prev?: unknown } | undefined)?.prev;
      if (prev) queryClient.setQueryData(listsQueryKey, prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listsQueryKey });
    },
  }));

  const onDragEnd = ({ draggable, droppable }: DragEvent) => {
    if (!droppable || draggable.id === droppable.id) return;
    // Refuse cross-section drops (handshake decision: pinned/unpinned stay
    // separate; pin-state changes go through the pin click, not the drag).
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
    const fromIndex = sectionRows.findIndex((l) => l.id === draggable.id);
    const toIndex = sectionRows.findIndex((l) => l.id === droppable.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

    const nextSection = [...sectionRows];
    const [moved] = nextSection.splice(fromIndex, 1);
    nextSection.splice(toIndex, 0, moved);

    const sortMap = new Map<string, number>(
      nextSection.map((l, i) => [l.id, i + 1]),
    );
    const orderedListIds = nextSection.map((l) => l.id);

    const patch = (rows: ListSummary[]) =>
      [...rows]
        .map((l) =>
          sortMap.has(l.id) ? { ...l, sortOrder: sortMap.get(l.id)! } : l,
        )
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return a.sortOrder - b.sortOrder;
        });

    queryClient.setQueryData(listsQueryKey, {
      private: visibility === "private" ? patch(data.private) : data.private,
      shared: visibility === "shared" ? patch(data.shared) : data.shared,
    });

    reorderMut.mutate({ orderedListIds });
  };

  return (
    <main class="w-full">
      <PageHeader title="Listen" />

      <ColumnGuide />

      <DragDropProvider
        onDragEnd={onDragEnd}
        collisionDetector={closestCenter}
      >
        <DragDropSensors />
        <div class="flex flex-col md:flex-row md:items-start">
          {/* Linke Spalte 2/3 — Deine Listen + Geteilte Listen */}
          <div class="md:w-2/3">
            <Show
              when={lists.data}
              fallback={
                <BentoModule label="Deine Listen" number="01">
                  <p class="text-body text-text-muted">Lade Listen …</p>
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
                        onTogglePin={handleTogglePin}
                      />
                    </Show>
                  </BentoModule>

                  <Show when={data().shared.length > 0}>
                    <BentoModule label="Geteilte Listen" number="02">
                      <ListRows
                        lists={data().shared}
                        visibility="shared"
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
  onTogglePin: (list: ListSummary) => void;
}) {
  const sortable = createSortable(props.list.id, {
    section: sectionKey(props.visibility, props.list.pinned),
  });
  return (
    <li
      ref={sortable}
      style={transformStyle(sortable.transform)}
      class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden"
      classList={{
        "z-10 opacity-90 shadow-floating bg-bg": sortable.isActiveDraggable,
      }}
    >
      <div class="group flex items-center gap-2 px-5 py-3.5 transition-colors hover:bg-surface">
        <A
          href={`/lists/${props.list.shortCode}`}
          class="block min-w-0 flex-1"
        >
          <h3 class="min-w-0 truncate text-body-lg font-medium text-text">
            {props.list.name}
          </h3>
          <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
            {metaLine(props.list)}
          </p>
        </A>
        <PinButton
          pinned={props.list.pinned}
          noun="Liste"
          onToggle={() => props.onTogglePin(props.list)}
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

function PrivateEmpty() {
  return (
    <div class="px-4 py-8">
      <p class="text-body-lg text-text">Noch keine Listen.</p>
      <p class="mt-1.5 max-w-md text-body text-text-muted">
        Eine private Liste sammelt, was du allein verfolgst. Lade jemanden
        ein, und sie wandert rüber zu „Geteilte Listen". Lege rechts eine
        neue Liste an.
      </p>
    </div>
  );
}
