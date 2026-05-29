# Nakama — Handshake

Master-Kontext. Lies das zuerst.

**Stand:** Phasen 1-5 abgeschlossen. Home Dashboard mit drei Modulen (Was kommt / Fortsetzen / Logbuch) live, „Neue Folge"-Badges auf allen Listen-Surfaces. Drag-Reorder + Pin-to-Top auf `/lists` und `/lists/:shortCode`. RowActions-Cluster (Pin · Reset · Move · Remove) als unified Hover-Affordance. Title-Enrichment via Jikan + MangaDex als Fallback für AniList-Lücken, versioned-backfill. **Phase 6 (Kalender) ist der nächste große Schritt — optional Phase 8 (Polish-Pass) zwischendurch.**

---

## TL;DR

**Nakama** ist der Re-Build von **Logbook** (`/Users/johannmertens/Work/Projects/Logbook`) als reine **Solid SPA**. Selbe App: Media-Tracker für Anime / Manga / Serien / Filme / Spiele für Paare und kleine Freundeskreise. Pro-Episode-Tracking, optionaler Sync zwischen Mitgliedern einer geteilten Liste. Positionierung: **Future-Fokus-Tool**, kein Tracking-Tagebuch.

**Warum Re-Build:** Logbook lief auf Next.js + RSC. Realtime-Updates triggerten `router.refresh()` → ganze Seite re-rendered pro Tick. Bei 7 Membern Re-Render-Sturm. Solid + TanStack Query macht das granular: nur das eine Häkchen ändert sich.

**Backend ist identisch.** Selbes Supabase-Projekt, selbe DB, selbe RLS, selbe RPCs. Selber Login funktioniert in Logbook und Nakama.

---

## Stack

- **Solid 1.9** + **Vite 8** (`vite-plugin-solid`)
- **TypeScript 6**, JSX preserve mit `jsxImportSource: "solid-js"`
- **Tailwind v4** via `@tailwindcss/vite`
- **@solidjs/router** (programmatic, keine file-based)
- **@tanstack/solid-query** für Server-State + Cache
- **@supabase/supabase-js** (selbes Projekt wie Logbook)
- **@thisbeyond/solid-dnd** für Drag-Reorder
- **vite-plugin-pwa** (Manifest + Service Worker)
- **lucide-solid**, Geist + Geist Mono via Google Fonts CDN

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

`src/lib/queries/<topic>.ts` definiert typed `queryOptions` + Mutation-Funktionen. Komponenten lesen via `createQuery(() => queryOptions(...))` und schreiben via `createMutation(() => ({...}))`. Mutations machen Optimistic-Updates via `queryClient.setQueryData(key, patcher)` und invalidieren am Ende. Realtime-Events laufen durch den generischen `useRealtimeInvalidation`-Hook, der nur Query-Keys invalidiert.

---

## Auth

- **Supabase JS Client** in `src/lib/supabase.ts` mit `persistSession + autoRefreshToken + detectSessionInUrl`
- **AuthProvider** in `src/lib/auth.tsx` — Solid-Context, hydrated von `getSession()` on mount, kept live via `onAuthStateChange()`. Exposes `session()`, `user()`, `loading()`.
- **ProtectedRoute** in `src/components/ProtectedRoute.tsx` — wartet auf `loading()`, dann Children oder `<Navigate href="/login" />`.
- **Login** in `src/routes/Login.tsx` — Discord OAuth + Magic-Link. Beide schicken nach `/auth/callback`.
- **AuthCallback** in `src/routes/AuthCallback.tsx` — Supabase JS exchanged den Code automatisch, dieses Route wartet nur darauf dass `user()` non-null wird und navigiert dann zu `/` (oder `?next=...`).

---

## Routing

Programmatic in `src/routes/index.tsx`. `lazy()` pro Route.

**Layout-Persistenz:** Die fünf protected App-Routes hängen als Children eines einzigen `AppLayout`-Parent-Routes, der `ProtectedRoute + AppShell` einmalig aufspannt. Solid Router hält die Parent-Component über Routenwechsel mounted — nur `props.children` tauscht. Dadurch persistieren BottomNav + AddSheet, BottomNav-Animation und der `+`-Klick-State überleben den Wechsel. Ohne diese Nesting würde der ganze Shell pro Page-Mount neu aufgebaut.

| Route | Guard | Status |
|---|---|---|
| `/login` | public | done |
| `/auth/callback` | public | done |
| `/styleguide` | public | done (18 Sektionen inkl. Anti-Patterns) |
| `/` | protected (AppLayout) | done — Was kommt / Fortsetzen / Logbuch |
| `/lists` | protected (AppLayout) | done |
| `/lists/:shortCode` | protected (AppLayout) | done — DB-generated `adj-adj-noun` (`/lists/mystic-coral-voyager`) |
| `/item/:type/:slug` | protected (AppLayout) | done — DB-generated slug mit `-<source_id>` Suffix bei Kollision |
| `/profile` | protected (AppLayout) | done |
| `/calendar` | — | NICHT existiert, Phase 6 |
| `*` | public | NotFound |

