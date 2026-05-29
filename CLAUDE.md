# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user. **Stand:** Phase 4 abgeschlossen + Polish-Pass durch. Natural-key Routes (`/lists/<short_code>`, `/item/<type>/<slug>`) sind live, NotFound-Surface ersetzt den silent bounce. Status-Control für Movies/Games deprio'd (wartet auf TMDB/IGDB-Sources). Kleine Feature-Ergänzungen kommen vor Phase 5 (Home Dashboard).

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`). User asks for atomic commits and to pflege git throughout a session.
- Dev: `npm run dev` on port 5173 (kann auf 5174 ausweichen wenn 5173 belegt).

**Next concrete steps** (see handshake §Offene Punkte for full detail):
1. Kleine Feature-Ergänzungen — kommen direkt aus der laufenden Session, sprich den User an.
2. Phase 5: Home Dashboard — Was-kommt / Fortsetzen / Logbuch. Logbook hat die Module als Vorlage.

@AGENTS.md
@handshake.md

@AGENTS.md
@handshake.md
