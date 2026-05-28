# Nakama — Handshake

Master-Kontext. Lies das zuerst. Stand: Ende Phase 3 + erste Design-Pass-Korrekturen.

---

## TL;DR

**Nakama** ist der Re-Build von **Logbook** (siehe `/Users/johannmertens/Work/Projects/Logbook`) als reine **Solid SPA**. Selbe App: Media-Tracker für Anime / Manga / Serien / Filme / Spiele für Paare und kleine Freundeskreise. Pro-Episode-Tracking mit optionalem Sync zwischen Mitgliedern einer geteilten Liste. Positionierung: **Future-Fokus-Tool**, kein Tracking-Tagebuch.

**Warum Re-Build:** Logbook lief auf Next.js + RSC. Realtime-Updates triggerten dort `router.refresh()` → ganze Seite re-rendered bei jedem Tick. Bei einer geteilten Liste mit 7 Membern war das Re-Render-Sturm. Solid + TanStack Query macht das granular: nur das eine Häkchen ändert sich, der Rest bleibt stehen. Der „Jira-Feel".

**Backend ist identisch.** Selbes Supabase-Projekt, selbe DB, selbe RLS, selbe RPCs. Die Logbook-Datenbank wird wiederverwendet — User kann sich in beiden Apps mit demselben Account einloggen.

---

## Stack

- **Solid 1.9** (vermutlich inzwischen höher) + **Vite 8** (mit `vite-plugin-solid`)
- **TypeScript 6**, JSX preserve mit `jsxImportSource: "solid-js"`
- **Tailwind v4** via `@tailwindcss/vite` Plugin
- **@solidjs/router** für Routing (programmatic, keine file-based)
- **@tanstack/solid-query** für Server-State + Cache (TanStack Query Solid-Adapter)
- **@supabase/supabase-js** für DB/Auth/Realtime (selbes Projekt wie Logbook)
- **vite-plugin-pwa** für PWA-Layer (Manifest + Service Worker)
- **lucide-solid** für Icons
- **Geist + Geist Mono** via Google Fonts CDN

---

## Architektur — der entscheidende Unterschied zu Logbook

```
Logbook (RSC):                        Nakama (SPA):
─────────────────────────             ─────────────────────────
Server Component                       Client Component
  ↓ await DB                              ↓ createQuery → cache
  ↓ render HTML                           ↓ render JSX
  ↓ stream RSC                            ↓ TanStack Query holds data
                                         
Realtime change:                      Realtime change:
  → router.refresh()                    → queryClient.invalidateQueries(key)
  → full RSC re-render                  → only consumers of that key re-render
  → ALL data refetched                  → only that ONE query refetches
```

**Konkret:** `src/lib/queries/<topic>.ts` definiert typed `queryOptions` + Mutation-Funktionen. Komponenten benutzen `createQuery(() => queryOptions(...))` zum Lesen und `createMutation(() => ({...}))` zum Schreiben. Mutations machen Optimistic-Updates via `queryClient.setQueryData(key, patcher)` und invalidieren am Ende. Realtime-Events laufen durch den generischen `useRealtimeInvalidation`-Hook der nur Query-Keys invalidiert.

---

## Auth

- **Supabase JS Client** in `src/lib/supabase.ts` mit `persistSession + autoRefreshToken + detectSessionInUrl`
- **AuthProvider** in `src/lib/auth.tsx` — Solid-Context, hydrated by `getSession()` on mount, kept live via `onAuthStateChange()`. Exposes `session()`, `user()`, `loading()`.
- **ProtectedRoute** in `src/components/ProtectedRoute.tsx` — wraps children, wartet auf `loading()`, dann entweder Children oder `<Navigate href="/login" />`.
- **Login** in `src/routes/Login.tsx` — Discord OAuth (Button → `signInWithOAuth`) + Magic-Link (Form → `signInWithOtp`). Beide schicken nach `/auth/callback`.
- **AuthCallback** in `src/routes/AuthCallback.tsx` — Supabase JS exchanged den Code automatisch, dieses Route wartet nur darauf dass `user()` non-null wird und navigiert dann zu `/` (oder `?next=...`).