---

## Design-System

**Komplett aus Logbook gepfropft.** `src/index.css` enthält:

- **8 Themes × 2 Modes:** `default` (Standard japanisch-minimalistisch, Vermillion-Akzent), `teenaged` (Teenage Engineering), `sakura`, `budapest`, `totoro`, `medieval`, `biotech`, `maritime`.
- **Tokens:** `--bg`, `--surface`, `--text`, `--text-muted`, `--border` (hairline), `--rule` (heavier tier), `--accent`, `--accent-on`, `--accent-secondary`, `--nav-bg/fg` (inverted).
- **Elevation:** `--shadow-resting/raised/floating` — mode-based, nicht theme-based.
- **Motion:** `--ease-quart` cubic-bezier(0.16, 1, 0.3, 1), `--dur-fast/base/slow` (200/300/320 ms).
- **Type:** `--text-mini` (12px Mono Caps), `--text-label` (13px Mono), `--text-body` (15px), `--text-body-lg` (16px), `--text-heading` (22px), `--text-heading-lg` (24px). Zwei Weights: 400/500.
- **Grain-Layer** als fractal-noise SVG-data-URI — applied as `.grain-layer` in `App.tsx`.

**Theme-Switch:** `<html data-theme="..." class="dark?">`. `applyTheme(id, modePref)` in `src/lib/themes.ts` schreibt Attribut + Klasse + localStorage. No-FOUC-Script in `index.html` läuft vor Solid-Mount.

**Storage-Keys:** `nakama:*` Prefix (`nakama:theme`, `nakama:mode`, `nakama:logbuch-self`). NICHT `logbook:*`.

---

## Komponenten-Inventar

Kurzbeschreibungen — Implementierungsdetails stehen im Source, durable Patterns in §Gotchas.

**Primitives (`src/components/`):**

- `Button` — primary / secondary / ghost, hard corners
- `Badge` — default (bordered mono mini-code) / accent / muted
- `BentoModule` — Section-Wrapper mit `label` + `number` (tabular-nums)
- `PageHeader` — full-bleed Instrument-Kopf, immer mit Hanko-Akzentpunkt, optional `backHref` (chevron-back über History) + `aside`-Slot (h-6 items-center)
- `Tooltip` — dependency-free, JS-positioniert mit Viewport-Clamping (escapes overflow-hidden via `position: fixed`)
- `SelectMenu` — styled Single-Select, click-outside + Escape close
- `ColumnGuide` — vertikale Trennlinie bei 2/3-Position (`position: fixed inset-y-0`), nur ab `md`
- `ThemeSwitcher` — Modus-Toggle + Theme-Grid; in Profil + Styleguide
- `Segmented` — liquid 2/3-Wege-Switch mit Stretch-and-Contract-Bubble (siehe §Gotchas → Liquid Bubble). Eingesetzt von `ListTrackingToggle`, `ThemeSwitcher`, Styleguide
- `NotFound` — geteilte Surface für nicht-existente Liste/Item. Ersetzt früheren silent `navigate("/lists")`-Bounce

**Layout-Shell:**

- `AppShell` — Parent-Route-Layout, mountet **einmal**. Hält AddSheet-State als Two-Signal-Split (`addMounted` für DOM-Lifetime, `addVisible` für Animation; siehe §Gotchas → Two-Signal-Pattern)
- `BottomNav` — Floating Pill, 5 Tabs. `+` sitzt CENTER, trägt `data-add-anchor` als Morph-Origin für AddSheet. Liquid Accent-Bubble. **Back-Button-Satellit** hängt auf Detail-Routen links neben der Pille (`absolute right-full ...`), trägt `data-accent` — Bubble flowt aus Pill in Satelliten und zurück. Pfeil-Opacity ist um 100 ms (`SETTLE_MS`) versetzt
- `NavButton` — setzt `data-accent=""` wenn aktiv (Bubble-Target)
- `AddSheet` — Search + Add-to-list, liquid morph aus der BottomNav. Card oben (page-tier) + Search-Pill unten (nav-tier capsule, morpht aus `[data-add-anchor]`). NavBar fadet sequential-handoff (nicht crossfade). Pre-selected Liste wenn aus `/lists/:id` geöffnet. 220 ms debounce + AbortController. Tap auf Result triggert `addItemToList`
- `MoveItemDialog` — Modal-List-Picker. Same Two-Signal-Pattern wie AddSheet. Lokaler `snap`-Signal hält Item-Title für die Lebensdauer eines Open-Cycles (siehe §Gotchas → Snap-Pattern)
- `ProtectedRoute` — Route-Guard

**Listen-spezifisch:**

