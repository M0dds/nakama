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
- ~~**A4**~~ — `newEpisodeSinceLastWatch` limit-2000 cliff bei Heavy-Watchers → **gefixt 242ba62** (Bundle 5): `home_new_releases` RPC aggregiert beide per-Item-Maxima server-side, ein Round-Trip, kein Cap
- **A5** — `episodesQueryOptions` 4-5 Round-Trips pro Item-Page-Load
- ~~**A6**~~ — `WATCH_FETCH=250` zu klein für aktive geteilte Listen → **gefixt 242ba62** (Bundle 5): `home_watch_bundles` RPC bündelt server-side, Cap gilt für Bundles statt Rohzeilen → kein Mid-Session-Truncate
- **A7** — `listsQueryOptions` pairs-Query (lists.ts:267) ohne explizites `.limit()` → PostgREST 1000-Row-Cap. Heute harmlos, aber Phase 7 Sharing multipliziert `list_items` über alle Member → `newCounts` würden für manche Listen still falsch (kein Error, kein Badge). Gleiche LIMIT-and-hope-Klasse wie A4/A6 + die `GAP_QUERY_LIMIT`-Falle in episodes.ts. Fix: explizites `.limit(5000)` als billige Versicherung.

### Correctness / robustness

- ~~**B1**~~ — `setListPin`/`setListItemPin` nicht atomar vs `reorder*` RPCs → **gefixt 657102d** (Bundle 7): neue `set_list_pin`/`set_list_item_pin` RPCs berechnen sort_order server-side im selben UPDATE wie pinned_at → kein client-read-then-write-Gap mehr (Migration `20260529130000`)
- ~~**B2**~~ — `.select()` silent-RLS-check inkonsistent → **gefixt 68d631b + d0cf97e**: `removeListItem` + `moveListItem` (Bundle 1), `deleteList` (Bundle 6, defends Phase-7-Ownership-Race). `toggleEpisode` bewusst gelassen — Idempotenz heißt 0-rows ist mehrdeutig, .select() würde false positives erzeugen
- ~~**B3**~~ — Stamp-on-Failure in `enrichJikanTitles`/`enrichMangaDexTitles` silenced transiente API-Fehler permanent → **gefixt 508ac01** (Bundle 3): `backfillTitles` returnt `ok:false` nur bei transientem Throw → Version-Gate bleibt offen, nächster Visit retried. Permanenter Miss (kein MAL-Link / kein MangaDex-Match) schließt das Gate weiterhin.
- ~~**B4**~~ — `cascadeMut` off-window flash → **dokumentiert d0cf97e** (Bundle 6): explicit Comment im Code; onSettled-Refetch korrigiert, bessere Schätzung wäre nicht möglich (Cache hat keine off-window Watch-States)
- ~~**B5**~~ — AddSheet `origin()` einmal beim Mount gemessen → **gefixt b7a2180** (Bundle 7): `measureOrigin()` läuft jetzt auch im resize-Handler → Close-Morph landet auf der aktuellen Pillen-Position
- ~~**B6**~~ — Logbuch self-toggle Frame-Flicker beim Mount → **gefixt 242ba62** (Bundle 5): `showSelf` liest localStorage synchron beim Signal-Setup statt in `onMount` (Home.tsx)

### Code quality / DRY