---

## Routing

Programmatic in `src/routes/index.tsx`. `lazy()` pro Route. Public Routes ohne Guard, App-Routes mit `protect()`-Wrapper:

| Route | Guard | Status |
|---|---|---|
| `/login` | public | done |
| `/auth/callback` | public | done |
| `/styleguide` | public | done (14 Sektionen) |
| `/` | protected | Stub (Phase 5 Pending) |
| `/lists` | protected | done |
| `/lists/:id` | protected | done |
| `/profile` | protected | done |
| `/calendar` | — | NICHT existiert, Phase 6 |
| `/item/:id` | — | NICHT existiert, Phase 4 |
| `*` | public | NotFound |

---

## Design-System

**Komplett aus Logbook gepfropft.** `src/index.css` enthält:

- **8 Themes × 2 Modes:** `default` (Standard japanisch-minimalistisch, Vermillion-Akzent), `teenaged` (Teenage Engineering), `sakura`, `budapest`, `totoro`, `medieval`, `biotech`, `maritime`.
- **Tokens:** `--bg`, `--surface`, `--text`, `--text-muted`, `--border` (ultra-light hairline), `--rule` (heavier line tier), `--accent`, `--accent-on`, `--accent-secondary`, `--nav-bg/fg` (inverted).
- **Elevation:** `--shadow-resting/raised/floating` — mode-based (light vs dark), nicht theme-based.
- **Motion:** `--ease-quart` cubic-bezier(0.16, 1, 0.3, 1), `--dur-fast/base/slow` (200/300/320 ms).
- **Type:** `--text-mini` (12px Mono Caps), `--text-label` (13px Mono), `--text-body` (15px), `--text-body-lg` (16px), `--text-heading` (22px), `--text-heading-lg` (24px). Zwei Weights: 400/500.
- **Grain-Layer** als fractal-noise SVG-data-URI — applied as `.grain-layer` in `App.tsx`.

**Theme-Switch:** `<html data-theme="..." class="dark?">`. `applyTheme(id, modePref)` in `src/lib/themes.ts` schreibt Attribut + Klasse + localStorage. No-FOUC-Script in `index.html` läuft vor React-Mount.

**Storage-Keys:** `nakama:theme`, `nakama:mode` (NICHT `logbook:*`).

---

## Komponenten-Inventar

**Primitives** (`src/components/`):
- `Button` — primary / secondary / ghost Varianten, hard corners
- `Badge` — default (bordered mono mini-code) / accent / muted
- `BentoModule` — Section-Wrapper mit `label` + `number` (tabular-nums)
- `PageHeader` — full-bleed Instrument-Kopf, immer mit Hanko-Akzentpunkt im Kicker, optional `backHref` (chevron-back über History) + `aside`-Slot. **Aside-Slot ist h-6 items-center** — Aside-Content sitzt damit immer in derselben 24-px-Band-Höhe egal was reingesteckt wird
- `Tooltip` — dependency-free, JS-positioniert mit Viewport-Clamping (escapes overflow-hidden via position: fixed)
- `SelectMenu` — styled Single-Select, click-outside + Escape close
- `ColumnGuide` — vertikale Trennlinie bei 2/3-Position des Viewports, `position: fixed inset-y-0` (volle Höhe egal wie hoch der Content), nur ab md sichtbar
- `ThemeSwitcher` — Modus-Toggle (oben) + Theme-Grid (unten); benutzt im Profil und im Styleguide
- `AppShell` — Layout-Wrapper für authed Routes, mountet BottomNav + pb-[94px]
- `BottomNav` — Floating Pill mit 5 Tabs (Home / Listen / Kalender / + / Profil). Liquid Accent-Bubble via `data-accent`-Targeting + measure-and-stretch-then-contract Animation. **Hat momentan einen Bug: Animation läuft nicht zuverlässig, siehe „Offene Punkte" unten.**
- `NavButton` — Nav-Item im Pill, setzt `data-accent=""` wenn aktiv (Bubble-Target)
- `ProtectedRoute` — Route-Guard
- `CreateListForm` — TanStack-Mutation, Optimistic via `setQueryData`
- `DeleteListButton` — Inline-Confirm „Wirklich löschen? · ✓ / ✗" im Aside-Slot. Beide States rendern direkt im h-6-Slot des PageHeaders, items-center, damit der Text in beiden Zuständen auf derselben Höhe sitzt
- `EditableListName` — Inline-Rename im Heading, hover lifts Pencil + accent text. Edit-State benutzt `ring-1 ring-accent` (box-shadow, kein layout-impact)
- `ListTrackingToggle` — per-User Tracken/Archiv-Segment

