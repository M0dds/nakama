import { createMemo, createSignal, For, Show } from "solid-js";
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
  LIST_CATEGORIES,
  listsQueryKey,
  listsQueryOptions,
  reorderLists,
  setListPin,
  type ListCategory,
  type ListSummary,
} from "@/lib/queries/lists";
import {
  canDragRowBody,
  MovePointerSensor,
  reorderSection,
  sortableRowStyle,
  topOfSection,
  useDragSettling,
} from "@/lib/sortable";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { PageHeader } from "@/components/PageHeader";
import { CoverBackdrop } from "@/components/CoverBackdrop";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { CreateListForm } from "@/components/CreateListForm";
import { InvitationsInbox } from "@/components/InvitationsInbox";
import { RowActions } from "@/components/RowActions";
import { DragHandle } from "@/components/DragHandle";
import { Skeleton } from "@/components/Skeleton";
import { ListCover, coverSeedDataUri } from "@/components/GeneratedCover";
import { useResolvedMode } from "@/lib/use-resolved-mode";

/**
 * /lists — overview. Left 2/3: category-first sections — "Meine Listen"
 * (uncategorized, private + shared together) followed by one section per
 * non-empty category ("Anime", "Serien", …) in a fixed order, with
 * consecutive Bento numbering. Right 1/3: "Neue Liste" create form, always
 * available (numbered after the last left-column section).
 *
 * Category is the primary grouping axis (F9): private/shared is now just a
 * marker in each row's meta line, not a section of its own. The drag-reorder
 * machinery groups by (category × pin-state) — a list's category is changed
 * deliberately on its detail page, never by dragging across sections.
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

  // Ambient cover backdrop follows the hovered list row: an uploaded cover →
  // photo wash; a generated cover → the seed's themed pattern as a data-URI,
  // which CoverBackdrop's heavy blur dissolves into a soft seed-colour field.
  // The backdrop shows the hovered list's wash, falling back to a DEFAULT (the
  // topmost list) — so at rest, and when the pointer leaves the list column
  // (e.g. up to the header), it returns to the default instead of going grey.
  const resolvedMode = useResolvedMode();
  const [washCover, setWashCover] = createSignal<string | null>(null);
  const washOf = (l: ListSummary) =>
    l.coverUrl ?? coverSeedDataUri(l.coverSeed, resolvedMode());
  // Topmost list overall = first section's first entry (sections' lists are
  // pin-then-sortOrder sorted). Reactive, so it tracks data + theme mode.
  const defaultWash = () => {
    const first = sections()[0]?.lists[0];
    return first ? washOf(first) : null;
  };

  // Live updates: a partner creating a list, joining, leaving, recategorising,
  // or toggling tracks_home anywhere reflects here without a refresh. The
  // episode tables drive the "Neue Folge" badge — new episodes appearing OR
  // the caller's ticks invalidate the per-list count.
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

  // The visible, non-empty sections in fixed order, each pre-sorted by
  // (pinned, sortOrder). Memoised so the per-category filter+sort runs once
  // per data change, not once per consumer (numbering, border, render).
  const sections = createMemo<SectionGroup[]>(() => {
    const data = lists.data;
    if (!data) return [];
    const all = [...data.private, ...data.shared];
    const out: SectionGroup[] = [];
    for (const s of SECTION_ORDER) {
      const ls = all.filter((l) => catOf(l) === s.cat).sort(byPinThenSort);
      if (ls.length > 0) out.push({ cat: s.cat, label: s.label, lists: ls });
    }
    return out;
  });
  // "Neue Liste" sits after the last left section. With zero lists we still
  // render the "Meine Listen" empty card as 01, so the form is 02.
  const rightNumber = () => Math.max(1, sections().length) + 1;

  // Per-category accessors for the render below. The JSX iterates the STATIC
  // SECTION_ORDER (not sections()) so the BentoModules keep their identity
  // across cache writes — sections() emits all-new objects every run, and a
  // <For> keyed on those would dispose + remount every module and row on any
  // pin/drag/realtime change (the handshake's <For>-remount flicker class).
  // Inside a module, the row-level <For> keys on ListSummary references,
  // which TanStack's structural sharing keeps stable for untouched rows.
  const sectionOf = (cat: CatKey) => sections().find((s) => s.cat === cat);
  const numberOf = (cat: CatKey) =>
    pad2(sections().findIndex((s) => s.cat === cat) + 1);
  const lastCat = () => sections()[sections().length - 1]?.cat;

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
          .sort(byPinThenSort);
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
  // section. The section is scoped to the list's OWN category (the primary
  // axis now) — pinning a list floats it above that category's pinned rows,
  // not across the whole overview.
  const handleTogglePin = (list: ListSummary) => {
    const data = lists.data;
    if (!data) return;
    const all = [...data.private, ...data.shared];
    const targetPinned = !list.pinned;
    const cat = catOf(list);
    const targetSection = all.filter(
      (l) =>
        catOf(l) === cat && l.pinned === targetPinned && l.id !== list.id,
    );
    pinMut.mutate({
      list,
      pinned: targetPinned,
      sortOrder: topOfSection(targetSection),
    });
  };

  // Drag-reorder. Source of truth = the cached lists arrays; we slice them
  // by (category, pinned) into sortable sections and let each section own its
  // own SortableProvider so drag-swap is bounded within section. On drop,
  // build the new ordered ID list for the affected section, patch the cache
  // optimistically, then push the same payload to the server.
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
  // logic. Refuse cross-section drops (category/pin sections stay separate;
  // category changes go through the detail page, pin-state through the pin
  // click — neither happens by dragging across a section boundary).
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

      const { cat, pinned } = sectionParts(fromSection);
      // The section spans both private and shared lists of this category, so
      // we slice from the union and patch the sortOrder back into whichever
      // array each list lives in.
      const all = [...data.private, ...data.shared];
      const sectionRows = all
        .filter((l) => catOf(l) === cat && l.pinned === pinned)
        .sort(byPinThenSort);

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
          .sort(byPinThenSort);

      // `data` is the pre-patch snapshot (patch() returns fresh arrays, so the
      // original object's arrays are untouched) — hand it to the mutation as
      // the rollback target before overwriting the cache.
      const prev = data;
      queryClient.setQueryData(listsQueryKey, {
        private: patch(data.private),
        shared: patch(data.shared),
      });

      reorderMut.mutate({ orderedListIds: nextSection.map((l) => l.id), prev });
    },
  );

  return (
    <main class="w-full">
      <CoverBackdrop coverUrl={washCover() ?? defaultWash()} />
      <PageHeader title="Listen" />

      <ColumnGuide />

      <DragDropProvider
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        collisionDetector={closestCenter}
      >
        <MovePointerSensor />
        <div class="flex flex-col md:flex-row md:items-start">
          {/* Linke Spalte 2/3 — Einladungen + Kategorie-Sektionen */}
          <div
            class="md:w-2/3"
            onMouseLeave={() => setWashCover(null)}
          >
            <InvitationsInbox />
            <Show
              when={lists.data}
              fallback={
                <BentoModule label="Meine Listen" number="01">
                  <ListRowsSkeleton />
                </BentoModule>
              }
            >
              <Show
                when={sections().length > 0}
                fallback={
                  <BentoModule label="Meine Listen" number="01">
                    <PrivateEmpty />
                  </BentoModule>
                }
              >
                <For each={SECTION_ORDER}>
                  {(s) => (
                    // Non-keyed Show: toggles only when the category gains its
                    // first / loses its last list — reference churn in
                    // sections() never remounts the module.
                    <Show when={sectionOf(s.cat)}>
                      <BentoModule
                        label={s.label}
                        number={numberOf(s.cat)}
                        class={
                          s.cat !== lastCat() ? "border-b border-rule" : undefined
                        }
                      >
                        <ListRows
                          lists={sectionOf(s.cat)?.lists ?? []}
                          cat={s.cat}
                          dragSettling={dragSettling}
                          onHover={(l) => setWashCover(washOf(l))}
                          onTogglePin={handleTogglePin}
                        />
                      </BentoModule>
                    </Show>
                  )}
                </For>
              </Show>
            </Show>
          </div>

          {/* Rechte Spalte 1/3 — Neue Liste */}
          <div class="border-t border-rule md:w-1/3 md:border-t-0">
            <BentoModule label="Neue Liste" number={pad2(rightNumber())}>
              <CreateListForm />
            </BentoModule>
          </div>
        </div>
      </DragDropProvider>
    </main>
  );
}