- ~~**C1**~~ — Drag-Reorder-Logik dupliziert → **gefixt 3ca3fa8** (Bundle 2): beide Routen konsumieren jetzt `useDragSettling` + `reorderSection` aus `src/lib/sortable.ts`
- ~~**C2**~~ — Pin-Toggle-Handler dupliziert → **gefixt 3ca3fa8** (Bundle 2): `topOfSection`-Helper
- ~~**C3**~~ — `enrichJikanTitles` und `enrichMangaDexTitles` ~80% identisch → **gefixt 508ac01** (Bundle 3): shared `backfillTitles`-Core + `selectTitleGaps`/`writeTitles`/`stampEnrichment`, dünne `enrichAnime`/`enrichManga`-Wrapper
- ~~**C4**~~ — Inline-Jikan in `storeEpisodes` überlappt mit Backfill → **gefixt 508ac01** (Bundle 3): `storeEpisodes` routet durch denselben Backfill-Pfad; Manga bleibt bei `fetchAniListEpisodes` (kein MangaDex-Doppel-Fetch)
- ~~**C5**~~ — `dayOffset`/`formatDate`/`typeLabel`/`typeInitial` parallel → **gefixt d70169d** (Bundle 4): canonical in `src/lib/format.ts`
- ~~**C6**~~ — PostgREST embed-unwrap + `[...new Set(...)]` repeated → **gefixt d70169d** (Bundle 4): `embedCount()` + `unique()` helpers
- ~~**C7**~~ — `toggleMut` delta-Arithmetik kompliziert → **gefixt d0cf97e** (Bundle 6): ternary-on-ternary kollabiert auf `ep.watched ? -1 : 1`, gleicher output
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
**Status:** ✅ **DONE** — branch `bundle/2-drag-reorder-dry`
  - 6910499 — feat(sortable): extract drag-reorder building blocks
  - 3ca3fa8 — refactor(lists): consume sortable helpers in /lists + /lists/:short

**Outcome:**
- Neue `src/lib/sortable.ts` mit `useDragSettling`, `topOfSection`, `reorderSection`, `sortableRowStyle`, `SETTLE_MS`
- Lists.tsx: 481 → 425 Zeilen (-56)
- ListDetail.tsx: 582 → 521 Zeilen (-61)
- Phase 6 Kalender (oder andere neue sortable Surface) bekommt das Pattern jetzt gratis

---

### Bundle 3 — Episode-Enrichment unify

**Adressiert:** C3, C4, B3
**Status:** ✅ **DONE** — branch `bundle/3-episode-enrichment-unify`
  - 508ac01 — refactor(episodes): unify title-enrichment + transient-failure gate

**Outcome:**
- Shared `backfillTitles`-Core (+ `selectTitleGaps`/`writeTitles`/`stampEnrichment`), dünne `enrichAnime`/`enrichManga`-Wrapper, dispatch via `enrichTitles`. Die zwei ~80%-identischen Funktionen sind weg.
- `storeEpisodes` routet jetzt durch denselben Backfill-Pfad → **eine** Title-Enrichment-Implementierung. Manga bleibt bei `fetchAniListEpisodes` (MangaDex läuft dort schon) — kein Doppel-Fetch.
- Version-Stamp gated auf non-transienten Run: Netzwerk-/Rate-Limit-/5xx-Throw → `ok:false`, Gate bleibt offen, nächster Visit retried. Permanenter Miss schließt das Gate weiter.
- Bonus: Gap-Pre-Check läuft VOR dem externen Fetch → Items ohne aired/untitled Gaps sparen den API-Call ganz (subsumed `hasAiredTitleGap`).
- Netto -21 Zeilen (die ~150-Schätzung war optimistisch; Wert liegt in B3-Korrektheit + Single-Path, nicht Zeilenzahl).

---

### Bundle 4 — Shared format/type helpers

**Adressiert:** C5, C6
**Status:** ✅ **DONE** — branch `bundle/4-format-helpers`
  - b1d7951 — feat(format): extract shared format/type/postgrest helpers
  - d70169d — refactor: consume format helpers across routes + queries

**Outcome:**
- Neue `src/lib/format.ts` mit drei Sektionen (Media-Types, Dates, PostgREST)
- Home.tsx -89, ItemDetail.tsx -49, ListDetail.tsx -19 Zeilen
- Phase 6 Kalender bekommt dayOffset/formatDate/dateLabel/MONTH_ABBR_3 gratis

---

### Bundle 5 — Logbuch + Home Correctness via RPCs

**Adressiert:** A4, A6, B6
**Status:** ✅ **DONE** — branch `bundle/5-home-correctness-rpcs`, gemerged. Migration `20260529120000_home_correctness_rpcs.sql` ist im Supabase-Projekt angewendet (2026-05-29, User-bestätigt, Dashboard verifiziert).
  - 1904167 — feat(db): home correctness RPCs — new-releases + watch-bundles
  - 242ba62 — refactor(home): consume home RPCs + fix logbuch self-toggle flicker