---

## Data-Layer (TanStack Query)

`src/lib/queries/lists.ts`:

```typescript
// Query keys (exportiert für Mutations + Realtime)
export const listsQueryKey = ["lists"] as const;
export const listQueryKey = (id) => ["list", id] as const;
export const listItemsQueryKey = (id) => ["list", id, "items"] as const;

// Query options — Komponenten benutzen via createQuery
export function listsQueryOptions(user) { ... }
export function listQueryOptions(user, id) { ... }
export function listItemsQueryOptions(id) { ... }

// Mutations — Komponenten benutzen via createMutation
export async function createList(user, input)
export async function renameList(input)
export async function deleteList(id)
export async function setListTracking(user, input)
```

**Pattern für jede neue Feature-Area:**

1. Neue Datei `src/lib/queries/<area>.ts` mit gleicher Struktur (keys + options + mutations)
2. RPC oder direkter Table-Access (RLS macht das Filtering, keinen `user_id`-Filter im Query)
3. `.select()` nach Mutations zum Detect von silent-RLS-blocks (Logbook-Lektion: ohne `.select()` lügen optimistic writes wenn RLS still blockiert hat)
4. Optimistic-Update-Pattern: `onMutate` snapshot+patch, `onError` rollback, `onSuccess` confirm

---

## Realtime

`src/lib/realtime.ts` exportiert `useRealtimeInvalidation(channelKey, [{table, invalidates}])`. Im Component-Mount wird ein Supabase-Channel aufgemacht, jeder postgres_changes-Event invalidiert die deklarierten Query-Keys. RLS scoped Events server-side, kein Client-Filter nötig.

**Verwendet in:**
- `/lists` overview → channel `lists-overview`, listens to lists/list_members/list_items, invalidates `listsQueryKey`
- `/lists/:id` detail → channel `list-{id}`, listens to lists/list_members/list_items, invalidates `listQueryKey(id) + listsQueryKey + listItemsQueryKey(id)`

**Anti-Pattern aus Logbook das wir hier NICHT machen:** Auf SUBSCRIBED ein Refresh feuern. In Logbook (Next 16) führte das zu einem Re-Render pro Page-Mount und hat den Router-Cache zerschossen. In Nakama brauchen wir das nicht weil TanStack Query staleTime handhabt + Mutations + Postgres-Events alle Wege abdecken.

---

## Datenmodell (im Supabase-Projekt — identisch zu Logbook)

Komplettes Schema steht im **Logbook-Repo unter `handshake.md`**. Wichtigste Tabellen:

- `profiles` — user_id, username, display_name, avatar_url
- `lists` — id, owner_id, name, description, is_shared, created_at
- `list_members` — list_id, user_id, role, tracks_home (per-User), joined_at
- `list_invitations` — invitee_user_id, status (pending/accepted/declined)
- `items` — source, source_id (z.B. `anilist:154587`), type, title, cover_url, metadata
- `list_items` — list_id, item_id, sync_enabled, added_by_user_id
- `episodes` — item_id, season_number, episode_number, title, air_date
- `episode_watches` — user_id, episode_id, watched_at
- `item_history` — user_id, item_id, status (für Movies/Games)
- `list_ownership_transfers` — Mini-Log für Owner-Wechsel

**RPCs** (alle SECURITY DEFINER): `mark_episodes_watched` (Cascade + Sync-Fan-out), `toggle_episode_synced` (symmetrisch), `continue_watching`, `item_progress`, `reset_item_progress`, `backfill_sync_for_list_item`, `invite_to_list`, `get_my_invitations`, `get_list_invitations`, `accept_list_invitation`, `transfer_list_ownership`.