// Category sections are the grouping axis. CatKey is a list's category, or
// "none" for the uncategorized "Meine Listen" bucket. The drag SectionKey
// pairs that with pin-state so onDragEnd can refuse cross-section drops.
type CatKey = "none" | ListCategory;
type SectionKey = `${CatKey}-pinned` | `${CatKey}-unpinned`;

interface SectionGroup {
  cat: CatKey;
  label: string;
  lists: ListSummary[];
}

/** Fixed render order: uncategorized first, then the five categories. Only
 *  non-empty sections are shown; numbering is consecutive over those. */
const SECTION_ORDER: { cat: CatKey; label: string }[] = [
  { cat: "none", label: "Meine Listen" },
  ...LIST_CATEGORIES.map((c) => ({ cat: c.value as CatKey, label: c.label })),
];

function catOf(list: ListSummary): CatKey {
  return list.category ?? "none";
}

function sectionKey(cat: CatKey, pinned: boolean): SectionKey {
  return `${cat}-${pinned ? "pinned" : "unpinned"}` as SectionKey;
}

function sectionParts(key: SectionKey): { cat: CatKey; pinned: boolean } {
  // CatKey values never contain "-", and the suffix is the last segment.
  const i = key.lastIndexOf("-");
  return {
    cat: key.slice(0, i) as CatKey,
    pinned: key.slice(i + 1) === "pinned",
  };
}