- `CreateListForm` — TanStack-Mutation, Optimistic via `setQueryData`
- `DeleteListButton` — Inline-Confirm „Wirklich löschen? · ✓ / ✗" im Aside-Slot
- `EditableListName` — Inline-Rename, hover lifts Pencil + accent. Edit-State via `ring-1 ring-accent` (box-shadow, kein layout-impact)
- `ListTrackingToggle` — per-User Tracken/Archiv-Segment auf `Segmented`
- `PinButton` — Hover-revealed Pin-Toggle. Hat `hidden`-Prop für hard-cut Show-Swap (siehe §Gotchas → Conditional Transition)
- `DragHandle` — Hover-revealed Grip-Handle rechts. Konsumiert via `solid-dnd` activators. Gleicher `hidden`-Prop wie PinButton
- `RowActions` — unified Hover-revealed Action-Cluster rechts. **Pin LINKS**, dann Reset / Move / Remove. `destructive`-Bundle ist OPT-IN: `/lists`-Rows haben nur Pin, `/lists/:shortCode` komplett. Confirm-State lebt im **Parent** als `confirming`-Signal (single source of truth). Reset + Remove invalidieren `listsQueryKey` + `["list"]`-Prefix
- `ResetItemButton` — inline-confirm „Zurücksetzen ✓ / ✗" im Item-Detail-Aside. Calls `reset_item_progress` RPC. Sichtbar nur wenn `watched > 0`
- `EpisodeList` (inline in `ItemDetail.tsx`) — Pointer-events (`onPointerDown/Up/Leave/Cancel`) für unified mouse+touch, 500 ms long-press timer für Cascade, `onContextMenu` für Desktop. Press-Feedback via additive `classList={{ "bg-surface": pressing() }}` (verhindert Flicker beim Release)
- `LoadMore` (inline in `ItemDetail.tsx`) — KEIN Button-Optik, centered Mono-CAPS-Caption + ChevronDown + hover:bg-surface bis Spaltenrand
- `ProgressBar` (inline in `ItemDetail.tsx`) — Hairline-Track + accent-Fill. Bei `total=0` → em-dash, leerer Track

**Home-Dashboard (inline in `Home.tsx`):** `WasKommt` (4-col Accordion-Grid mit hero-2fr-1fr-1fr-1fr; first-click activate, second-click navigate), `Fortsetzen` (Accordion-Rows mit wachsendem Cover 2.25rem→4rem, initial 4 + `ShowMoreToggle`), `Logbuch` (Watch-Bundles + list_add Events, initial 8 + „+ Alle Ereignisse" + „Eigene ausblenden" mit `nakama:logbuch-self` localStorage), `DayTag`, `EventIcon`, `WatchSentence`, `ListAddSentence` (mit „Du hast" / „@user hat"-Konjugation), `Cover`, `TodayLabel`.

---

## Data-Layer (TanStack Query)

`src/lib/queries/lists.ts`:

```typescript
// Per-list keys indexed by short_code (URL-stable), not UUID. Mutations
// operate on UUIDs (UPDATE/DELETE filter on lists.id). Cross-cutting
// writes invalidate the ["list"]-Prefix to cover all open shortCodes.
export const listsQueryKey = ["lists"] as const;
export const listQueryKey = (shortCode) => ["list", shortCode] as const;
export const listItemsQueryKey = (shortCode) => ["list", shortCode, "items"] as const;

// Reads
export function listsQueryOptions(user)                  // incl. newCounts aggregation
export function listQueryOptions(user, shortCode)
export function listItemsQueryOptions(user, shortCode)   // hasNewEpisode per entry

// Lists CRUD
export async function createList(user, input)            // returns ListSummary mit shortCode
export async function renameList({ listId, name })
export async function deleteList(listId)
export async function setListTracking(user, { listId, enabled })

// Pin + reorder (drag-dnd)
export async function setListPin({ listId, pinned })
export async function setListItemPin({ listItemId, pinned })
export async function reorderLists({ orderedIds })
export async function reorderListItems({ listId, orderedIds })

// Per-row item mutations
export async function removeListItem(listItemId)         // delete list_items, item + history bleiben
export async function moveListItem({ listItemId, targetListId })  // sync_enabled=false reset
```

**„Neue Folge"-Badge engine:** identisch zu Logbook's `getItemsWithNewEpisodes`: 14-Tage-Fenster, anime/series → folgen, manga → kapitel. `ListSummary.newCounts = { folgen, kapitel }` pro Liste; `ListEntry.hasNewEpisode` pro Item.

`src/lib/queries/items.ts`:

```typescript
export const itemQueryKey = (type, slug) => ["item", type, slug] as const;
export function itemQueryOptions(type, slug)
// Single item by natural key. Items sind effektiv public (jeder logged-in
// user kann jedes Item sehen). DB trigger items_set_slug_trigger garantiert
// (type, slug) unique.

export async function addItemToList({ listId, source }): Promise<void>
// Upsert items(source,source_id) → trigger sets slug → insert list_items.
// 23505 on list_items unique constraint = already in list → success.
```