**Equal-Members-Modell:** `role` ist nur noch Marker für „Wer hat angelegt". In einer geteilten Liste hat jedes Mitglied gleiche Rechte; nur der Ersteller darf löschen.

---

## Status: Phasen-Plan

| Phase | Status |
|---|---|
| **0 · Setup** | ✓ done — Vite/Solid scaffold, Deps, Tokens, Routes |
| **1 · Foundation + Styleguide** | ✓ done — Primitives, Auth-Context, 14-Sektionen-Styleguide |
| **2 · Auth & Shell** | ✓ done — Login (Discord OAuth + Magic-Link), AuthCallback, AppShell, BottomNav, Profile |
| **3 · Listen** | ✓ done — `/lists` overview, `/lists/:id` detail, Create, Rename, Delete, ListTrackingToggle, Realtime, Optimistic Updates |
| **4 · Items + Tracking** | offen — AniList-Suche, AddSheet, Item-Detail, EpisodeList (Desktop-Kacheln + Mobile-Rows), Cascade/Single/„Bis hier", lazy episode fetch, Status-Control |
| **5 · Home Dashboard** | offen — Was kommt, Fortsetzen, Logbuch (jetzt mit punktuellen Updates, kein Polling-Fallback) |
| **6 · Kalender** | offen — Wochen-/Monatsansicht, Tag-Pane, Quick-Tick |
| **7 · Sharing** | offen — Invite-by-@handle, Members-Modul, Sync-Toggle mit Backfill, Mitseher-Indikator, Ownership-Transfer |
| **8 · Polish** | offen — Motion-Choreografie, Empty-States, Animations-Pass |
| **9 · PWA-Manifest fertigstellen + Hosting** | teilweise — Manifest steht in `vite.config.ts`, Deploy auf Vercel/Cloudflare Pages noch nicht |

---

## Offene Punkte (am Ende des letzten Chats stehen geblieben)

### 1. ⚠️ BottomNav Liquid-Animation läuft nicht zuverlässig

**Beobachtung:** User sieht keine Animation beim Tab-Wechsel. Mehrere Iterationen versucht (spread → direct attribute für data-accent, queueMicrotask → requestAnimationFrame, `on()` Helper → plain createEffect, `<Show>` wrapper → always-render mit opacity). Aktueller Stand: `src/components/BottomNav.tsx` mit always-rendered Bubble, plain createEffect, requestAnimationFrame. Dev-Server wurde nach jeder Änderung neu gestartet.

**Was wurde NICHT geprüft (für nächste Session):**
- Ob `data-accent` Attribut tatsächlich im DOM landet (Chrome DevTools inspizieren beim live-Server)
- Ob `pillEl.querySelector("[data-accent]")` non-null returned
- Ob `setBubble()` mit echten Pixel-Werten aufgerufen wird (console.log)
- Ob die `<span>` mit den style-Werten tatsächlich gerendert wird
- Ob `transition-all duration-200 ease-out` Tailwind v4 Utility ist (mglw. `transition-[left,top,width,height]` explicit zu nutzen)

**Hypothese die ich noch nicht getestet habe:** Solid's `style={{...}}` Bindings könnten bei `bubble()?.left` (Optional Chaining mit Fallback `?? 0`) keine reaktive Subscription korrekt aufbauen. Möglicher Fix: `style` als Funktion oder einzeln per Memo aufgliedern.

### 2. ⚠️ Aside-Slot-Höhe — Text-Position-Konsistenz

User hat zuletzt klargestellt: der TEXT (nicht die Buttons) muss in beiden DeleteListButton-States (Trigger vs Confirm) auf identischer Höhe sitzen. Mein letzter Fix war `PageHeader` aside-slot auf `h-6 items-center`, DeleteListButton ohne eigenen Wrapper. **Tatsächliche visuelle Verifikation steht aus** — User soll im Browser checken.

### 3. Aktuelles Verhalten nach Refresh ungewiss

