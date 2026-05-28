# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), what's done across Phases 0–3, the design tokens + primitives, and the workflow conventions with the user.

**Design tokens** live in `src/index.css` (CSS vars + Tailwind v4 `@theme inline`). Names mirror the handshake (`--bg`, `--accent`, `--text-mini`, etc.). Storage keys are prefixed `nakama:*` (NOT `logbook:*`).

**Workflow notes** (from handshake §Workflow-Notizen):
- User is a designer without coding background but with strong design instincts.
- Iterate in real code (hot reload), not static mockups.
- Before adding to schema or creating new screens: ask first.
- Prefer showing in dev server over explaining.
- Git: lowercase conventional commits (`feat(area): …`, `fix(ui): …`).
- Dev: `npm run dev` on port 5173.

**Open issues at session handoff** (from handshake §Offene Punkte):
1. BottomNav liquid animation not running reliably — needs in-browser DevTools debugging
2. Aside-slot text-baseline consistency — needs visual verification after latest fix

@AGENTS.md
@handshake.md
