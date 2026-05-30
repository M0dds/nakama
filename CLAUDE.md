# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user. **Stand:** Phase 1-7 done. **Phase 7 Sharing gelandet:** `src/lib/queries/sharing.ts` + `MembersModule` (Roster/Invite/Revoke/Transfer/Leave auf `/lists/:shortCode` Modul 03), `InvitationsInbox` (Karten auf `/lists`) + Nav-Badge am Listen-Tab (global + Realtime), `SyncToggle` im Item-Details-Modul (via Router-Link-State, nur aus geteilter Liste, Backfill), Auto-Sync-Fan-out für Ticks (`toggle_episode_synced` + neuer `mark_episodes_watched_synced` → Migration `20260530120000`), `CoWatcherMark` Mitseher-Indikator (Auge + Avatar-Hover) in Item-Folgenliste + Kalender-Tag-Pane, `Avatar`-Primitive. Phase 6 Kalender (`/calendar`), Phase 5 Home Dashboard, „Neue Folge"-Badges, Jikan + MangaDex Title-Fallback, RowActions-Cluster, Cross-Cutting Cache-Pattern (`listsQueryKey` + `["list"]`-Prefix), `highResCover()`. **Nächster Schritt: Phase 8 Polish-Pass (Route-Transitions, Skeletons, Cover-Fade-in).**

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`). User asks for atomic commits and to pflege git throughout a session.
- Dev: `npm run dev` on port 5173 (kann auf 5174 ausweichen wenn 5173 belegt).

**Next concrete steps** (see handshake §Offene Punkte for full detail):
1. **Phase 7 ABGESCHLOSSEN + mit zwei Accounts getestet, stabil.** Branch `phase/7-sharing` (~15 Commits) — **Stand letzter Session: NICHT nach `main` gemerged** (zuerst mergen, dann weiterbauen). Beide neuen Migrationen sind im Supabase-Projekt angewendet: `20260530120000` (Auto-Sync-Cascade `mark_episodes_watched_synced` + Re-Assert von `toggle_episode_synced`) + `20260530140000` (Realtime-Publication: `list_items`/`list_members` etc.). Session-Fixes danach: Realtime-Burst-Coalescing in `useRealtimeInvalidation` (Sturm bei Cascade auf langen Anime + Sync-Fan-out), Finished-Show-Titel-Bug (`selectTitleGaps` inkl. NULL-air_date, `TITLE_ENRICHMENT_VERSION` → 4), Inbox in linke Spalte + Hover, Co-Watcher-`.limit(5000)`, Leave-im-Aside (`LeaveListButton`), Transfer als Krone-Icon in der Mitglieder-Zeile.
2. **GEWÄHLTE nächste Richtung: Phase 7-Reste.** (a) Sonner/Toast — Trigger jetzt da (Invite akzeptiert während User woanders, etc.), bisher alles inline. (b) Logbuch-Welle-2 — `missed`-Events (released-but-unticked als Quick-Tick-CTA) + `ownership_transfer`-Events; Logik liegt in Logbook `src/lib/logbook.ts`. (c) Mitseher-Avatare im Logbuch-Feed (aktuell nur Satzform „@lisa hat …").
3. **Erst-Schritt im neuen Chat:** Branch `phase/7-sharing` → `main` mergen (Build ist grün), dann mit Phase 7-Reste starten.
4. Danach offen: Phase 8 Polish (Route-Transitions, Skeletons, Cover-Fade-in), Phase 9 Deploy/Hosting, DB-Verifikation (Logbook-Migrationen waren in der Live-DB unvollständig — Publication/RPCs gegen DB abgleichen + als Nakama-Migrationen tracken). Deferred Health-Findings: A5, C8, D1-D3.
5. Bei kleinen User-Wünschen: gleich abarbeiten. Atomar committen.

@AGENTS.md
@handshake.md
@HEALTH.md
