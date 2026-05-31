# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user.

**Stand (Kurzfassung):** Phasen 1-8 + Sync-Instanzen + Politur-Session **+ Thema 1a (TMDB-Serien) + 1b (TMDB-Filme)** sind alle in lokalem `main`. Arbeit geht direkt auf `main` (User-delegiert, atomare Commits). `origin` ist bewusst nicht aktuell („mergen ok, nur nicht pushen"). Als Nächstes (frische Session): **Detailseiten-Politur** (Release-Datum zusätzlich in „Details" · mobil Cover/Details-Section vor Episoden + Bento-Nummern tauschen — Spec in `handshake.md` §Offene Punkte „Nächste Session"), dann 1c Spiele/Steam, bzw. Themen 2-4 (Paging · First-Login-Setup · Onboarding-Tooltips). **Der vollständige Stand + die nächsten Schritte leben an genau einer Stelle: `handshake.md` §Stand, §Status, §Offene Punkte.** Hier NICHT duplizieren — sonst driftet's auseinander.

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
