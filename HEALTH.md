# Nakama — Health & Refactoring Backlog

Working document. Jeder Bundle ist eine in sich geschlossene atomic-PR-Einheit; sequenziert nach Impact + Dependency. **Status** kriegt einen Commit-SHA wenn done. Pflegen wenn ein Bundle landet oder neue Findings auftauchen.

**How to use (für künftige Sessions):** lies nach handshake.md. Die Bundles beschreiben durable Refactoring-Intents — sie überleben Sessions bis abgehakt. Mark done mit Commit-SHA, dann kann future-Claude per `git log` verifizieren statt nochmal zu surveyen.

---

## Findings reference

Findings bleiben kurz — volle Begründung steht in der Session die sie aufgedeckt hat (siehe `git log` rund um den HEALTH.md-Initialcommit). Bundle-Einträge referenzieren per ID.

### Performance × user-visible

- ~~**A1**~~ — `getItemsWithNewEpisodes` doppelt aufgerufen pro /lists+detail flow → **gefixt 7ab0563** (Bundle 1): Helper jetzt scopable, kein doppelter Call
- ~~**A2**~~ — `listsQueryOptions` queried `list_items` zweimal → **gefixt 7ab0563** (Bundle 1): eine Query mit embedded items.type
- ~~**A3**~~ — `listItemsQueryOptions` fetcht globale new-items Map → **gefixt 7ab0563** (Bundle 1): list-scoped, scant nur N statt M Items
- **A4** — `newEpisodeSinceLastWatch` limit-2000 cliff bei Heavy-Watchers (home.ts:226)
- **A5** — `episodesQueryOptions` 4-5 Round-Trips pro Item-Page-Load
- **A6** — `WATCH_FETCH=250` zu klein für aktive geteilte Listen (home.ts:113)

### Correctness / robustness

- **B1** — `setListPin`/`setListItemPin` nicht atomar vs `reorder*` RPCs (race auf sort_order)
- **B2** — `.select()` silent-RLS-check inkonsistent: fehlt in `removeListItem`, `deleteList`, `moveListItem`, `toggleEpisode` → **teilweise gefixt 68d631b** (Bundle 1): `removeListItem` + `moveListItem` jetzt mit `.select() + null-check`. `deleteList` (owner-gated) + `toggleEpisode` (idempotent) bewusst gelassen — landet in Bundle 6 falls überhaupt
- **B3** — Stamp-on-Failure in `enrichJikanTitles`/`enrichMangaDexTitles` silenced transiente API-Fehler permanent (episodes.ts:232, :299)
- **B4** — `cascadeMut` optimistic-count nur korrekt für visible window (ItemDetail.tsx:170-189); off-window cascade flasht falschen `watched` bis onSettled
- **B5** — AddSheet `origin()` einmal beim Mount gemessen — Resize während offen → falscher Close-Morph
- **B6** — Logbuch self-toggle Frame-Flicker beim Mount; localStorage-Read nach erstem Paint (Home.tsx:498)

### Code quality / DRY

- **C1** — Drag-Reorder-Logik 95% dupliziert zwischen Lists.tsx (164-219) und ListDetail.tsx (122-207)
- **C2** — Pin-Toggle-Handler dupliziert (gleicher `minSort - 1` Algorithmus)
- **C3** — `enrichJikanTitles` und `enrichMangaDexTitles` ~80% identisch (episodes.ts:175 vs :251)
- **C4** — Inline-Jikan in `storeEpisodes` überlappt mit `enrichJikanTitles` backfill
- **C5** — `dayOffset`/`formatDate`/`typeLabel`/`typeInitial` parallel in Home + ItemDetail + ListDetail
- **C6** — PostgREST embed-unwrap (`?.[0]?.count ?? 0`) und `[...new Set(...)]` 6+ Mal repeated
- **C7** — `toggleMut` delta-Arithmetik unnötig kompliziert (ItemDetail.tsx:127-128) — reduzierbar auf `ep.watched ? -1 : 1`
- **C8** — `console.error` an 12+ Stellen ohne Telemetry → defer bis Phase 7 + Hosting steht

### Defensive (keine Action geplant)

- **D1** — `Math.min(...nums)` Spread bei großen Bundles (theoretisch, kein realer Case)
- **D2** — Inkonsistente Timer-Typen (`number | null` vs `ReturnType<typeof setTimeout>`)
- **D3** — Realtime-Cleanup unawaited Promise — kein beobachtetes Symptom

---

## Bundles

### Bundle 1 — Query-Effizienz auf /lists + /lists/:shortCode

**Adressiert:** A1, A2, A3, B2 (list-mutations)
**Status:** ✅ **DONE** — branch `bundle/1-query-efficiency-lists`
  - 7ab0563 — refactor(lists): scope new-episode helper + dedup list_items queries
  - 68d631b — fix(lists): silent-RLS detection on remove + move mutations

