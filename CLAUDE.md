# Nakama

**Master spec:** `handshake.md` — read it first on every session. It defines the full architecture (Solid SPA + TanStack Query + Supabase, with the Logbook backend reused), the design tokens + primitives, the animation patterns we've worked out, and the workflow conventions with the user.

**Stand (Kurzfassung):** Phasen 1-8 + Sync-Instanzen + Politur-Session **+ alle Medien-Themen 1a (Serien) · 1b (Filme) · 1c (Spiele/Steam)** sind in lokalem `main`. Außerdem: Detailseiten-Politur, Confirms global als `ConfirmDialog`, Layout-Content-Frame (1728px Cap + Framing-Hairlines). Arbeit über kurzlebige Feature-Branches → `main` gemerged (User wollte „better safe than sorry"; atomare Commits). `origin` ist bewusst nicht aktuell („mergen ok, nur nicht pushen"). **Zuletzt (2026-06-01):** Health-Audit + 10 Fixes (HEALTH Bundle 8) · **Thema 2 · Paging** (`Pager` + `createLiquidBubble`) · **Login-Redesign** (Discord-Hero + Magic-Link-Disclosure + `email`-Scope; Auth-Modell: Discord primär, Magic-Link = Recovery in denselben Account via Same-Email-Linking) · **`UserChip`** (Hover-Identitätskarte, Anti-Spoofing). Als Nächstes: **Themen 3-4** — First-Login-Setup (Handle wählbar, `onboarded_at`-Migration) · Onboarding-Tooltips (Spec in `handshake.md` §Offene Punkte). **Der vollständige Stand + die nächsten Schritte leben an genau einer Stelle: `handshake.md` §Stand, §Status, §Offene Punkte.** Hier NICHT duplizieren — sonst driftet's auseinander.

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
