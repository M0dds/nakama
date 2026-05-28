import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { ChevronRight } from "lucide-solid";
import { createQuery } from "@tanstack/solid-query";
import { useAuth } from "@/lib/auth";
import {
  listsQueryKey,
  listsQueryOptions,
  type ListSummary,
} from "@/lib/queries/lists";
import { useRealtimeInvalidation } from "@/lib/realtime";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { BentoModule } from "@/components/BentoModule";
import { ColumnGuide } from "@/components/ColumnGuide";
import { CreateListForm } from "@/components/CreateListForm";

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

  return (
    <AppShell>
      <main class="w-full">
        <PageHeader title="Listen" />

        <ColumnGuide />

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
                      <ListRows lists={data().private} />
                    </Show>
                  </BentoModule>

                  <Show when={data().shared.length > 0}>
                    <BentoModule label="Geteilte Listen" number="02">
                      <ListRows lists={data().shared} />
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
      </main>
    </AppShell>
  );
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
 */
function ListRows(props: { lists: ListSummary[] }) {
  return (
    <ul class="-mx-5">
      <For each={props.lists}>
        {(list) => (
          <li class="relative after:absolute after:inset-x-5 after:bottom-0 after:h-px after:bg-border last:after:hidden">
            <A
              href={`/lists/${list.id}`}
              class="group block transition-colors hover:bg-surface"
            >
              <div class="flex items-center justify-between gap-4 px-5 py-3.5">
                <div class="min-w-0">
                  <h3 class="min-w-0 truncate text-body-lg font-medium text-text">
                    {list.name}
                  </h3>
                  <p class="mt-0.5 truncate font-mono text-mini uppercase tracking-wider text-text-muted">
                    {metaLine(list)}
                  </p>
                </div>
                <ChevronRight
                  class="size-4 shrink-0 text-text-muted transition-transform duration-200 ease-quart group-hover:translate-x-0.5 group-hover:text-text"
                  strokeWidth={1.75}
                />
              </div>
            </A>
          </li>
        )}
      </For>
    </ul>
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