**Outcome:**
- `findItemsWithNewEpisodes(userId, itemIds)` ersetzt globalen Helper; Type-Resolution wandert zum Caller (er hat's eh).
- `/lists` cold-load: 4-5 → 3 critical-path Round-Trips
- `/lists/:short` cold-load: 4 → 3 critical-path Round-Trips. Datenmenge im Helper: M (alle User-Items) → N (Items in Scope).
- `removeListItem` + `moveListItem` werfen jetzt bei silent-RLS-Block statt false success.

---

### Bundle 2 — Drag-Reorder + Pin-Toggle DRY

**Adressiert:** C1, C2
**Status:** TODO
**Why now:** Phase 6 Kalender wird vermutlich weitere sortable Surface bringen (Tag-Pane?). Hook ready → neue Surface bekommt das Pattern gratis.

**Scope:**
- `useSortableList<T>`-Hook in `src/lib/sortable.ts` extrahieren
- `computePinSortOrder<T>` Helper
- Lists.tsx + ListDetail.tsx konsumieren

**Estimated:** ~120 Zeilen Net-Reduktion.

---

### Bundle 3 — Episode-Enrichment unify

**Adressiert:** C3, C4, B3
**Status:** TODO
**Why now:** vor Phase 7. Shared lists multiplizieren Enrichment-Trigger (jeder co-member Visit re-checked). Dedup + permanent-silence-Fix jetzt = shared-list Metadata bleibt zuverlässig.

**Scope:**
- `bulkBackfillTitles(item, fetchTitles, opts)` Helper
- Version-Stamp nur bei PERMANENTEN Failures (no MAL-Link / no MangaDex-Match) — NICHT bei transienten API-Errors
- `storeEpisodes` inline-Jikan → durch Helper ersetzen

**Estimated:** ~150 Zeilen Reduktion.

---

### Bundle 4 — Shared format/type helpers

**Adressiert:** C5, C6
**Status:** TODO
**Why now:** Phase 6 Kalender braucht Date-Formatting; canonical Helper besser als yet-another inline.

**Scope:**
- Neue `src/lib/format.ts`:
  - Date: `dayOffset`, `formatDate`, `relTime`, `dateLabel`, `MONTH_ABBR_3`
  - Media-Type: `typeLabel`, `typeInitial`, `episodeCode`, `nextLabel`, `rangeLabel`, `newReleaseLabel`
  - PostgREST: `embedCount`, `unique`
- Inline-Duplikate in Home/ItemDetail/ListDetail ersetzen

**Estimated:** ~80 Zeilen Reduktion.

---

### Bundle 5 — Logbuch + Home Correctness via RPCs

**Adressiert:** A4, A6, B6
**Status:** TODO (braucht DB-Migration — manuell beim User)
**Why now:** strukturelle Antwort auf „Sharing wird das verschärfen". Server-side Aggregation > client-side LIMIT-and-hope.

**Scope:**
- Neue RPCs:
  - `last_watch_per_item(user_id, item_ids)` — exakte per-item max
  - `last_released_per_item(item_ids)` — exakte per-item max air_date
  - Bucket-per-actor für Logbuch (window function oder grouped LIMIT)
- `newEpisodeSinceLastWatch` (home.ts:215) → RPC-Konsument
- Logbuch raw-watch fetch → bucketed RPC
- localStorage-Read in Logbuch synchron BEIM SETUP, nicht in `onMount` (no flicker)

**Estimated:** Medium. SQL-Migration im Chat liefern, User fährt manuell.

---

### Bundle 6 — Optimistic + Mutation Correctness

**Adressiert:** B2 (rest), B4, C7
**Status:** TODO
**Why now:** kleiner Cleanup, kann jede Session landen.

**Scope:**
- `toggleMut` delta-Arithmetik simplifizieren (`ep.watched ? -1 : 1`)
- Off-window cascade: server-side count-fetch on settle (oder explicit comment im Code)
- `.select()`-Konsistenz: durchziehen wo noch nicht (`removeListItem`, `deleteList`, `moveListItem`, `toggleEpisode`)

**Estimated:** ~40 Zeilen.

---

### Bundle 7 — AddSheet Origin Re-measure + Pin-Race

**Adressiert:** B1, B5
**Status:** TODO
**Why now:** Phase 8 Polish, oder sooner wenn einer der Bugs hits.

**Scope:**
- `ResizeObserver` auf `[data-add-anchor]` während AddSheet open → `origin()` bleibt fresh
- Pin-Mutations atomar via neue RPCs `set_list_pin` / `set_list_item_pin` mit server-side sort_order Assignment

**Estimated:** Klein, aber Pin-Atomicity braucht DB-Migration.

---

## Deferred (aktuell kein Sinn)

- **C8** — Telemetry-Layer statt `console.error`: wait für Phase 7 + Hosting steht. Ohne shared User-Base bringt's nichts.
- **D1** — `Math.min(...)` Spread: theoretisch, kein realer Bug.
- **D2** — Timer-Typen-Konsistenz: kosmetisch.
- **D3** — Realtime cleanup Promise: kein beobachtetes Symptom.

Aufschieben bis: bei nächstem Survey re-evaluieren; falls Symptom auftaucht → Bundle erstellen.

---

## Suggested execution order

1. ~~**Bundle 1**~~ — done
2. **Bundle 2** — Phase 6 prep, reduces complexity
3. **Bundle 4** — klein, gewinnt Lesbarkeit, helpful für Bundle 5
4. **Bundle 6** — low-risk Cleanup, kann zwischendurch
5. **Bundle 3** — vor Phase 7
6. **Bundle 5** — vor Phase 7, DB-Migration
7. **Bundle 7** — Phase 8 oder bei Bug-Hit früher

Jeder Bundle ist independent — Reihenfolge umstellen wenn Kontext es verlangt.