/** Pinned-first, then by sort_order ASC within each section. */
const byPinThenSort = (a: ListSummary, b: ListSummary) =>
  a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.sortOrder - b.sortOrder;

const pad2 = (n: number) => String(n).padStart(2, "0");

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
  cat: CatKey;
  dragSettling: () => boolean;
  onHover?: (list: ListSummary) => void;
  onTogglePin: (list: ListSummary) => void;
}) {
  // Two sortable groups per category — pinned + unpinned. Each section's
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
              cat={props.cat}
              dragSettling={props.dragSettling}
              onHover={props.onHover}
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
              cat={props.cat}
              dragSettling={props.dragSettling}
              onHover={props.onHover}
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
  cat: CatKey;
  dragSettling: () => boolean;
  onHover?: (list: ListSummary) => void;
  onTogglePin: (list: ListSummary) => void;
}) {
  const sortable = createSortable(props.list.id, {
    section: sectionKey(props.cat, props.list.pinned),
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
        onMouseEnter={() => props.onHover?.(props.list)}
      >
        <A
          href={`/lists/${props.list.shortCode}`}
          // F7 — whole-row drag on pointer-fine devices (see canDragRowBody).
          // Click navigates; movement starts a reorder. Touch keeps scroll/tap
          // + drags via the grip handle.
          draggable={false}
          class="flex min-w-0 flex-1 select-none items-center gap-3"
          {...(canDragRowBody ? sortable.dragActivators : {})}
        >
          <ListCover
            coverUrl={props.list.coverUrl}
            seed={props.list.coverSeed}
            alt=""
            pinned={props.list.pinned}
            class="size-11 shrink-0 overflow-hidden"
          />
          <div class="min-w-0 flex-1">
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
          </div>
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
        Lege rechts eine neue Liste an. Gib ihr eine Kategorie, und sie bekommt
        hier ihre eigene Sektion — oder lass sie auf „Alle", dann bleibt sie
        unter „Meine Listen".
      </p>
    </div>
  );
}