`src/lib/queries/episodes.ts`:

```typescript
export const episodesQueryKey = (type, slug) => ["episodes", type, slug] as const;
// Concrete keys sind [...episodesQueryKey, limit] — invalidations targeten
// den Prefix und clearen alle Paginations auf einmal.

export function episodesQueryOptions(user, type, slug, limit = 26)
// Resolves Item via (type, slug), dann lazy fetch + 12 h stale gate
// (items.metadata.episodesFetchedAt). Returns { episodes, total, watched,
// fetchable }. Latest `limit` episodes desc. Head-count queries past
// PostgREST's 1000-row cap.

export async function toggleEpisode({ episodeId, userId, watched })
export async function markEpisodesWatchedUpTo({ itemId, upToEpisodeId })
// Long-press cascade: mark_episodes_watched RPC, _list_item_id=null
// (sync fan-out folgt Phase 7).
export async function resetItemProgress(itemId)
// reset_item_progress RPC. Set-based delete server-side.

// Title-Enrichment Gates:
const TITLE_ENRICHMENT_VERSION = 3  // bumpen erzwingt one-time backfill
const GAP_QUERY_LIMIT = 5000        // bypass PostgREST 1000-row default
// Bulk-upsert (single round-trip, NICHT per-row UPDATE-Loop — letzteres
// hat bei One Piece 1100+ Folgen 110s gebraucht ohne ein Update zu commit-
// ten). Siehe §Gotchas → Bulk Upsert.
```

`src/lib/queries/home.ts` (Phase 5):

```typescript
export const homeQueryKey = ["home"] as const;
export const continueWatchingKey = (userId) => ["home", "continue", userId]
export const upcomingEpisodesKey = (userId) => ["home", "upcoming", userId]
export const recentlyTickedKey = (userId) => ["home", "logbook", userId]

export function continueWatchingOptions(user)  // continue_watching RPC + Jikan-since-last-watch flag
export function upcomingEpisodesOptions(user)  // 14-Tage-Fenster aus tracked_home Listen
export function recentlyTickedOptions(user)    // Bundled watches + list_add events

// LogbookEvent ist DISCRIMINATED UNION:
//   kind: "watch"    → minEpisode, maxEpisode, episodeCount (SESSION_GAP_MS = 6h)
//   kind: "list_add" → listId, listShortCode, listName
// Beide: eventId, ts, itemId, title, type, slug, coverUrl, actorUserId, actorName, isSelf.
// actorName: "@username" preferred, dann display_name, dann null → UI fällt
// auf "Jemand" zurück. Self-events: actorName always null, UI rendert "Du".

// ContinueItem.hasNewEpisode: per-Item flag, true wenn LETZTES released
// air_date > user's letztes watched_at auf diesem Item. UNTERSCHEIDET sich
// vom List-Row-Badge (14-Tage-Fenster): "while you were away" vs
// "still has unwatched recent". Chronischer Backlog deliberately silent.
```

`src/lib/anilist.ts`:

```typescript
// AniList GraphQL — browser-side. CORS open, no API key, 90 req/min.
export interface AniListResult { sourceId; type; title; year; coverUrl; format }
export async function searchAniList(q, signal?): Promise<AniListResult[]>

// Cover-URL-Naming-Falle: API-Feld-Namen sind off-by-one gegen URL-Pfade.
//   API `medium`     → /cover/small/   (~50 px)
//   API `large`      → /cover/medium/  (~230 px)  ← legacy in DB
//   API `extraLarge` → /cover/large/   (~430 px)  ← was wir wollen
// Search-Query holt extraLarge zuerst; legacy DB-URLs werden render-time
// umgeschwenkt via highResCover().
export function highResCover(url): string | null

export async function fetchAniListEpisodes(sourceId, type): Promise<AniListEpisodesResult>
// Paginates airingSchedule für Daten, liest streamingEpisodes für Titel.
// idMal returned für Jikan-Lookup. Manga ruft fetchMangaDexChapterTitles.
// Stricter Parser: KEIN index+1-Fallback mehr (hatte bei One Piece frühe
// Folge-Titel überschrieben).

const MAX_EPISODES = 2000
```

`src/lib/jikan.ts` + `src/lib/mangadex.ts`:

```typescript
// Jikan (jikan.moe): MyAnimeList episode titles. Paginated 100/page,
// 400ms throttle für ~3 req/sec. Returns Map<episodeNumber, title>.
// Füllt ~95% der Folgen die AniList streamingEpisodes nicht abdeckt
// (long-running anime wie One Piece, 1100+ Folgen).
export async function fetchJikanEpisodeTitles(malId): Promise<Map<number, string>>
const MAX_PAGES = 20  // = 2000 cap, matched anilist.ts

// MangaDex über manga.attributes.links.al → AniList-ID-Bridge.
export async function fetchMangaDexChapterCount(aniListId, title): Promise<number | null>
export async function fetchMangaDexChapterTitles(aniListId, title): Promise<Map<number, string>>
// Coverage VARIABEL: offiziell-lizenzierte Serien (One Piece) haben die
// meisten Uploads removed → Handvoll Titel. Weeklys (Chainsaw Man) haben
// Chapter-Einträge aber oft ohne Titel. Best-effort.
```

