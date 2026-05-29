# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user. **Stand:** Phase 1-5 done. Phase 5 Home Dashboard gelandet (Was kommt accordion + Fortsetzen accordion + Logbuch mit bundled watch/list_add events). „Neue Folge"-Badges auf `/lists` + `/lists/:shortCode` + Fortsetzen-Rows. Jikan + MangaDex als Title-Fallback für AniList-Lücken (One Piece & Co), versioned-backfill für DB-Bestand. RowActions-Cluster (Pin + Reset/Move/Remove merged) auf Item-Rows. Cross-Cutting Cache-Pattern via `listsQueryKey` + `["list"]`-Prefix. Cover-Auflösung upgegradet via `highResCover()`. **Phase 6 (Kalender) ist der nächste große Schritt — optional Phase 8 Polish-Pass dazwischen.**

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`). User asks for atomic commits and to pflege git throughout a session.
- Dev: `npm run dev` on port 5173 (kann auf 5174 ausweichen wenn 5173 belegt).

**Next concrete steps** (see handshake §Offene Punkte for full detail):
1. **Health-Refactoring-Backlog ABGESCHLOSSEN.** Alle 7 Bundles erledigt (siehe `HEALTH.md` mit Commit-SHAs). Es bleiben nur die bewusst deferred Findings (A5 Item-Page-Round-Trips, C8 Telemetry, D1-D3 defensiv). Nakama hat jetzt einen eigenen `supabase/migrations/`-Ordner — drei Files (Phase-3-5-Catch-up + Bundle-5-Home-RPCs + Bundle-7-Pin-RPCs); alle im Supabase-Projekt angewendet. Migrationen weiterhin manuell im SQL-Editor fahren. Offene UX-Kleinigkeit: Dashboard-Row-Padding (Memory `home-dashboard-row-padding`).
2. **Phase 6: Kalender.** `/calendar` Route existiert noch nicht. Logbook hat eine Wochen-/Monatsansicht mit Tag-Pane + Quick-Tick — Vorlage zum portieren. Datenquellen sind die existierenden `episodes`-Tabellen + RPC `item_progress`.
3. **(Optional zwischendurch) Phase 8: Polish-Pass.** Route-Transitions, Skeleton-States, Cover-Fade-in, Theme-Switch-Transition.
4. Bei kleinen User-Wünschen vor Phase 6: gleich abarbeiten. Atomar committen.

@AGENTS.md
@handshake.md
@HEALTH.md