**Outcome:**
- Zwei RPCs (beide `SECURITY INVOKER`, matched `item_progress`-Konvention) statt der zwei vorgeschlagenen granularen — ein kombiniertes `home_new_releases` (beide per-Item-Maxima in einem Statement) ist für den einzigen Caller schlanker, und `home_watch_bundles` macht die Session-Bündelung via gaps-and-islands-Window-Pass server-side.
- A4: `newEpisodeSinceLastWatch` ist jetzt ein One-Round-Trip-RPC-Konsument, kein limit-2000-Cliff mehr.
- A6: Logbuch-Cap gilt für **Bundles statt Rohzeilen** → `WATCH_FETCH=250` weg, kein Mid-Session-Truncate. Spart außerdem den client-seitigen Episode-Resolution-Round-Trip + das `bundleWatches`-Port.
- B6: localStorage synchron beim Signal-Setup → kein Frame-Flicker.
- RLS-Sichtbarkeit unverändert: `episode_watches_select_co` (eigene + Co-Member) wird durch SECURITY INVOKER geerbt — keine handgebaute Visibility, kein Privacy-Leak-Risiko.

---

### Bundle 6 — Optimistic + Mutation Correctness

**Adressiert:** B2 (rest), B4, C7
**Status:** ✅ **DONE** — branch `bundle/6-mutation-correctness`
  - d0cf97e — fix: mutation correctness — toggle delta, cascade comment, deleteList .select()

**Outcome:**
- `toggleMut` delta auf `ep.watched ? -1 : 1` reduziert
- `cascadeMut` Off-window flash via explicit Comment dokumentiert (onSettled handlet's; bessere Schätzung wäre nicht möglich)
- `deleteList` mit `.select()` für Phase-7 Race-Defense
- `toggleEpisode` bewusst ohne `.select()` gelassen — Idempotenz macht 0-rows mehrdeutig

---

### Bundle 7 — AddSheet Origin Re-measure + Pin-Race

**Adressiert:** B1, B5 (+ AddSheet-Preselect-Bug, kein HEALTH-Finding, mitgenommen)
**Status:** ✅ **DONE** (Code) — branch `bundle/7-addsheet-origin-pin-race`. ⚠️ **Braucht Migration `20260529130000_atomic_pin.sql`** (nur für B1; B5 + Preselect sind client-only und laufen sofort).
  - b7a2180 — fix(addsheet): preselect current list + re-measure morph origin on resize
  - b22c9f5 — feat(db): atomic pin RPCs — set_list_pin + set_list_item_pin
  - 657102d — refactor(pin): route pin toggles through atomic RPCs

**Outcome:**
- B5: `measureOrigin()` extrahiert + auch im resize-Handler aufgerufen statt nur once-on-mount. Statt `ResizeObserver` (Scope-Vorschlag) reicht der schon vorhandene resize-Listener — ein Mess-Aufruf mehr, kein neuer Observer.
- B1: `set_list_pin`/`set_list_item_pin` RPCs (Stil gespiegelt von `reorder_*`) vergeben sort_order server-side im selben UPDATE → kein stale-cache-Race. TS-Mutations rufen RPCs, returnen void, werfen bei access-denied. Caller behalten den client-sortOrder nur fürs Optimistic.
- Bonus: AddSheet-Preselect-Bug (shortCode-vs-UUID-Mismatch) gleich mitgefixt, da dieselbe Datei.

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
2. ~~**Bundle 2**~~ — done
3. ~~**Bundle 4**~~ — done
4. ~~**Bundle 6**~~ — done
5. ~~**Bundle 3**~~ — done
6. ~~**Bundle 5**~~ — done (Migration `20260529120000` angewendet)
7. ~~**Bundle 7**~~ — Code done, ⚠️ Migration `20260529130000` (nur B1) muss noch laufen

Jeder Bundle ist independent — Reihenfolge umstellen wenn Kontext es verlangt.
