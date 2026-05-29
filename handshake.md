# Nakama — Handshake

Master-Kontext. Lies das zuerst. Stand: Phase 4 mittendrin — AddSheet inkl. AniList-Suche fertig, Items-Rendering in /lists/:id + Item-Detail + Episode-Layer noch offen.

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

Programmatic in `src/routes/index.tsx`. `lazy()` pro Route.

**Wichtig — Layout-Persistenz:** Die vier protected App-Routes (`/`, `/lists`, `/lists/:id`, `/profile`) hängen als **Children eines einzigen `AppLayout`-Parent-Routes**, der `ProtectedRoute + AppShell` einmalig aufspannt. Solid Router hält die Parent-Component über Routenwechsel mounted — nur `props.children` tauscht. Dadurch persistieren BottomNav + AddSheet, BottomNav-Animation und der `+`-Klick-State überleben den Wechsel zwischen Surfaces. Ohne diese Nesting würde der ganze Shell pro Page-Mount neu aufgebaut (siehe alter Bug: NavBar-Flackern + Animation lief nicht).

Public Routes (`/login`, `/auth/callback`, `/styleguide`) sind separate Top-Level-Einträge ohne Layout-Wrapper.

| Route | Guard | Status |
|---|---|---|
| `/login` | public | done |
| `/auth/callback` | public | done |
| `/styleguide` | public | done (14 Sektionen) |
| `/` | protected (AppLayout) | Stub (Phase 5 Pending) |
| `/lists` | protected (AppLayout) | done |
| `/lists/:id` | protected (AppLayout) | items-Rows noch offen (Phase 4) |
| `/profile` | protected (AppLayout) | done |
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
- `AppShell` — Layout-Wrapper für authed Routes, mountet **einmal** als Parent-Route (siehe Routing). Hält den AddSheet-State als **Two-Signal Split**: `addMounted` (DOM-Lifetime) und `addVisible` (Animation-State). Beim Open: setAddMounted+rAF×2+setAddVisible. Beim Close: setAddVisible(false), setTimeout(setAddMounted(false), 500ms). Das doppelte rAF beim Open ist nötig damit Solid's Render-Loop den initial-state paintet bevor die Transition triggert — sonst „taucht das Sheet einfach auf"
- `BottomNav` — Floating Pill mit 5 Tabs (Home / Listen / + / Kalender / Profil). `+` sitzt **CENTER** (das ist die Add-Affordance) und trägt `data-add-anchor` auf der inneren Pille — das ist der Morph-Origin für die AddSheet. Liquid Accent-Bubble via `data-accent`-Targeting + measure-and-stretch-then-contract Animation. **Animation läuft jetzt zuverlässig**, war durch den Routing-Refactor (Parent-Route AppLayout) gefixt
- `NavButton` — Nav-Item im Pill, setzt `data-accent=""` wenn aktiv (Bubble-Target)
- `AddSheet` — Search + Add-to-list, **liquid morph aus der BottomNav**. Zwei-Teile-Layout: Card oben (page-tier `bg`, hard corners, kicker + Listen-Selektor + Close-X + scrollable Results) + Search-Pill unten (nav-tier `bg-nav-bg`, capsule). Pill morpht aus dem `[data-add-anchor]`-Rect der NavBar heraus zur Target-Rect (full-width minus padding, mobile keyboard-aware via visualViewport). NavBar selbst fadet **sequential-handoff-style** weg/zurück, nicht crossfade (siehe Memory `sequential-handoff-animation` und Gotchas). 500ms ease-quart in beiden Richtungen, ohne scale/translate auf der Card (pure opacity-fade — die Pill trägt die räumliche Bewegung). Pre-selected Liste wenn aus `/lists/:id` geöffnet. Search-as-you-type mit 220ms debounce + AbortController. Tap auf Result-Row triggert `addItemToList` mit ✓-Markierung in der Session
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

`src/lib/queries/items.ts` (Phase 4):