**Pattern für neue Feature-Area:**

1. Neue Datei `src/lib/queries/<area>.ts` mit gleicher Struktur (keys + options + mutations)
2. RPC oder direkter Table-Access (RLS macht das Filtering, kein `user_id`-Filter)
3. `.select()` nach Mutations zum Detect von silent-RLS-blocks (Logbook-Lektion)
4. Optimistic-Update-Pattern: `onMutate` snapshot+patch, `onError` rollback, `onSuccess` confirm

---

## Realtime

`src/lib/realtime.ts` exportiert `useRealtimeInvalidation(channelKey, [{table, invalidates}])`. Im Component-Mount wird ein Supabase-Channel aufgemacht, jeder postgres_changes-Event invalidiert die deklarierten Query-Keys. RLS scoped Events server-side, kein Client-Filter nötig.

**Verwendet in:**

- `/` home → channel `home`, listens to `episode_watches/episodes/list_items/list_members`, invalidates `homeQueryKey`-Prefix
- `/lists` overview → channel `lists-overview`, listens to `lists/list_members/list_items/episodes/episode_watches`, invalidates `listsQueryKey`
- `/lists/:shortCode` → channel `list-{shortCode}`, invalidates `listQueryKey(shortCode) + listsQueryKey + listItemsQueryKey(shortCode)`
- `/item/:type/:slug` → channel `item-{type}-{slug}`, invalidates `episodesQueryKey(type, slug) + listsQueryKey + ["list"]`-Prefix (Cross-Cutting: Partner-Ticks updaten Listen-Badges live)

**Cache-Fan-out für Mutations:** Jede Write die `itemCount` / Title/Watch-Beziehung ändert, MUSS `listsQueryKey` + `["list"]`-Prefix invalidieren. Episode-Mutations zusätzlich `episodesQueryKey`. Pattern in AddSheet, RowActions, ResetItemButton, ItemDetail toggleMut + cascadeMut.

**Anti-Pattern aus Logbook das wir NICHT machen:** Auf SUBSCRIBED ein Refresh feuern. In Logbook führte das zu Re-Render pro Page-Mount + zerschoss den Router-Cache. Brauchen wir hier nicht, weil staleTime + Mutations + Postgres-Events alle Wege abdecken.

---

## Datenmodell (im Supabase-Projekt — identisch zu Logbook)

Komplettes Schema steht im **Logbook-Repo unter `handshake.md`**. Wichtigste Tabellen:

- `profiles` — user_id, username, display_name, avatar_url
- `lists` — id, owner_id, name, description, is_shared, created_at, **`short_code`** (TEXT UNIQUE, DB-Trigger `lists_set_short_code_trigger`, Format `adj-adj-noun`)
- `list_members` — list_id, user_id, role, tracks_home (per-User), joined_at
- `list_invitations` — invitee_user_id, status
- `items` — source, source_id (`anilist:154587`), type, **`slug`** (TEXT, UNIQUE per `(type, slug)`, Trigger `items_set_slug_trigger` aus `slugify(title)` mit `-<source_id>` Suffix bei Kollision), title, cover_url, metadata
- `list_items` — list_id, item_id, sync_enabled, added_by_user_id
- `episodes` — item_id, season_number, episode_number, title, air_date
- `episode_watches` — user_id, episode_id, watched_at
- `item_history` — user_id, item_id, status (für Movies/Games)
- `list_ownership_transfers` — Mini-Log

**RPCs** (alle SECURITY DEFINER): `mark_episodes_watched`, `toggle_episode_synced`, `continue_watching`, `item_progress`, `reset_item_progress`, `backfill_sync_for_list_item`, `invite_to_list`, `get_my_invitations`, `get_list_invitations`, `accept_list_invitation`, `transfer_list_ownership`.

**Equal-Members-Modell:** `role` ist nur Marker für „Wer hat angelegt". In geteilter Liste hat jedes Mitglied gleiche Rechte; nur Ersteller darf löschen.

---

## Status: Phasen-Plan

