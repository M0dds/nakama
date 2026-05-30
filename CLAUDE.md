# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user. **Stand:** Phase 1-8 done. **Phase 7 Sharing gelandet:** `src/lib/queries/sharing.ts` + `MembersModule` (Roster/Invite/Revoke/Transfer/Leave auf `/lists/:shortCode` Modul 03), `InvitationsInbox` (Karten auf `/lists`) + Nav-Badge am Listen-Tab (global + Realtime), `SyncToggle` im Item-Details-Modul (via Router-Link-State, nur aus geteilter Liste, Backfill), Auto-Sync-Fan-out für Ticks (`toggle_episode_synced` + neuer `mark_episodes_watched_synced` → Migration `20260530120000`), `CoWatcherMark` Mitseher-Indikator (Auge + Avatar-Hover) in Item-Folgenliste + Kalender-Tag-Pane, `Avatar`-Primitive. Phase 6 Kalender (`/calendar`), Phase 5 Home Dashboard, „Neue Folge"-Badges, Jikan + MangaDex Title-Fallback, RowActions-Cluster, Cross-Cutting Cache-Pattern (`listsQueryKey` + `["list"]`-Prefix), `highResCover()`. **Phase 7 + Phase 7-Reste nach `main` gemerged:** Logbuch-Welle-2 (`missed` — nur für begonnene Items — + `ownership_transfer` Events mit „Abhaken"-Quick-Tick), Co-Member-Avatare im Logbuch-Feed (`EventGlyph`), Toast-System (`src/lib/toast.tsx` + `Toaster`, top-right + Fortschrittsbalken + Swipe-to-dismiss, Trigger auf Einladung/Liste/Transfer/Item-Aktionen), ErrorBoundary in `App.tsx`, `MovePointerSensor` (eigener move-only Drag-Sensor). **Danach Session-Politur (alles in `main`):** öffentliche Feature-Seite `/features`, Air-Zeit-Anzeige (Was kommt/Item/Kalender), `missed` nur für begonnene Items, dynamisches Kalender-Range-Read, „30. MAI"-Datumsformat. **Phase 8 Polish-Pass gelandet (alles in `main`):** Cover/Avatar-Fade-in beim Decode (`fadeOnLoad` in `src/lib/image-fade.ts`, WAAPI), formhaltende Skeleton-States statt „Lade …"-Text (`src/components/Skeleton.tsx`, pro Fläche), Theme-Switch-Crossfade (`applyTheme` + `theme-transition`-Regel in `@layer base` — unter Tailwinds `utilities`, damit eigene Transitions wie die Nav-Bubble nicht geclobbert werden). **Route-Transitions bewusst verworfen** (Tab-Tool cuttet hart — Apple-Linse; nicht erneut versuchen). Dazu Paletten-Refresh: Budapest + Medieval raus, **Onsen** (Teal/Koralle) + **Vesper** (Violett/Amber, komplementär) rein; ungenutztes `accent-secondary`-Token entfernt; handshake.md verschlankt. **Nächster Schritt: Phase 9 (Deploy/Hosting) — aber NICHTS ist nach `origin` gepusht (alles lokal); vor Deploy zuerst Push-Strategie klären.**

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`). User asks for atomic commits and to pflege git throughout a session.
- Dev: `npm run dev` on port 5173 (kann auf 5174 ausweichen wenn 5173 belegt).

**Next concrete steps** (see handshake §Offene Punkte for full detail):
1. **Phasen 1-8 sind durch, alles in `main`.** Build grün (`npm run build` = `tsc -b && vite build`), Working Tree clean, keine offenen Feature-Branches, alle 5 Migrationen angewendet — keine offene Migration. **Nichts ist nach `origin` gepusht** — alles lokal.
2. **Nächster Schritt: Phase 9 (Deploy/Hosting).** ZUERST mit dem User die Push-Strategie zu `origin` klären (Branch/Remote), bevor irgendwas rausgeht. Dann: PWA-Manifest steht in `vite.config.ts`; DB-Verifikation (Logbook-Migrationen gegen Live-DB abgleichen + als Nakama-Migrationen tracken).
3. Deferred Health-Findings: A5 (Item-Page 4-5 Round-Trips), C8 (Telemetry statt `console.error` — wartet auf Hosting), D1-D3 (kosmetisch). Nicht-akut/quellenabhängig: Status-Control Filme/Spiele, Episodentitel-Lag, Manga-Kapiteltitel, Long-Anime-Cap.
4. Bei kleinen User-Wünschen: gleich abarbeiten. Atomar committen.

@AGENTS.md
@handshake.md
@HEALTH.md