```typescript
// Items + Episodes-Layer. Stand: Search + addItemToList fertig.
// Episode-Queries + lazy fetch folgen.

export async function addItemToList(input: { listId: string; source: AniListResult }): Promise<void>
// Upsert items(source,source_id) → insert list_items. 23505 (unique_violation
// auf list_items) wird als success behandelt (already in list).
```

`src/lib/anilist.ts` (Phase 4):

```typescript
// AniList GraphQL client — läuft DIREKT im Browser. CORS open, kein API-Key,
// 90 req/min Rate-Limit. Kein Proxy nötig im Gegensatz zu Logbook (das hatte
// einen Next-API-Route weil server-side).
export interface AniListResult { sourceId; type; title; year; coverUrl; format }
export async function searchAniList(q: string, signal?: AbortSignal): Promise<AniListResult[]>

// Noch nicht geschrieben — kommt mit Item-Detail-Phase:
// export async function fetchAniListEpisodes(sourceId, type): Promise<AniListEpisode[]>
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
| **4 · Items + Tracking** | **teilweise** — siehe unten |
| **5 · Home Dashboard** | offen — Was kommt, Fortsetzen, Logbuch (jetzt mit punktuellen Updates, kein Polling-Fallback) |
| **6 · Kalender** | offen — Wochen-/Monatsansicht, Tag-Pane, Quick-Tick |
| **7 · Sharing** | offen — Invite-by-@handle, Members-Modul, Sync-Toggle mit Backfill, Mitseher-Indikator, Ownership-Transfer |
| **8 · Polish** | offen — Motion-Choreografie, Empty-States, Animations-Pass |
| **9 · PWA-Manifest fertigstellen + Hosting** | teilweise — Manifest steht in `vite.config.ts`, Deploy auf Vercel/Cloudflare Pages noch nicht |

### Phase 4 — Detail-Status

| Sub | Status |
|---|---|
| AniList GraphQL Client | ✓ done — `src/lib/anilist.ts`, läuft direkt im Browser |
| `addItemToList` Mutation | ✓ done — `src/lib/queries/items.ts`, idempotent via 23505-handling |
| AddSheet UI + Animation | ✓ done — `src/components/AddSheet.tsx`, Liquid Nav-Pill-Morph |
| `+` in BottomNav verdrahtet | ✓ done — `data-add-anchor` auf der inneren Pille |
| Items als Rows in `/lists/:id` | ❌ offen — aktuell nur Phase-4-Placeholder text |
| Item-Detail-Seite `/item/:id` | ❌ offen — Route existiert noch nicht |
| Episode-Layer (`episodes` table) | ❌ offen — DB-Schema da (geerbt aus Logbook), keine Queries |
| Lazy `fetchAniListEpisodes` | ❌ offen — Logbook hat das, muss portiert werden |
| EpisodeList UI (Desktop-Kacheln + Mobile-Rows) | ❌ offen |
| Cascade / Single / „Bis hier" Tick-Pattern | ❌ offen — RPCs sind da (`mark_episodes_watched`) |
| Status-Control für Movies/Games (`item_history`) | ❌ offen |

---

## Offene Punkte (Stand: Phase 4 mittendrin)

### Konkret offen für die nächste Session

1. **Items als Rows in `/lists/:id` rendern.** Aktuell steht da nur ein Placeholder-Text „Einträge folgen in Phase 4 — Item-Suche + AddSheet." obwohl die Items über AddSheet schon hinzugefügt werden können (man sieht den `itemCount` in der Details-Spalte via Realtime hochzählen). Die `listItemsQueryOptions(id)` Query und der `ListEntry`-Type sind schon in `lists.ts` definiert — nur das UI fehlt. Pattern wie die Listen-Rows auf `/lists`: BentoModule mit `-mx-5 <ul>`, hover step UP nach surface, hairline `::after`-divider, klickbar auf später `/item/:id`.

2. **Item-Detail-Seite `/item/:id`.** Route in `routes/index.tsx` als Child von `AppLayout` registrieren. PageHeader mit kicker `LISTEN > <listname>` (oder aus dem context), title = item-title, optional backHref. Layout-Anlehnung an Logbook's `/item/[id]/page.tsx` (steht im Logbook-Repo).

3. **Episode-Layer.** Im Logbook-handshake stehen `episodes`, `episode_watches`, `item_history` Tabellen. Die existieren in der shared Supabase-DB schon, nur die Queries und das UI fehlen in Nakama. Anfangen mit:
   - `src/lib/queries/episodes.ts` mit `episodesQueryOptions(itemId)` + `markEpisodesWatched` (ruft die RPC).
   - `src/lib/anilist.ts` erweitern um `fetchAniListEpisodes(sourceId, type)` — aus Logbook portieren, inkl. MangaDex-Fallback für ongoing Mangas (siehe Logbook `src/lib/anilist.ts` Zeile 162+).
   - Lazy fetch: bei erster Item-Detail-Öffnung Episodes von AniList holen, in `episodes` table upserten, dann readen.

4. **EpisodeList UI.** Desktop: Kachel-Grid mit `aspect-square` Tiles, Episode-Number drin, ticked = accent-bg. Mobile: vertikale Rows mit Datum + Tick-Button rechts. Logbook-Vorlage: `src/components/item/*`.

5. **Cascade / Single / „Bis hier"-Pattern.** RPCs `mark_episodes_watched` und `toggle_episode_synced` sind da. UI: ein Click auf Episode-Tile = single tick. Long-press oder Modifier = „bis hier alle ticken" (cascade). Sync-Toggle für shared lists wenn Phase 7 ranraucht.

6. **Status-Control für Movies/Games** (`item_history` table, status enum). Eigene Komponente, sitzt im Item-Detail rechts wo bei Anime/Manga der Episode-Counter wäre.

### Bekannte tech-debt / kleine Sachen, NICHT dringend

- **Such-Pill innere Content-Fade beim Schließen** geht aktuell mit 300ms over ease-out, das fadet die search-input + icon weg während der Pill noch morpht. Bei sehr schnellen User-Aktionen könnte das sichtbar werden (Inhalt verschwindet während Pill noch breit ist). Nicht akut — wenn's auffällt, content-fade timing aufbohren oder synchronisieren mit dem Morph.
- **`origin()` wird beim Mount EINMAL gemessen** und während der ganzen Sheet-Session nicht updated. Wenn die NavBar während AddSheet offen reflows (z.B. window resize), könnte der Close-Morph zur falschen Position laufen. visualViewport listener ist da, aber der updated nur viewport + keyboardOffset, nicht origin. Nicht akut auf Mobile (Resize selten), wäre für Desktop nice-to-have.

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

### Solid / Router / Reactivity

- **Solid ≠ React.** JSX sieht ähnlich aus, aber: `class` statt `className`, refs via direkte Variablen-Zuweisung (`ref={myEl!}`), keine Re-Renders sondern fine-grained Reactivity, `createEffect` statt `useEffect`, `createSignal` statt `useState`.
- **JSX-Attribute spread funktioniert anders als in React.** `{...(cond ? {attr: ""} : {})}` produzierte inkonsistenten Output bei data-Attributen. Stattdessen direkt: `data-attr={cond ? "" : undefined}`.
- **Solid Router params** sind `Partial<Record<string, string>>`. Bei Routes mit `:id` segment ist value zur Laufzeit garantiert, aber TypeScript braucht non-null-assertion oder explizites Typing: `useParams<{ id: string }>()`.
- **Layout-Persistenz braucht Parent-Routes.** Wenn ein Layout-Wrapper über Routenwechsel hinweg mounted bleiben soll (= Animationen + State überleben), MUSS er als Parent-Route in `routes/index.tsx` deklariert sein mit den Pages als `children`-Array. Per-Page-Import des Wrappers führt zu Re-Mount pro Navigation (war der „BottomNav-Animation-läuft-nicht" Bug der ersten Session).
- **`on()` vs plain `createEffect`:** `on(deps, fn)` DEFERRED den ersten Run per default. Plain `createEffect` fires on initial setup AND on dep changes. Für „läuft beim Mount UND bei jeder Änderung" → plain createEffect.
- **Show-Wrapper + Transitions:** Wenn `<Show>` ein animiertes Element umhüllt, kann beim Wechsel von falsy → truthy → falsy das Element unmount → remount, was Transitions zerschießt. Lösung: Always-render mit opacity gating. Ausnahme: wenn das Element von einem **gemessenen Wert** abhängt (z.B. AddSheet's pill style von `origin()`), dann `<Show when={origin()}>` damit das erste Render schon mit korrekten Werten kommt — sonst interpoliert `transition-all` von default-zeros zu den richtigen Werten und das Element gleitet aus der Ecke rein.

### Animation-Patterns (Stand Phase 4)

- **Doppel-rAF für CSS-Transitions in Solid.** Ein einzelnes `requestAnimationFrame` reicht oft nicht — Solid's Render-Loop kann Mount + State-Flip in derselben Paint-Frame zusammenfassen, der Browser sieht nie den Initial-State, und die Transition läuft nicht (Element „taucht einfach auf"). Pattern: `rAF(() => rAF(() => setVisible(true)))` — zweites rAF garantiert dass der Browser den initial-state mindestens einmal paintet bevor die Transition triggert.
- **Two-Signal-Pattern für animierte Mount/Unmount.** Ein State (`addMounted`) für DOM-Lifetime, ein zweiter (`addVisible`) für die Animation. Visible flippt sofort beim User-Klick, mounted erst nach `ANIM_MS` (für Open: erst mount, dann visible mit rAF×2; für Close: erst visible=false, dann setTimeout für mount=false). Dadurch laufen Exit-Animationen parallel zu allen anderen Animationen ohne sequentielle Latenz.
- **Sequential handoff statt crossfade.** Zwei gleichfarbige gestapelte Layer (z.B. NavBar-Pill + Search-Pill an gleicher Position) NIE per Crossfade swappen — combined alpha dipt mathematisch auf 0.75, was als Flicker sichtbar wird. Stattdessen: appearing layer rises ZUERST (während disappearing layer noch opacity-1 und occluding), dann disappearing layer fällt mit dem appearing schon dahinter. Konkret: 50ms windows mit non-overlapping delays. Siehe Memory `sequential-handoff-animation` für Details + Reference-Implementierung in AddSheet.
- **Liquid motion language.** Nakama's Animations-Charakter ist „liquid" — stretchy, organic, mercury-like. Default-Easing: `var(--ease-quart)` (`cubic-bezier(0.16, 1, 0.3, 1)`). Default-Duration für sichtbare Chrome-Bewegungen: 500ms (Search-Pill-Morph), 300ms für content-fades. Hard cuts/snaps sind OK für Content (Werte/Text), liquid bleibt für Interface-Chrome (Indicators, Sheets, Drags). Siehe Memory `motion-language-liquid`.
- **Hard corners auch für Icon-Buttons.** `rounded-xs` ist der Default für icon-buttons (BackButton, X-Close, Add-Buttons). `rounded-full` nur für die BottomNav-Pille selbst (weil sie BUCHSTÄBLICH eine Capsule ist) und für den Akzent-Hanko-Dot. Siehe Memory `icon-buttons-hard-corners`.
- **Tailwind v4 + ease-quart:** `--ease-quart` in `@theme inline` SOLLTE die Utility `ease-quart` generieren. In Praxis benutzen wir aktuell die arbitrary-syntax `[transition-timing-function:var(--ease-quart)]` — wirkt zuverlässiger.
- **Per-property transition-timing braucht inline style.** Tailwind's `transition-{prop} duration-X delay-Y` setzt ein einziges timing für alle gelisteten properties. Für unterschiedliche Timings pro Property (z.B. morph 500ms + opacity 50ms): inline `style={{ transition: 'left 500ms ..., opacity 50ms ...' }}` mit comma-separierten Rules.

### Daten / RLS

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
