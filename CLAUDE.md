# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user. **Stand:** Phase 1-7 done. **Phase 7 Sharing gelandet:** `src/lib/queries/sharing.ts` + `MembersModule` (Roster/Invite/Revoke/Transfer/Leave auf `/lists/:shortCode` Modul 03), `InvitationsInbox` (Karten auf `/lists`) + Nav-Badge am Listen-Tab (global + Realtime), `SyncToggle` im Item-Details-Modul (via Router-Link-State, nur aus geteilter Liste, Backfill), Auto-Sync-Fan-out für Ticks (`toggle_episode_synced` + neuer `mark_episodes_watched_synced` → Migration `20260530120000`), `CoWatcherMark` Mitseher-Indikator (Auge + Avatar-Hover) in Item-Folgenliste + Kalender-Tag-Pane, `Avatar`-Primitive. Phase 6 Kalender (`/calendar`), Phase 5 Home Dashboard, „Neue Folge"-Badges, Jikan + MangaDex Title-Fallback, RowActions-Cluster, Cross-Cutting Cache-Pattern (`listsQueryKey` + `["list"]`-Prefix), `highResCover()`. **Phase 7 + Phase 7-Reste nach `main` gemerged:** Logbuch-Welle-2 (`missed` — nur für begonnene Items — + `ownership_transfer` Events mit „Abhaken"-Quick-Tick), Co-Member-Avatare im Logbuch-Feed (`EventGlyph`), Toast-System (`src/lib/toast.tsx` + `Toaster`, top-right + Fortschrittsbalken + Swipe-to-dismiss, Trigger auf Einladung/Liste/Transfer/Item-Aktionen), ErrorBoundary in `App.tsx`, `MovePointerSensor` (eigener move-only Drag-Sensor). **Danach Session-Politur (alles in `main`):** öffentliche Feature-Seite `/features`, Air-Zeit-Anzeige (Was kommt/Item/Kalender), `missed` nur für begonnene Items, dynamisches Kalender-Range-Read, „30. MAI"-Datumsformat. **Nächster Schritt: Phase 8 Polish-Pass (Route-Transitions, Skeletons, Cover-Fade-in, Theme-Switch-Transition).**

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`). User asks for atomic commits and to pflege git throughout a session.
- Dev: `npm run dev` on port 5173 (kann auf 5174 ausweichen wenn 5173 belegt).

**Next concrete steps** (see handshake §Offene Punkte for full detail):
1. **Alles bis einschließlich Phase 7-Reste + UX-Politur ist nach `main` gemerged.** Build grün (`npm run build` = `tsc -b && vite build`), Working Tree clean, **keine offenen Feature-Branches**. Alle 5 Migrationen committet + angewendet (`20260528200000`, `…29120000`, `…29130000`, `…30120000`, `…30140000`) — **keine offene Migration**. Seit Phase 7-Reste dazugekommen (alles in `main`): öffentliche **Feature-/Landingpage `/features`** (`src/routes/Features.tsx`, public/standalone, von Login verlinkt); **Air-Zeit-Anzeige** (AniList `airingAt` → voller `air_date`-Timestamp; gezeigt in „Was kommt" + Item-Folgenliste + Kalender-Tagespane via `timeLabel`/`hasAirTime`; `missed`-Abhaken ist zeitgated, Item-Seite tickt jederzeit); **`missed` nur für begonnene Items** (`fetchMissedCandidates` started-check); weitere **Toast-Trigger** (Item entfernt, Reset, Liste erstellt/gelöscht/verlassen) + **Swipe-to-dismiss**; **dynamisches anker-zentriertes Kalender-Range-Read**; Datumsformat **„30. MAI"** (3-Buchstaben-Monat, kein Trailing-Dot) in „Was kommt" + Kalender-Tagespane (`HEUTE · 30. MAI`, rechtsbündig). Plus ErrorBoundary (`App.tsx`) + `MovePointerSensor` (move-only Drag-Sensor, fixt Stuck-Drag).
2. **Nächster Schritt: Phase 8 Polish-Pass.** Route-Transitions (aktuell harte Swaps), Skeleton-States statt „Lade …"-Text, Cover-Fade-in beim onload, sanfte Theme-Switch-Transition (CSS-Vars flippen instant). Alles steht bereit — `main` ist der Stand, `npm run dev` auf Port 5173.
3. Danach: Phase 9 Deploy/Hosting, DB-Verifikation (Logbook-Migrationen gegen Live-DB abgleichen + als Nakama-Migrationen tracken). Deferred Health-Findings: A5, C8, D1-D3. **Nichts ist nach `origin` gepusht** (alles lokal) — falls Deploy ansteht, zuerst push klären.
4. Bei kleinen User-Wünschen: gleich abarbeiten. Atomar committen.

@AGENTS.md
@handshake.md
@HEALTH.md
