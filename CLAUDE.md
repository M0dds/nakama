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
1. **Migration `20260530120000_mark_episodes_watched_synced.sql` anwenden** (manuell im SQL-Editor) — definiert den Auto-Sync-Cascade-RPC + re-asserted `toggle_episode_synced`. Bis dahin funktioniert der Single-Tap (RPC ist live), aber der Cascade „bis hier" wirft. `supabase/migrations/` hat jetzt vier Files.
2. **Phase 7 Sharing testen** — am besten mit zwei Accounts: Invite-Loop (Badge + Inbox + Realtime), Sync-Toggle + Backfill, Mitseher, Transfer/Leave. Siehe handshake §Verification-Gedanken.
3. **Phase 8: Polish-Pass.** Route-Transitions (hart geswapped), Skeleton-States statt „Lade …", Cover-Fade-in beim onload, Theme-Switch-Transition.
4. **Bewusst offen aus Phase 7:** Logbuch-Welle-2 (`missed` + `ownership_transfer` Events), dynamisches Kalender-Range-Read, Sonner/Toast (Trigger jetzt da). Deferred Health-Findings: A5, C8, D1-D3.
5. Bei kleinen User-Wünschen: gleich abarbeiten. Atomar committen.

@AGENTS.md
@handshake.md
@HEALTH.md
