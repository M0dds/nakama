import { RefreshCw } from "lucide-solid";

/**
 * Shared error card for a failed query gate. Before this, a network error was
 * indistinguishable from emptiness on every route — the queries error out and
 * the gates fall through to "Diese Woche ruhig." / "Alles aufgeholt." / an
 * eternal skeleton, all of which read as truthful states.
 *
 * Mount it as the FIRST branch at a gate (`when={!q.isError}` around the
 * loading/empty gates) so an error never reaches the empty-state copy.
 * Empty-state idiom (bordered card, centered, calm copy) + the mono-caps
 * ghost button (ItemNotes' add-controls idiom) as the retry entry.
 */
export function QueryErrorCard(props: {
  /** Usually `() => void query.refetch()`. */
  onRetry: () => void;
  class?: string;
}) {
  return (
    <div
      class={`rounded-sm border border-border px-5 py-6 text-center ${props.class ?? ""}`}
    >
      <p class="text-body text-text">Konnte nicht geladen werden.</p>
      <p class="mt-1 text-body text-text-muted">
        Prüf deine Verbindung und versuch's nochmal.
      </p>
      <button
        type="button"
        onClick={() => props.onRetry()}
        class="mt-4 inline-flex items-center gap-1.5 rounded-xs border border-border px-3 py-1.5 font-mono text-mini uppercase tracking-wider text-text-muted transition-colors hover:border-text-muted hover:text-text"
      >
        <RefreshCw class="size-3.5" strokeWidth={1.75} aria-hidden />
        Nochmal versuchen
      </button>
    </div>
  );
}
