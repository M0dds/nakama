# Nakama — Health & Refactoring Backlog

Working document. Lies nach handshake.md. **Offene Findings stehen oben**; der Bundle-Log unten ist Historie (erledigt, per `git log` rund um die SHAs verifizierbar — nicht nochmal surveyen). Neues Finding → oben eintragen; wird's ein eigener PR → als Bundle-Zeile in den Log nachziehen, sobald gelandet (mit Commit-SHA).

---

## Offen

Volle Begründung je Finding steht in der Session die es aufdeckte (`git log` rund um den HEALTH.md-Initialcommit).

- **A5** — `episodesQueryOptions` macht 4-5 Round-Trips pro Item-Page-Load. Noch nicht angefasst.
- **C8** — `console.error` an 12+ Stellen ohne Telemetry. **Deferred bis Hosting steht** (Phase 9) — ohne shared User-Base bringt ein Telemetry-Layer nichts.
- **D1** — `Math.min(...nums)` Spread bei großen Bundles (theoretisch, kein realer Case). Keine Action geplant.
- **D2** — Inkonsistente Timer-Typen (`number | null` vs `ReturnType<typeof setTimeout>`). Kosmetisch.
- **D3** — Realtime-Cleanup unawaited Promise. Kein beobachtetes Symptom.

Aufschieben bis: bei nächstem Survey re-evaluieren; falls Symptom auftaucht → Bundle erstellen.

---

## Erledigt (Bundle-Log)

Alle 7 Bundles gelandet + gemerged. Je Zeile: Finding-IDs · Kern-SHA · Outcome in einem Satz.

- **Bundle 1 — Query-Effizienz /lists + /lists/:shortCode** · A1, A2, A3, B2(list) · `7ab0563` + `68d631b` — `findItemsWithNewEpisodes(userId, itemIds)` ersetzt globalen Helper (M→N Items, kein Doppel-Call), `list_items`-Query dedupliziert; /lists + /lists/:short cold-load 4-5 → 3 Round-Trips; `removeListItem`/`moveListItem` werfen bei silent-RLS-Block.
- **Bundle 2 — Drag-Reorder + Pin-Toggle DRY** · C1, C2 · `6910499` + `3ca3fa8` — neue `src/lib/sortable.ts` (`useDragSettling`, `topOfSection`, `reorderSection`, `sortableRowStyle`, `SETTLE_MS`); beide Routen konsumieren sie (Lists.tsx -56, ListDetail.tsx -61).
- **Bundle 3 — Episode-Enrichment unify** · C3, C4, B3 · `508ac01` — shared `backfillTitles`-Core + dünne `enrichAnime`/`enrichManga`-Wrapper; `storeEpisodes` routet durch denselben Pfad (eine Implementierung); Version-Stamp nur bei non-transientem Run → transiente API-Fehler retrien beim nächsten Visit.
- **Bundle 4 — Shared format/type helpers** · C5, C6 · `b1d7951` + `d70169d` — neue `src/lib/format.ts` (Media-Types, Dates, PostgREST `embedCount()`/`unique()`); Home -89, ItemDetail -49, ListDetail -19.
- **Bundle 5 — Logbuch + Home Correctness via RPCs** · A4, A6, B6 · `1904167` + `242ba62` — `home_new_releases` + `home_watch_bundles` RPCs (beide SECURITY INVOKER); kein limit-2000-Cliff, Logbuch-Cap auf Bundles statt Rohzeilen, self-toggle ohne Frame-Flicker. **Migration `20260529120000` angewendet** (2026-05-29, verifiziert).
- **Bundle 6 — Optimistic + Mutation Correctness** · B2(rest), B4, C7 · `d0cf97e` — `toggleMut`-Delta auf `ep.watched ? -1 : 1`; `cascadeMut` off-window flash dokumentiert (onSettled korrigiert); `deleteList` mit `.select()` (Phase-7 Race-Defense). `toggleEpisode` bewusst ohne `.select()` (Idempotenz → 0-rows mehrdeutig).
- **Bundle 7 — AddSheet Origin Re-measure + Pin-Race** · B1, B5 · `b7a2180` + `b22c9f5` + `657102d` (+ Follow-up `b9d37aa`) — `measureOrigin()` auch im resize-Handler; atomare `set_list_pin`/`set_list_item_pin` RPCs (sort_order server-side, kein stale-cache-Race); AddSheet-Preselect-Bug mitgefixt. **Migration `20260529130000` angewendet** (2026-05-29, verifiziert).

Auch außerhalb der Bundles geschlossen: **A7** (`listsQueryOptions` pairs-Query → explizites `.limit(5000)`, `79a5863`, Phase 7e).
