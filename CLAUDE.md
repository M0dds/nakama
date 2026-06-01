# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user.

**Stand (Kurzfassung):** Phasen 1-8 + Sync-Instanzen + Politur-Session **+ alle Medien-Themen 1a (Serien) · 1b (Filme) · 1c (Spiele/Steam)** sind in lokalem `main`. Außerdem: Detailseiten-Politur, Confirms global als `ConfirmDialog`, Layout-Content-Frame (1728px Cap + Framing-Hairlines). Arbeit über kurzlebige Feature-Branches → `main` gemerged (User wollte „better safe than sorry"; atomare Commits). `origin` ist bewusst nicht aktuell („mergen ok, nur nicht pushen"). **Zuletzt (2026-06-01):** Health-Audit + 10 Fixes (HEALTH Bundle 8) · **Thema 2 · Paging** (`Pager` + `createLiquidBubble`) · **Login-Redesign** (Discord-primär, Magic-Link = Recovery via Same-Email-Linking) · **`UserChip`** (Anti-Spoofing-Hover-Karte) · **Thema 3 · First-Login-Setup** (`/setup`-Wizard, `onboarded_at`-Gate, Migr. `20260601100000`) · **Privacy-Fix + Voll-Audit** (echtes RLS-Leck in globalen `episode_watches` geschlossen, Migr. `20260601110000`; alle Lese-Pfade danach auditiert → sauber; 3 Pre-Launch-Härtungspunkte in HEALTH `PRELAUNCH-1..3`) · **Empty-Canvas-Onboarding** (Auto-„Watchlist" beim Signup raus → leerer Start, Migr. `20260601120000`; Home-Empty-States kontextabhängig + Listen-Tab-Link — **Thema 4/Onboarding-Tooltips damit verworfen**) · **Pre-Launch-RLS-Härtung** (offener Launch entschieden: `items`/`episodes`-Writes über DEFINER-RPCs + direkte Writes entzogen; Listen umbenennen/Mitglieder entfernen owner-only; `item_history`-Co-Read verschärft (AUD-10); Migr. `20260601130000` — HEALTH Bundle 9). **Zuletzt (2026-06-02) — Feature-Backlog-Session:** **Tracken/Archiv-Bug** (Mitglied konnte nicht archivieren — owner-only RLS auf direktem `list_members`-UPDATE; Fix via DEFINER-RPC `set_list_tracking`, Migr. `20260601140000` + `trackedItemIds` auf eigenen `user_id` gescopt — latenter Leak: Co-Member-`tracks_home` zog Items in fremde Homes) · **Visual Quick-Wins** (Sakura Light heller, Dark-Mode-Dialoge auf `dark:bg-surface` gehoben; #10 Grain-Textur **vertagt** — zu retina-fein) · **Cover-Epos** (#2/#1/#3): Listen bekommen Cover — generiertes japanisch-geometrisches Muster aus Seed (`GeneratedCover`, kein Storage) oder owner-upgeloadetes Bild (`list-covers`-Bucket, quadratischer Crop), Migr. `20260601150000`+`20260601160000`; Pin-Status als Cover-Badge; Item-Cover in Listen hochkant. **22 Migrationen** (alle bis `20260601160000` gefahren, User-bestätigt; `20260601120000` auch durch). Als Nächstes: **Feature-Backlog-Rest** (#4 Reset-Dialog-Bug, #5 Logbuch Staffel+Spiele/Filme, #6 „Was kommt" mobil, #7 Account-Handle-Confirm, #10 Grain, #11 E-Mail, #12 Error-Seite, #13 Push, #15 Security) + Launch-Runway (Phase 9) — siehe `handshake.md` §Offene Punkte. **Der vollständige Stand + die nächsten Schritte leben an genau einer Stelle: `handshake.md` §Stand, §Status, §Offene Punkte.** Hier NICHT duplizieren — sonst driftet's auseinander.

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`). User asks for atomic commits and to pflege git throughout a session.
- Dev: `npm run dev` on port 5173 (kann auf 5174 ausweichen wenn 5173 belegt).

**Next concrete steps + offene Punkte:** siehe `handshake.md` §Offene Punkte (jetzt / geplant / tech-debt) und `HEALTH.md` (deferred Findings). Nicht hier spiegeln.

@AGENTS.md
@handshake.md
@HEALTH.md
