# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user. **Stand:** Phase 1-7 done. **Phase 7 Sharing gelandet:** `src/lib/queries/sharing.ts` + `MembersModule` (Roster/Invite/Revoke/Transfer/Leave auf `/lists/:shortCode` Modul 03), `InvitationsInbox` (Karten auf `/lists`) + Nav-Badge am Listen-Tab (global + Realtime), `SyncToggle` im Item-Details-Modul (via Router-Link-State, nur aus geteilter Liste, Backfill), Auto-Sync-Fan-out für Ticks (`toggle_episode_synced` + neuer `mark_episodes_watched_synced` → Migration `20260530120000`), `CoWatcherMark` Mitseher-Indikator (Auge + Avatar-Hover) in Item-Folgenliste + Kalender-Tag-Pane, `Avatar`-Primitive. Phase 6 Kalender (`/calendar`), Phase 5 Home Dashboard, „Neue Folge"-Badges, Jikan + MangaDex Title-Fallback, RowActions-Cluster, Cross-Cutting Cache-Pattern (`listsQueryKey` + `["list"]`-Prefix), `highResCover()`. **Phase 7-sharing nach `main` gemerged. Phase 7-Reste gelandet (Branch `phase/7-reste`, noch nicht gemerged):** Logbuch-Welle-2 (`missed` + `ownership_transfer` Events mit „Abhaken"-Quick-Tick), Co-Member-Avatare im Logbuch-Feed (`EventGlyph`), Toast-System (`src/lib/toast.tsx` + `Toaster`, in AppShell; Trigger: Einladung empfangen + Accept-Bestätigung). **Nächster Schritt: `phase/7-reste` → `main` mergen, dann Phase 8 Polish-Pass (Route-Transitions, Skeletons, Cover-Fade-in).**

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`). User asks for atomic commits and to pflege git throughout a session.
- Dev: `npm run dev` on port 5173 (kann auf 5174 ausweichen wenn 5173 belegt).

**Next concrete steps** (see handshake §Offene Punkte for full detail):
1. **Phase 7-sharing nach `main` gemerged** (Fast-Forward, Build grün). Beide Migrationen sind im Supabase-Projekt angewendet: `20260530120000` (Auto-Sync-Cascade) + `20260530140000` (Realtime-Publication).
2. **Phase 7-Reste ABGESCHLOSSEN** auf Branch `phase/7-reste` (4 Commits, **noch NICHT nach `main` gemerged** — User-Review im Dev-Server zuerst, dann mergen): (a) **Logbuch-Welle-2** — `missed`-Events (neueste released-aber-ungetickte Folge pro getracktem Item, 14-Tage-Fenster, inline „Abhaken"-Quick-Tick via `mark_episodes_watched_synced`) + `ownership_transfer`-Events (aus `list_ownership_transfers`); Typen in `home.ts` zu Base/Item-Event gesplittet, Home-Realtime hört jetzt auch auf `list_ownership_transfers`. (b) **Co-Member-Avatare** im Logbuch-Feed (`actorProfiles` liefert `avatar_url`, `EventGlyph` zeigt Gesicht + Kind-Badge für Co-Member, eigene/missed bleiben Icon). (c) **Toast-System** — dependency-free `src/lib/toast.tsx` (Provider+`useToast`) + `Toaster` (liquid, z-30, in AppShell gemountet); Trigger: Einladung empfangen (global in BottomNav) + Accept-Bestätigung in `InvitationsInbox`.
   - **Offene Design-Frage zu missed:** zeigt aktuell ALLE getrackten Items mit released-aber-ungetickter Folge — auch nie gestartete (dort cascadet „Abhaken" alle Folgen). Faithful zu Logbook; ggf. auf „bereits begonnen" einschränken, falls zu laut.
3. **Erst-Schritt im neuen Chat:** Branch `phase/7-reste` → `main` mergen (Build grün), falls User das Review bestanden hat. KEINE neuen Migrationen nötig (`list_ownership_transfers` + RLS sind Logbook-Era, schon live; in Realtime-Publication seit `20260530140000`).
4. **Dann Phase 8 Polish** (Route-Transitions, Skeletons statt „Lade …"-Text, Cover-Fade-in, Theme-Switch-Transition). Danach Phase 9 Deploy/Hosting, DB-Verifikation (Logbook-Migrationen gegen Live-DB abgleichen + als Nakama-Migrationen tracken). Deferred Health-Findings: A5, C8, D1-D3.
5. Bei kleinen User-Wünschen: gleich abarbeiten. Atomar committen.

@AGENTS.md
@handshake.md
@HEALTH.md