Letzter Dev-Server-Restart kam am Ende des Chats. User-Feedback zum Stand der Animation und Aside-Baseline NACH dem Restart fehlt. **Bitte als ersten Schritt in neuer Session beim User nachfragen oder selber im Browser inspizieren.**

---

## Workflow-Notizen (User)

- **Designer ohne Coding-Background**, aber mit starken Design-Instinkten. **Zeigen schlägt erklären.** Iteriert im laufenden Dev-Server (Hot Reload), nicht in Mockups. Arbeitet in **JetBrains WebStorm**.
- Vor **Schema-Änderungen** fragen.
- Vor **neuen Screens** fragen: „Sheet oder eigene Seite?"
- Bei **Design-Richtungswechseln** kurz das Konzept skizzieren, dann bauen.
- Material/tactile + japanisch-minimalistisch + TE ist die Leitästhetik. Flache uniforme Card-Grids vermeiden.
- **Git pflegen!** User erwartet atomare Commits. Commit-Stil: lowercase Conventional (`feat(area): …`, `fix(ui): …`, `chore: …`).
- **Dev-Server:** `npm run dev` (port 5173). Bei Bedarf `npx kill-port 5173 && npm run dev`.
- **Code wird nicht selbst geschrieben** — User ist Designer, Claude codet. User bewertet live im Browser.

---

## Gotchas

- **Solid ≠ React.** JSX sieht ähnlich aus, aber: `class` statt `className`, refs via direkte Variablen-Zuweisung (`ref={myEl!}`), keine Re-Renders sondern fine-grained Reactivity, `createEffect` statt `useEffect`, `createSignal` statt `useState`.
- **JSX-Attribute spread funktioniert anders als in React.** `{...(cond ? {attr: ""} : {})}` produzierte inkonsistenten Output bei data-Attributen. Stattdessen direkt: `data-attr={cond ? "" : undefined}`.
- **Solid Router params** sind `Partial<Record<string, string>>`. Bei Routes mit `:id` segment ist value zur Laufzeit garantiert, aber TypeScript braucht non-null-assertion oder explizites Typing: `useParams<{ id: string }>()`.
- **`on()` vs plain `createEffect`:** `on(deps, fn)` DEFERRED den ersten Run per default. Plain `createEffect` fires on initial setup AND on dep changes. Für „läuft beim Mount UND bei jeder Änderung" → plain createEffect.
- **Show-Wrapper + Transitions:** Wenn `<Show>` ein animiertes Element umhüllt, kann beim Wechsel von falsy → truthy → falsy das Element unmount → remount, was Transitions zerschießt. Lösung: Always-render mit opacity gating.
- **Tailwind v4 + ease-quart:** `--ease-quart` in `@theme inline` SOLLTE die Utility `ease-quart` generieren. Falls die nicht zieht, Fallback auf Tailwinds standard `ease-out`.
- **PostgREST 1000-Row-Cap** (aus Logbook geerbt): bei langlaufenden Shows (One Piece) oder Massen-Episoden-Reads Window mit Range + RPC für aggregierte Counts.
- **Optimistic Writes ohne `.select()` lügen** wenn RLS still blockt (0 rows, kein Error). Pattern: nach `update` zurück selektieren, wenn 0 → `error: "blocked"` rollback.
- **Migrationen** fährt der User manuell im Supabase SQL-Editor. Bei neuer Migration im Chat ankündigen + den SQL liefern.

---

## Referenzen

- Logbook-Repo: `/Users/johannmertens/Work/Projects/Logbook` — komplettes Vorgänger-Projekt mit ausführlichem `handshake.md` (DB-Schema, RLS-Helper, RPCs, ältere UX-Entscheidungen, Logbuch-Konzept etc.)
- Nakama GitHub: https://github.com/M0dds/nakama (auch lokal als `origin`)
- Supabase Projekt: dasselbe wie Logbook, URL/Key in `.env.local` (kopiert von Logbook)
- Solid Router: https://docs.solidjs.com/solid-router
- TanStack Solid Query: https://tanstack.com/query/latest/docs/framework/solid/overview
- Tailwind v4: https://tailwindcss.com/docs/v4-beta (bzw. die im node_modules ausgelieferte Doku)