| Phase | Status |
|---|---|
| **0 · Setup** | ✓ done |
| **1 · Foundation + Styleguide** | ✓ done — Primitives, Auth-Context, 18-Sektionen-Styleguide |
| **2 · Auth & Shell** | ✓ done — Login (Discord OAuth + Magic-Link), AuthCallback, AppShell, BottomNav, Profile |
| **3 · Listen** | ✓ done — Overview, Detail, Create/Rename/Delete, Tracking-Toggle, Realtime, Optimistic |
| **4 · Items + Tracking** | ✓ done (außer Status-Control für Movies/Games — siehe Offene Punkte). Inkl. Jikan + MangaDex Title-Fallback, Heute/Morgen/Demnächst-Tags |
| **5 · Home Dashboard** | ✓ done — Was kommt / Fortsetzen / Logbuch. „Neue Folge"-Badges auf allen List-Surfaces |
| **6 · Kalender** | offen — Wochen-/Monatsansicht, Tag-Pane, Quick-Tick |
| **7 · Sharing** | offen — Invite-by-@handle, Members-Modul, Sync-Toggle mit Backfill, Mitseher-Indikator, Ownership-Transfer |
| **8 · Polish** | offen — Motion-Choreografie, Empty-States, Skeleton-States, Route-Transitions |
| **9 · PWA + Hosting** | teilweise — Manifest in `vite.config.ts`, Deploy ausstehend |

---

## Offene Punkte

### Konkret offen für die nächste Session

1. **Phase 6 — Kalender.** `/calendar` Route existiert noch nicht. Logbook hat Wochen-/Monatsansicht mit Tag-Pane + Quick-Tick — Vorlage zum portieren. Daten aus den existierenden `episodes`-Tabellen + `item_progress` RPC. Vielleicht dedizierter `calendarQueryOptions` für effizientere Range-Reads.

2. **(Optional) Phase 8 — Polish-Pass zwischendurch.** Route-Transitions (aktuell hart geswapped), Skeleton-States statt „Lade …"-Text, Cover-Fade-in beim onload, Theme-Switch-Transition (CSS-Vars flippen instant).

3. Kleine UX-Polish-Wünsche zwischen-drin atomar abarbeiten — letzte Sessions haben Drag-Reorder, Pin-to-Top, RowActions-Merge, „Neue Folge"-Badge so eingebracht.

### Geplant, aber NICHT akut

- **Sonner / Toast-System.** Aktuell sind alle Feedbacks inline. Toast bringt erst Mehrwert mit Async-Events (Partner-Invite akzeptiert während User auf anderer Seite) — natürlicher Trigger ist Phase 7 Sharing.

- **Status-Control für Movies/Games** (`item_history` table). Wartet auf TMDB/IGDB-Source. AniList kennt nur Anime/Manga.

- **Sync-Fan-out für Cascade & Single-Toggle.** Aktuell `mark_episodes_watched` mit `_list_item_id=null` → keine Mit-Member-Updates. Phase 7: UI muss richtige `list_item.id` ermitteln und in beide Tick-Mutations durchreichen. Toggle ebenfalls auf RPC `toggle_episode_synced` umstellen.

- **Logbuch-Welle-2:** Aktuell `watch` + `list_add` events. Logbook hat zusätzlich `missed` (released-but-unticked als CTA mit Quick-Tick) + `ownership_transfer`. Brauchen wir mit Sharing live. Logik in Logbook-Repo `src/lib/logbook.ts`.

- **Newest-Episode-Title-Lag.** Jikan/MAL + AniList streamingEpisodes hinken 1-3 Wochen hinter Air-Date für neueste Folgen. User sieht „Name der Folge ist noch nicht bekannt"-Fallback. Quellen-Issue, beim nächsten 12 h Stale-Refresh kommt's nach.

- **Manga-Kapitel-Titel:** MangaDex-Coverage patchy für offiziell-lizenzierte Serien (One Piece ~6 EN-Titel insgesamt). Best-effort akzeptiert.

- **Long-anime PostgREST-Cap.** `GAP_QUERY_LIMIT=5000`. Bei 5000+ Folgen (extrem selten) verpassen wir das letzte Drittel.

### Bekannte tech-debt

- **AddSheet Such-Pill Content-Fade beim Schließen** geht mit 300 ms over ease-out, fadet input + icon während Pill noch morpht. Bei sehr schnellen Aktionen sichtbar.
- **AddSheet `origin()` wird beim Mount EINMAL gemessen.** Window-Resize während Sheet offen → Close-Morph läuft zur falschen Position. Mobile selten, Desktop nice-to-have.
- **`/item/:type/:slug` ohne Listen-Kontext.** Deep-Link oder Item in mehreren Listen → kennt „aktuelle Liste" nicht. Back-Button geht via `history.back()`, sonst Fallback `/lists`. Ggf. via location-state vom A-Link mitgeben.
- **NotFound-Backlink** verlinkt pauschal `/lists`. `history.back` via PageHeader handlet meistens, aber Deep-Link auf falsche shortCode landet auf Overview statt vorheriger Liste.

---

## Workflow-Notizen (User)

Vollständig in `CLAUDE.md`. Quick reference:

