# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user. **Stand:** Phase 1-7 done. **Phase 7 Sharing gelandet:** `src/lib/queries/sharing.ts` + `MembersModule` (Roster/Invite/Revoke/Transfer/Leave auf `/lists/:shortCode` Modul 03), `InvitationsInbox` (Karten auf `/lists`) + Nav-Badge am Listen-Tab (global + Realtime), `SyncToggle` im Item-Details-Modul (via Router-Link-State, nur aus geteilter Liste, Backfill), Auto-Sync-Fan-out für Ticks (`toggle_episode_synced` + neuer `mark_episodes_watched_synced` → Migration `20260530120000`), `CoWatcherMark` Mitseher-Indikator (Auge + Avatar-Hover) in Item-Folgenliste + Kalender-Tag-Pane, `Avatar`-Primitive. Phase 6 Kalender (`/calendar`), Phase 5 Home Dashboard, „Neue Folge"-Badges, Jikan + MangaDex Title-Fallback, RowActions-Cluster, Cross-Cutting Cache-Pattern (`listsQueryKey` + `["list"]`-Prefix), `highResCover()`. **Phase 7 + Phase 7-Reste nach `main` gemerged:** Logbuch-Welle-2 (`missed` — nur für begonnene Items — + `ownership_transfer` Events mit „Abhaken"-Quick-Tick), Co-Member-Avatare im Logbuch-Feed (`EventGlyph`), Toast-System (`src/lib/toast.tsx` + `Toaster`, top-right + Fortschrittsbalken, Trigger auf Einladung/Liste/Transfer-Aktionen), ErrorBoundary in `App.tsx`, `MovePointerSensor` (eigener move-only Drag-Sensor). **Nächster Schritt: Phase 8 Polish-Pass (Route-Transitions, Skeletons, Cover-Fade-in, Theme-Switch-Transition).**

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`). User asks for atomic commits and to pflege git throughout a session.
- Dev: `npm run dev` on port 5173 (kann auf 5174 ausweichen wenn 5173 belegt).

**Next concrete steps** (see handshake §Offene Punkte for full detail):
1. **Phase 7 + Phase 7-Reste sind nach `main` gemerged** (Fast-Forward, Build grün, mit zwei Accounts getestet). Migrationen im Supabase-Projekt angewendet: `20260530120000` (Auto-Sync-Cascade) + `20260530140000` (Realtime-Publication). Phase 7-Reste = Logbuch-Welle-2 (`missed` + `ownership_transfer`), Co-Member-Avatare (`EventGlyph`), Toast-System (`src/lib/toast.tsx` + `Toaster`, top-right + Fortschrittsbalken, Trigger auf Einladung/Liste/Transfer-Aktionen). Plus Session-Fixes: ErrorBoundary in `App.tsx`, und `MovePointerSensor` (eigener move-only Drag-Sensor ersetzt `DragDropSensors` — fixt den Stuck-Drag-Bug, da ein stationärer Klick keinen Drag mehr startet).
2. **`missed`-Reichweite eingeschränkt** (Branch `fix/missed-started-only`): `fetchMissedCandidates` zeigt jetzt nur Items, die der User schon BEGONNEN hat (≥1 Watch, dritte Query mit `episodes!inner(item_id)`-Embed-Filter) — kein Cascade-Tick eines nie gestarteten Long-Runners mehr via „Abhaken".
3. **Nächster Schritt: Phase 8 Polish** (Route-Transitions, Skeletons statt „Lade …"-Text, Cover-Fade-in, sanfte Theme-Switch-Transition). Danach Phase 9 Deploy/Hosting, DB-Verifikation (Logbook-Migrationen gegen Live-DB abgleichen + als Nakama-Migrationen tracken). Deferred Health-Findings: A5, C8, D1-D3.
4. Optional offen: weitere Toast-Trigger (Item entfernt, Fortschritt zurückgesetzt), dynamisches Kalender-Range-Read.
5. Bei kleinen User-Wünschen: gleich abarbeiten. Atomar committen.

@AGENTS.md
@handshake.md
@HEALTH.md
