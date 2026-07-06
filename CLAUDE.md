# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user.

**Stand (Kurzfassung):** App ist **live auf usenakama.app** (v0.18.0, Git-Auto-Deploy aus `main`). Phasen 1-9 + alle Medien-Themen (1a Serien · 1b Filme · 1c Spiele/Steam) + Sync-Instanzen + Cover-Epos + Push Phase 1+2 + App-Redesign (v0.16, sharp corners/Glas/Cover-Backdrops) + Mobile-Rework (v0.18, Touch-Steuerung + Top-Suche) sind live; 36 Migrationen gefahren; Security-Audit durch. `FEEDBACK-BACKLOG.md` komplett deployed; **aktiver Plan ist `REVIEW-2026-07.md`** (P0+P1 ✓, als Nächstes P2 Docs-Pass, dann P3 Produkt-Roadmap). **Der vollständige Stand + die nächsten Schritte leben an genau einer Stelle: `handshake.md` §Stand · §Status · §Offene Punkte** (+ `REVIEW-2026-07.md`). Hier NICHT duplizieren — sonst driftet's auseinander.

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