- Designer ohne Coding-Background, mit starken Design-Instinkten. **Zeigen schlägt erklären.** Iteration im Dev-Server, nicht in Mockups. WebStorm.
- Vor **Schema-Änderungen** + **neuen Screens** fragen („Sheet oder eigene Seite?").
- Bei **Design-Richtungswechseln** kurz Konzept skizzieren, dann bauen.
- Material/tactile + japanisch-minimalistisch + TE. Flache uniforme Card-Grids vermeiden.
- **Git pflegen, atomar.** Lowercase Conventional (`feat(area): …`, `fix(ui): …`, `chore: …`).
- **Dev:** `npm run dev` (port 5173). Bei Bedarf `npx kill-port 5173 && npm run dev`.

---

## Gotchas

### Solid / Router / Reactivity

- **Solid ≠ React.** `class` statt `className`, refs via direkte Variablen-Zuweisung (`ref={myEl!}`), keine Re-Renders sondern fine-grained Reactivity, `createEffect` statt `useEffect`, `createSignal` statt `useState`.
- **JSX-Attribute spread funktioniert anders als in React.** `{...(cond ? {attr: ""} : {})}` produziert inkonsistenten Output bei data-Attributen. Stattdessen direkt: `data-attr={cond ? "" : undefined}`.
- **Solid Router params** sind `Partial<Record<string, string>>`. Bei `:id` segment ist value zur Laufzeit garantiert, aber TypeScript braucht non-null-assertion oder explizites Typing: `useParams<{ id: string }>()`.
- **Layout-Persistenz braucht Parent-Routes.** Wenn ein Layout-Wrapper über Routenwechsel mounted bleiben soll, MUSS er als Parent-Route mit Pages als `children`-Array deklariert sein. Per-Page-Import des Wrappers → Re-Mount pro Navigation.
- **`on()` vs plain `createEffect`:** `on(deps, fn)` DEFERRED den ersten Run per default. Plain `createEffect` fires on initial setup AND on dep changes.
- **Show-Wrapper + Transitions:** Wenn `<Show>` ein animiertes Element umhüllt, kann beim Wechsel von falsy → truthy → falsy das Element unmount → remount, was Transitions zerschießt. Lösung: Always-render mit opacity gating. Ausnahme: wenn das Element von einem gemessenen Wert abhängt (z.B. AddSheet `origin()`), `<Show when={origin()}>` damit das erste Render schon korrekte Werte hat.

### Animation-Patterns

- **Doppel-rAF für CSS-Transitions in Solid.** Ein einzelnes rAF reicht oft nicht — Solid's Render-Loop kann Mount + State-Flip in einer Paint-Frame zusammenfassen, der Browser sieht nie den Initial-State, Transition läuft nicht. Pattern: `rAF(() => rAF(() => setVisible(true)))`.
- **Two-Signal-Pattern für animierte Mount/Unmount.** Ein State (`mounted`) für DOM-Lifetime, ein zweiter (`visible`) für Animation. Visible flippt sofort beim Klick, mounted erst nach `ANIM_MS`. Open: erst mount, dann visible mit rAF×2. Close: erst visible=false, dann setTimeout für mount=false.
- **Sequential handoff statt crossfade.** Zwei gleichfarbige gestapelte Layer NIE per Crossfade swappen — combined alpha dipt auf 0.75 = Flicker. Stattdessen: appearing layer rises ZUERST (während disappearing layer noch opacity-1 und occluding), dann disappearing fällt mit appearing schon dahinter. Konkret: 50 ms windows mit non-overlapping delays. Reference: AddSheet.
- **Snap-Pattern für Dialog-Content der vom Parent kontrolliert wird.** Wenn ein Dialog Content-Props vom Parent kriegt und der Parent diese beim Close zeroht, verschwindet der Content INSTANT — Card collapsed visuell während sie noch fadet. Lösung: lokaler `snap`-Signal im Dialog, Kopie der Props beim Open, gehalten bis nach `ANIM_MS`, dann clear. JSX liest aus Snap. Reference: `MoveItemDialog.tsx`.
- **Bubble-zu-Element-Synchro: SETTLE_MS als Opacity-Delay.** Wenn Element (Back-Button-Pfeil) erst sichtbar werden soll wenn Liquid-Bubble unter ihm angekommen ist: `transition: opacity 200ms var(--ease-quart) 100ms` matched Phase 2 (Contract)-Start. Pfeil fadet ab dem Moment in dem Bubble settled, voll opak bei t≈300ms.
- **Liquid motion language.** Nakama's Animations-Charakter ist „liquid" — stretchy, organic, mercury-like. Default-Easing: `var(--ease-quart)`. Default-Duration: 500 ms (sichtbares Chrome), 300 ms (content fades). Hard cuts OK für Content (Werte/Text), liquid bleibt für Interface-Chrome (Indicators, Sheets, Drags).
- **Liquid Bubble (BottomNav + Segmented).** `data-active` misst Position, absolut positionierter span morpht in 2 Phasen: Phase 1 Kapsel über OLD+NEW, Phase 2 Contract zum Ziel nach `SETTLE_MS=100ms`. Bei 3-Wege-Skip flowt Kapsel durch alle Slots statt zu springen.
- **Hard corners auch für Icon-Buttons.** `rounded-xs` ist Default (BackButton, X-Close, Add-Buttons). `rounded-full` nur für die BottomNav-Pille (sie IST eine Capsule) + Akzent-Hanko-Dot.
- **Tailwind v4 + ease-quart:** `--ease-quart` in `@theme inline` SOLLTE Utility `ease-quart` generieren. In Praxis aktuell arbitrary-syntax `[transition-timing-function:var(--ease-quart)]` zuverlässiger.
- **Per-property transition-timing braucht inline style.** Tailwind's `transition-{prop} duration-X delay-Y` setzt EIN timing für alle gelisteten properties. Für unterschiedliche Timings pro Property: inline `style={{ transition: 'left 500ms ..., opacity 50ms ...' }}` mit comma-separierten Rules.
- **Conditional Transition bei hidden-Toggle.** PinButton/DragHandle haben `hidden`-Prop: wenn true, KEIN `transition-opacity` in Class → opacity-0 wird INSTANT (matched hard-cut Show-Swap der parallel laufenden destructive icons). Wenn false: transition-opacity aktiv → hover-reveal smooth. Browser checked transition-property AT NEW STATE.
- **Drag-Settle suppresses hover-bg.** Lists.tsx + ListDetail.tsx setzen `dragSettling`-Signal von dragStart bis `SETTLE_MS=220ms` nach dragEnd. Während dieser Zeit ist `hover:bg-surface` auf Rows aus — sonst flicker'd hover-bg während Items unter Cursor durchgleiten.

### Daten / RLS

- **PostgREST 1000-Row-Cap** auf SELECT ohne explizites `.limit()`. Bei langlaufenden Shows explizit `.limit(5000)` setzen (siehe `GAP_QUERY_LIMIT`). Hatten silent-truncate auf den neuesten ~100 Folgen, weil das Bulk-Upsert deren Titel gar nicht erst in der Gap-Liste hatte.
- **Bulk Upsert ist immer schneller als per-row UPDATE-Loop.** 1100+ Rows: ~5 s vs ~110 s. Per-row → tab tot, kein Update committed. Pattern: `storeEpisodes`, `enrichJikanTitles`, `enrichMangaDexTitles`.
- **Cross-Cutting Cache-Fan-out:** jede Mutation die `itemCount` oder Title/Watch-Beziehung ändert, MUSS `listsQueryKey` + `["list"]`-Prefix invalidieren. Episode-Mutations zusätzlich `episodesQueryKey`. Episode-Realtime in `/item` invalidiert auch List-Keys, sonst updaten Partner-Ticks die Badges auf nicht-gemounteten /lists-Seiten nicht.
- **TITLE_ENRICHMENT_VERSION Pattern für one-time backfill.** Items.metadata trägt Version-Zahl; bei Logic-Change bumpen → alle Items kriegen einmaligen Retry beim nächsten Visit, unabhängig vom 12 h Stale-Gate. Beispiel: v2 hatte per-row-UPDATE-Loop der für lange Anime crashte, v3 bumpt + bulk-upsert.
- **AniList Cover-URL-Naming-Falle:** API-Feld `coverImage.large` liefert `/cover/medium/` URL (~230 px), nicht `/cover/large/` (~430 px). Letzteres im API-Feld `extraLarge`. Search holt extraLarge, `highResCover()` schwenkt Legacy-DB-URLs render-time um.
- **Discriminated Union für Logbuch-Events.** `LogbookEvent = WatchBundle | ListAddEvent` mit `kind` als Discriminator. Solid's `<Show>` narrowed nicht; im JSX `{ev.kind === "watch" ? <WatchSentence ev={ev}/> : <ListAddSentence ev={ev}/>}` damit TypeScript narrowed.
- **Optimistic Writes ohne `.select()` lügen** wenn RLS still blockt (0 rows, kein Error). Pattern: nach `update` zurück selektieren, wenn 0 → `error: "blocked"` rollback.
- **Migrationen** fährt der User manuell im Supabase SQL-Editor. Bei neuer Migration im Chat ankündigen + den SQL liefern.

---

## Referenzen

- Logbook-Repo: `/Users/johannmertens/Work/Projects/Logbook` — Vorgänger-Projekt mit ausführlichem `handshake.md` (DB-Schema, RLS-Helper, RPCs, ältere UX-Entscheidungen, Logbuch-Konzept)
- Nakama GitHub: https://github.com/M0dds/nakama
- Supabase Projekt: dasselbe wie Logbook, URL/Key in `.env.local`
- Solid Router: https://docs.solidjs.com/solid-router
- TanStack Solid Query: https://tanstack.com/query/latest/docs/framework/solid/overview
- Tailwind v4: https://tailwindcss.com/docs/v4-beta
