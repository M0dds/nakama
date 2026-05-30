import { createSignal, onCleanup, onMount } from "solid-js";
import {
  transformStyle,
  useDragDropContext,
  type DragEvent,
} from "@thisbeyond/solid-dnd";

/** solid-dnd doesn't export the `Transform` type itself — only the
 *  `transformStyle` consumer of it. Derive it back via Parameters so our
 *  helper's signature stays aligned with whatever shape the library uses. */
type Transform = Parameters<typeof transformStyle>[0];

/**
 * Shared building blocks for drag-reorderable surfaces (currently /lists
 * and /lists/:shortCode). The two surfaces have different data shapes —
 * grouped object vs flat array, four sections vs two — but they share:
 *
 *   - the hover-bg suppression window from drag-start through the settle
 *     after drop (otherwise rows sliding under the cursor pick up :hover
 *     for a frame, reads as bg flicker)
 *   - the pin-toggle sortOrder math (place the just-pinned row at the top
 *     of its target section: MIN - 1)
 *   - the within-section reorder math (find-from-index, splice, build a
 *     new sortOrder map)
 *   - the inline row-transform style (0s while actively dragging, settle
 *     duration otherwise)
 *
 * Per-surface concerns stay with the consumer: which sections exist, how
 * cross-section drops are refused, the cache patch shape, which mutation
 * to fire.
 */

/** Settle window after a drop. Matches the `transform` transition duration
 *  on each sortable row so the dragged item visually lands at the same
 *  moment hover-bg comes back. */
export const SETTLE_MS = 220;

/**
 * Drag bookkeeping: a `dragSettling` signal that's true from drag-start
 * through SETTLE_MS after drop, plus the two handlers to wire into
 * `<DragDropProvider>`. The reorder logic is the caller's; we just wrap it
 * so the settle timer runs unconditionally (even on early-returns) — a row
 * animating back to its origin still produces a visual settle that should
 * suppress hover.
 */
export function useDragSettling(handler: (e: DragEvent) => void) {
  const [dragSettling, setDragSettling] = createSignal(false);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (settleTimer) clearTimeout(settleTimer);
  });

  const onDragStart = () => {
    if (settleTimer) clearTimeout(settleTimer);
    setDragSettling(true);
  };

  const onDragEnd = (e: DragEvent) => {
    // Settle is scheduled before the reorder logic so any early-return
    // path still cleans up the suppression.
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => setDragSettling(false), SETTLE_MS);
    handler(e);
  };

  /** Trigger one settle window for a NON-drag reflow that slides rows under a
   *  stationary cursor — e.g. a pin toggle that re-sorts a section. Without
   *  this the rows passing under the pointer each pick up :hover for a frame,
   *  reading as the same bg flicker the drag path already suppresses. Call it
   *  as the optimistic re-sort is applied. */
  const settle = () => {
    if (settleTimer) clearTimeout(settleTimer);
    setDragSettling(true);
    settleTimer = setTimeout(() => setDragSettling(false), SETTLE_MS);
  };

  return { dragSettling, onDragStart, onDragEnd, settle };
}

/**
 * Replacement pointer sensor for solid-dnd 0.7.5, used INSTEAD of the stock
 * <DragDropSensors />. The stock PointerSensor has two faults that wedge the
 * whole drag system:
 *
 *   1. It activates a drag on a stationary 250 ms press (hold-to-drag), so a
 *      plain click on the handle — no movement — starts a drag. If the ensuing
 *      pointerup isn't delivered to its document listener (e.g. implicit
 *      pointer-capture released when the row re-renders, or a browser pointer
 *      cancel), `dragEnd`/`sensorEnd` never run: `state.active.sensorId` stays
 *      set, which makes `draggableActivators` short-circuit EVERY future press
 *      (`if (state.active.sensor) break`). Result: one stuck row + no element
 *      draggable at all, until reload.
 *   2. It never listens for `pointercancel`, so a genuinely cancelled drag
 *      leaks the same way.
 *
 * This sensor activates ONLY on movement past a small threshold — a click that
 * doesn't move never enters drag state, so it can't get stuck — and tears down
 * on pointerup AND pointercancel, removing every listener it added. It drives
 * the same context actions the stock sensor does, so createSortable/closest-
 * Center/transforms all behave identically once a drag is actually underway.
 */
const ACTIVATION_DISTANCE = 8;

export function MovePointerSensor() {
  const ctx = useDragDropContext();
  if (!ctx) return null;
  const [state, actions] = ctx;
  const { addSensor, removeSensor, sensorStart, sensorMove, sensorEnd, dragStart, dragEnd } =
    actions;
  const id = "nakama-move-pointer-sensor";
  const isActiveSensor = () => state.active.sensorId === id;

  const origin = { x: 0, y: 0 };
  let pendingDraggableId: string | number | null = null;

  const attach = (event: PointerEvent, draggableId: string | number) => {
    if (event.button !== 0) return; // primary button / touch only
    pendingDraggableId = draggableId;
    origin.x = event.clientX;
    origin.y = event.clientY;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerEnd);
    document.addEventListener("pointercancel", onPointerEnd);
  };

  const detach = () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerEnd);
    document.removeEventListener("pointercancel", onPointerEnd);
  };

  const onPointerMove = (event: PointerEvent) => {
    const coordinates = { x: event.clientX, y: event.clientY };
    if (!state.active.sensor) {
      const dx = coordinates.x - origin.x;
      const dy = coordinates.y - origin.y;
      if (
        pendingDraggableId !== null &&
        Math.sqrt(dx * dx + dy * dy) > ACTIVATION_DISTANCE
      ) {
        sensorStart(id, origin);
        dragStart(pendingDraggableId);
      }
    }
    if (isActiveSensor()) {
      event.preventDefault();
      sensorMove(coordinates);
    }
  };

  const onPointerEnd = (event: PointerEvent) => {
    detach();
    pendingDraggableId = null;
    if (isActiveSensor()) {
      event.preventDefault();
      dragEnd();
      sensorEnd();
    }
  };

  onMount(() => {
    addSensor({ id, activators: { pointerdown: attach } });
    onCleanup(() => {
      detach();
      removeSensor(id);
    });
  });

  return null;
}

/**
 * sortOrder for placing a row at the top of `section`. The freshly-(un)
 * pinned row should float above its peers — `MIN(sortOrder) - 1` does that
 * without touching the rest. Returns 0 for an empty section.
 *
 * Caller pre-filters the section it wants (the pin-toggle handler knows
 * which side of the pin divide the row is moving INTO; this helper just
 * does the math).
 */
export function topOfSection(section: { sortOrder: number }[]): number {
  if (section.length === 0) return 0;
  return Math.min(...section.map((r) => r.sortOrder)) - 1;
}

/**
 * Within-section reorder. Returns `null` when the drop is invalid (same
 * index, missing ids); otherwise the reordered section + a 1-based
 * sortOrder map keyed by id.
 *
 * The caller is responsible for identifying which section the drag belongs
 * to + refusing cross-section drops; this helper handles only the move
 * inside a single section.
 */
export function reorderSection<T>(
  section: T[],
  fromId: string,
  toId: string,
  getId: (row: T) => string,
): { nextSection: T[]; sortMap: Map<string, number> } | null {
  const fromIndex = section.findIndex((r) => getId(r) === fromId);
  const toIndex = section.findIndex((r) => getId(r) === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;

  const nextSection = [...section];
  const [moved] = nextSection.splice(fromIndex, 1);
  nextSection.splice(toIndex, 0, moved);

  const sortMap = new Map<string, number>(
    nextSection.map((r, i) => [getId(r), i + 1]),
  );
  return { nextSection, sortMap };
}

/**
 * Inline style for a sortable row: solid-dnd's transform + a conditional
 * transition. 0s while dragging so cursor follow is 1:1; SETTLE_MS
 * ease-quart otherwise for smooth displacement of siblings + smooth
 * settle of the dropped row.
 */
export interface SortableTransformProps {
  transform: Transform;
  isActiveDraggable: boolean;
}

export function sortableRowStyle(sortable: SortableTransformProps) {
  return {
    ...transformStyle(sortable.transform),
    transition: sortable.isActiveDraggable
      ? "transform 0s"
      : `transform ${SETTLE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
  };
}
