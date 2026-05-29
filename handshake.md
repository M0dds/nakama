# Nakama — Handshake

Master-Kontext. Lies das zuerst. **Stand:** Phasen 1-5 abgeschlossen. Phase 5 Home Dashboard ist gelandet (Was kommt accordion + Fortsetzen accordion + Logbuch mit bundled watch/list_add events). „Neue Folge"-Badge läuft auf `/lists` + `/lists/:shortCode` + Fortsetzen-Rows mit dem 14-Tage-Window-Algorithmus aus Logbook. Jikan + MangaDex als Title-Fallback-Quellen für Episoden / Kapitel, versioned-backfill für existierende DB-Einträge. RowActions-Cluster (Reset/Move/Remove + Pin merged) sitzt auf jeder Item-Row in `/lists/:shortCode`. Cache-Pattern für Cross-Cutting-Writes ist jetzt `listsQueryKey` + `["list"]`-Prefix. Cover-Auflösung upgegradet auf `/cover/large/` via `highResCover()`-Helper. Status-Control für Movies/Games bleibt deprio'd (wartet auf TMDB/IGDB). **Phase 6 (Kalender) ist der nächste große Schritt — oder optional Phase 8 (Polish-Pass) für Skeletons + Route-Transitions zwischendurch.**

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
| `/styleguide` | public | done (18 Sektionen — Segmented + RowActions + back-button satellite + Anti-Patterns dazu) |
| `/` | protected (AppLayout) | done — Was kommt (accordion timeline) / Fortsetzen (accordion rows) / Logbuch (bundled feed) |
| `/lists` | protected (AppLayout) | done |
| `/lists/:shortCode` | protected (AppLayout) | done (DB-generated `adj-adj-noun`, z.B. `/lists/mystic-coral-voyager`) |
| `/item/:type/:slug` | protected (AppLayout) | done (DB-generated slug aus title, mit `-<source_id>` Suffix nur bei Kollision) |
| `/profile` | protected (AppLayout) | done |
| `/calendar` | — | NICHT existiert, Phase 6 |
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
- `BottomNav` — Floating Pill mit 5 Tabs (Home / Listen / + / Kalender / Profil). `+` sitzt **CENTER** (das ist die Add-Affordance) und trägt `data-add-anchor` auf der inneren Pille — das ist der Morph-Origin für die AddSheet. Liquid Accent-Bubble via `data-accent`-Targeting + measure-and-stretch-then-contract Animation. **Back-Button-Satellit** hängt auf Detail-Routen (`/lists/:shortCode`, `/item/:type/:slug`) links neben der Pill (absolute `right-full top-1/2 -mt-6 mr-3 size-12 rounded-full`). Trägt `data-accent` statt der NavButtons — die Bubble flowt aus dem Pill in den Satelliten und zurück, gleiche Liquid-Animation wie Tab-zu-Tab. Pfeil-Opacity ist um 100 ms (SETTLE_MS) versetzt, damit er erst auftaucht wenn die Bubble Phase 2 (Contract) auf seiner Position startet — sonst „Ghost-Pfeil" über leerem Slot. `active:scale-95` für tactile Click-Feedback. Click-Handler ist `history.back()` mit Fallback nach `backTarget(pathname)`
- `NavButton` — Nav-Item im Pill, setzt `data-accent=""` wenn aktiv (Bubble-Target)
- `AddSheet` — Search + Add-to-list, **liquid morph aus der BottomNav**. Zwei-Teile-Layout: Card oben (page-tier `bg`, hard corners, kicker + Listen-Selektor + Close-X + scrollable Results) + Search-Pill unten (nav-tier `bg-nav-bg`, capsule). Pill morpht aus dem `[data-add-anchor]`-Rect der NavBar heraus zur Target-Rect (full-width minus padding, mobile keyboard-aware via visualViewport). NavBar selbst fadet **sequential-handoff-style** weg/zurück, nicht crossfade (siehe Memory `sequential-handoff-animation` und Gotchas). 500ms ease-quart in beiden Richtungen, ohne scale/translate auf der Card (pure opacity-fade — die Pill trägt die räumliche Bewegung). Pre-selected Liste wenn aus `/lists/:id` geöffnet. Search-as-you-type mit 220ms debounce + AbortController. Tap auf Result-Row triggert `addItemToList` mit ✓-Markierung in der Session
- `ProtectedRoute` — Route-Guard
- `CreateListForm` — TanStack-Mutation, Optimistic via `setQueryData`
- `DeleteListButton` — Inline-Confirm „Wirklich löschen? · ✓ / ✗" im Aside-Slot. Beide States rendern direkt im h-6-Slot des PageHeaders, items-center, damit der Text in beiden Zuständen auf derselben Höhe sitzt
- `EditableListName` — Inline-Rename im Heading, hover lifts Pencil + accent text. Edit-State benutzt `ring-1 ring-accent` (box-shadow, kein layout-impact)
- `ListTrackingToggle` — per-User Tracken/Archiv-Segment, baut auf `Segmented` auf
- `Segmented` — liquid 2/3-Wege-Switch mit Stretch-and-Contract-Bubble (gleiche Sprache wie BottomNav-Indicator). Aktive Option trägt `data-active="true"`, ein absolut positionierter `span` misst Position und morpht in 2 Phasen (Kapsel über OLD+NEW, dann Contract zum Ziel nach 100ms). Eingesetzt von ListTrackingToggle, ThemeSwitcher, Styleguide. Bei 3-Wege-Skips spannt die Kapsel über alle Slots → flowt durch statt zu springen
- `PinButton` — Hover-revealed Pin-Toggle auf Listen-Rows. Standalone (separate Komponente), aber konsumiert via `RowActions`. Hat `hidden`-Prop: wenn true, conditional-no-transition + opacity-0 (damit der Hide während Confirm-Phase mit den anderen Icons hart cuttet statt 200ms zu fladen)
- `DragHandle` — Hover-revealed Grip-Handle rechts auf Listen-Rows. Standalone, konsumiert via `RowActions` UND direkt in Lists.tsx + ListDetail.tsx als Sibling. Gleicher `hidden`-Prop wie PinButton
- `ResetItemButton` — inline-confirm „Zurücksetzen ✓ / ✗" im Item-Detail-Aside. Calls `reset_item_progress` RPC, invalidiert `episodesQueryKey` + `listsQueryKey` + `["list"]`-Prefix (Cross-Cutting für Badge). Sichtbar nur wenn `watched > 0`
- `EpisodeList` (inline in `ItemDetail.tsx`) — read-only Rows + interaktive Buttons. Pointer-events (`onPointerDown/Up/Leave/Cancel`) für unified mouse+touch handling, 500 ms long-press timer für Cascade, `onContextMenu` für Desktop-Power-User-Right-Click. Press-Feedback via additive `classList={{ "bg-surface": pressing() }}` ON TOP of `hover:bg-surface` — additive statt ternary verhindert das Flicker beim Release (Lücke zwischen pressing=false und hover-Re-Apply)
- `LoadMore` (inline in `ItemDetail.tsx`) — „Weitere laden"-Button am Listen-Ende. KEIN Button-Optik — nur centered Mono-CAPS-Caption + ChevronDown + hover:bg-surface bis Spaltenrand (via `<div class="-mx-5">` wrapper). Pattern für „kontinuierliche Affordance" innerhalb einer Liste
- `ProgressBar` (inline in `ItemDetail.tsx`) — Hairline-Track + accent-Fill, Mono-CAPS-Caption mit `watched/total · pct %`. Bei `total=0` → em-dash statt 0, leerer Track
- `NotFound` — geteilte „nicht gefunden"-Surface für `/lists/:shortCode` und `/item/:type/:slug` wenn die Query `null` zurückgibt (Row existiert nicht ODER RLS scopet weg). Ersetzt den früheren silent `navigate("/lists")`-Bounce. Items: faktischer Text „Eintrag nicht gefunden — Tippfehler / veralteter Link". Listen: kein Privacy-Hinweis (die Erklärung wäre selbst ein Leak), nur „Liste nicht gefunden — überprüf URL oder lass dir den Link vom Owner schicken"
- `RowActions` — unified Hover-revealed Action-Cluster rechts in Listen-Rows. **Pin sitzt LINKS im Cluster**, dann Reset / Move / Remove. Default opacity-0 + pointer-events-none, fadet auf group-hover/focus-within ein. `destructive`-Bundle ist OPT-IN: auf `/lists`-Rows weggelassen (nur Pin), auf `/lists/:shortCode`-Rows komplett. Confirm-State (Reset oder Remove) pinnt die destructive-Gruppe sichtbar und blendet Pin + DragHandle via `hidden`-Prop hart raus (sodass der Pin zeitgleich mit dem Icon→ConfirmStrip-Show-Swap verschwindet, kein 200ms-Flash). **Confirm-State lebt im Parent (der Row)** als `Confirming`-Signal, das via `props.confirming/setConfirming` reingereicht wird — single source of truth, single sync flush; vorher gab's einen Callback-Roundtrip der nicht zuverlässig in einer Frame committet hat. Reset-Mut + Remove-Mut invalidieren beide `listsQueryKey` + `["list"]`-Prefix (Cross-Cutting Cache-Fan-out).
- `MoveItemDialog` — Modal-List-Picker für Move-to-other-list. Same Mount/Visible-Two-Signal-Pattern wie AddSheet: `mounted` gates DOM (mit 500 ms Tail nach Close), `visible` gates Classes (rAF×2 nach Mount). Backdrop fadet `bg-black/0 → bg-black/50` + `backdrop-blur-none → backdrop-blur-sm`, Card pure opacity-fade — selbe 500 ms ease-quart wie AddSheet, damit beide Dialoge als eine Bewegung lesen. **Lokaler `snap`-Signal hält den Item-Title für die Lebensdauer eines Open-Cycles** — sonst zerot der Parent's `setMovingEntry(null)` beim Close die Props sofort, der h2 collapsed, Card wirkt „flacher" während sie noch fadet. Body-scroll-lock gated auf `mounted()` (nicht props.open) damit kein Glitch durch die 500 ms Close-Animation
- **Home-Dashboard-Sub-Components** (alle inline in `Home.tsx`): `WasKommt` (4-col Accordion-Grid mit hero=2fr-1fr-1fr-1fr und animated grid-template-columns; first-click activate, second-click navigate), `Fortsetzen` (Accordion-Rows mit wachsendem Cover 2.25rem→4rem, initial 4 Items + `ShowMoreToggle`), `Logbuch` (Watch-Bundles + list_add Events, initial 8 Events + „+ Alle Ereignisse" + „Eigene ausblenden" toggle mit localStorage-Persistierung `nakama:logbuch-self`), `DayTag` (Heute/Auch heute/Morgen + datum), `EventIcon` + `WatchSentence` + `ListAddSentence` (Logbuch-Sentence-Templates mit korrekter „Du hast" / „@user hat"-Konjugation), `Cover` + `TodayLabel` (PageHeader-Aside) + `ShowMoreToggle`

---

## Data-Layer (TanStack Query)

`src/lib/queries/lists.ts`:

```typescript
// Query keys — per-list keys indexed by short_code (URL-stable), not UUID.
// Mutations still operate on UUIDs (UPDATE/DELETE filter on lists.id).
// Cross-cutting writes invalidate the ["list"] prefix to cover both
// listQueryKey + listItemsQueryKey for every open shortCode in cache.
export const listsQueryKey = ["lists"] as const;
export const listQueryKey = (shortCode) => ["list", shortCode] as const;
export const listItemsQueryKey = (shortCode) => ["list", shortCode, "items"] as const;

// Query options — Komponenten benutzen via createQuery
export function listsQueryOptions(user)               // SELECT incl. newCounts aggregation
export function listQueryOptions(user, shortCode)     // .eq("short_code", ...)
export function listItemsQueryOptions(user, shortCode) // hasNewEpisode per entry; takes user

// "Neue Folge"-Badge engine. Identical to Logbook's getItemsWithNewEpisodes:
// 14-Tage-Fenster, anime/series → folgen, manga → kapitel.
// async function getItemsWithNewEpisodes(userId): Promise<Map<itemId, type>>
// ListSummary.newCounts = { folgen, kapitel } pro Liste (aggregiert).
// ListEntry.hasNewEpisode = boolean pro Item (per-User vs eigene watches).

// Mutations — Komponenten benutzen via createMutation
export async function createList(user, input)         // returns ListSummary mit shortCode + empty newCounts
export async function renameList({ listId, name })    // UUID-based UPDATE
export async function deleteList(listId)              // UUID-based DELETE
export async function setListTracking(user, { listId, enabled })  // UUID

// Per-row mutations (RowActions)
export async function removeListItem(listItemId)      // delete list_items, item + history bleiben
export async function moveListItem({ listItemId, targetListId })
// UPDATE list_items SET list_id, sync_enabled=false. Sync wird zurückgesetzt
// weil die neue Liste evtl. andere Member hat (Phase 7-relevant).
```

`src/lib/queries/items.ts`:

```typescript
export const itemQueryKey = (type, slug) => ["item", type, slug] as const;
export function itemQueryOptions(type, slug)
// Single item by natural key. Items are effectively public (any logged-in
// user can see any item). DB trigger items_set_slug_trigger guarantees
// (type, slug) is unique.

export async function addItemToList(input: { listId: string; source: AniListResult }): Promise<void>
// Upsert items(source,source_id) → trigger sets slug → insert list_items.
// 23505 on list_items unique constraint = already in list → success.
```

`src/lib/queries/episodes.ts`:

```typescript
export const episodesQueryKey = (type, slug) => ["episodes", type, slug] as const;
// Concrete query keys are [...episodesQueryKey(type, slug), limit] —
// invalidations target the prefix and clear all paginations at once.

export function episodesQueryOptions(user, type, slug, limit = 26)
// Resolves the item via (type, slug), then runs the lazy fetch + 12 h
// stale gate (items.metadata.episodesFetchedAt). Returns { episodes,
// total, watched, fetchable }. Latest `limit` episodes, descending
// (newest on top). Head-count queries past PostgREST's 1000-row cap.

export async function toggleEpisode({ episodeId, userId, watched })
// Single tap: insert OR delete on episode_watches. Idempotent both ways.

export async function markEpisodesWatchedUpTo({ itemId, upToEpisodeId })
// Long-press cascade: mark_episodes_watched RPC, _list_item_id=null
// (sync fan-out follows Phase 7). Takes items.id UUID (resolved client-
// side from the loaded item.data).

export async function resetItemProgress(itemId)
// Reset-Item-Aside: reset_item_progress RPC. Set-based delete server-
// side. Takes items.id UUID.

// Title-Enrichment — see jikan.ts + mangadex.ts. Item.metadata trägt
// `titleEnrichmentVersion: number` als Gate für one-time-backfill bei
// existierenden Items (independent vom 12h-stale-gate). Bumpen erzwingt
// re-run für alle Items. Current: 3.
// const TITLE_ENRICHMENT_VERSION = 3
// const GAP_QUERY_LIMIT = 5000 // bypass PostgREST 1000-row default cap

// async function enrichJikanTitles(item)    — anime backfill
// async function enrichMangaDexTitles(item) — manga backfill
// Both bulk-upsert (single round-trip, NICHT per-row UPDATE-Loop — der
// hat bei One Piece 1100+ Folgen 110s gebraucht und kein Update committed).
```

`src/lib/queries/home.ts` (Phase 5):

```typescript
// Three query keys, alle Sub-Keys vom ["home"]-Prefix — Realtime
// invalidiert den Prefix und alle drei Module refetchen.
export const homeQueryKey = ["home"] as const;
export const continueWatchingKey = (userId) => ["home", "continue", userId] as const;
export const upcomingEpisodesKey = (userId) => ["home", "upcoming", userId] as const;
export const recentlyTickedKey = (userId) => ["home", "logbook", userId] as const;

export function continueWatchingOptions(user)  // continue_watching RPC + Jikan-since-last-watch flag
export function upcomingEpisodesOptions(user)  // 14-Tage-Fenster aus tracked_home Listen
export function recentlyTickedOptions(user)    // Bundled watches + list_add events

// LogbookEvent ist eine DISCRIMINATED UNION:
// - kind: "watch"     → minEpisode, maxEpisode, episodeCount (SESSION_GAP_MS = 6h bundling)
// - kind: "list_add"  → listId, listShortCode, listName
// Beide haben: eventId, ts (renamed von bundleId/watchedAt für generische
// Verwendung), itemId, title, type, slug, coverUrl, actorUserId, actorName, isSelf.
// actorName: "@username" preferred, dann display_name, dann null → UI fällt
// auf "Jemand" zurück. Self-events: actorName always null, UI rendert "Du".

// ContinueItem.hasNewEpisode: per-Item flag, true wenn LETZTES released
// air_date > user's letztester watched_at auf diesem Item. UNTERSCHEIDET
// sich vom List-Row-Badge (14-Tage-Fenster): "while you were away" vs
// "still has unwatched recent". Chronischer Backlog deliberately silent.
```

`src/lib/anilist.ts`:

```typescript
// AniList GraphQL — runs in the browser. CORS open, no API key, 90 req/min.
export interface AniListResult { sourceId; type; title; year; coverUrl; format }
export async function searchAniList(q, signal?): Promise<AniListResult[]>

// Cover-URL-Naming-Falle: AniList's API-Feld-Namen sind off-by-one
// gegenüber URL-Pfaden.
//   API `medium`     → URL /cover/small/    (~50 px)
//   API `large`      → URL /cover/medium/   (~230 px)  ← was wir vorher gespeichert haben
//   API `extraLarge` → URL /cover/large/    (~430 px)  ← was wir jetzt wollen
// Search query holt extraLarge zuerst; legacy DB-URLs werden render-time
// umgeschwenkt via highResCover().
export function highResCover(url): string | null
// Replaces /cover/(small|medium)/ → /cover/large/ in AniList-URLs.
// No-op für Non-AniList-URLs oder bereits-large.

export interface AniListEpisode { seasonNumber; episodeNumber; title; airDate }
export interface AniListEpisodesResult { episodes: AniListEpisode[]; malId: number | null }
export async function fetchAniListEpisodes(sourceId, type): Promise<AniListEpisodesResult>
// Paginates airingSchedule for dates, reads streamingEpisodes for titles.
// idMal returned für Jikan-Lookup. Manga branch ruft auch
// fetchMangaDexChapterTitles für Kapitel-Titel.
// Stricter Parser: kein index+1-Fallback mehr (hatte bei One Piece
// frühe Folge-Titel überschrieben).
```

`src/lib/jikan.ts` (Phase-4-Welle-2 Episode-Title-Fallback):

```typescript
// MyAnimeList episode titles via Jikan (jikan.moe). Paginated 100/page,
// 400ms-throttle für ~3 req/sec rate limit. Returns Map<episodeNumber, title>.
// Für long-running anime wie One Piece (1100+ Folgen) füllt es die ~95%
// der Episoden, die AniList's streamingEpisodes nicht abdeckt.
export async function fetchJikanEpisodeTitles(malId): Promise<Map<number, string>>
// MAX_PAGES = 20 (= 2000 Folgen cap, matched anilist.ts MAX_EPISODES).
```

`src/lib/mangadex.ts`:

```typescript
// Geteilte ID-Auflösung über MangaDex's manga.attributes.links.al.
// async function findMangaDexId(aniListId, title)

// Chapter-count fallback für ongoing manga (AniList kennt nur abgeschlossene).
export async function fetchMangaDexChapterCount(aniListId, title): Promise<number | null>

// Per-Chapter English Titel — coverage VARIABEL: offiziell-lizenzierte
// Serien (One Piece) haben die meisten Uploads removed → nur Handvoll
// Titel. Weeklys (Chainsaw Man) haben Chapter-Einträge aber oft ohne
// Titel weil Verlage keine vergeben. Best-effort.
export async function fetchMangaDexChapterTitles(aniListId, title): Promise<Map<number, string>>
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
- `/` home → channel `home`, listens to `episode_watches/episodes/list_items/list_members`, invalidates `homeQueryKey` Prefix (alle drei Module refetchen)
- `/lists` overview → channel `lists-overview`, listens to `lists/list_members/list_items/episodes/episode_watches`, invalidates `listsQueryKey` (Badge-Counts inkludiert)
- `/lists/:shortCode` detail → channel `list-{shortCode}`, listens to alles + `episodes/episode_watches`, invalidates `listQueryKey(shortCode) + listsQueryKey + listItemsQueryKey(shortCode)`
- `/item/:type/:slug` detail → channel `item-{type}-{slug}`, listens to `episodes/episode_watches`, invalidates `episodesQueryKey(type, slug) + listsQueryKey + ["list"]`-Prefix (Cross-Cutting damit Partner-Ticks die Listen-Badges live updaten)

**Cache-Fan-out für Mutations:** Jede Write die Item-Status, Episode-Watches oder List-Membership betrifft, invalidiert konsequent `listsQueryKey` + `["list"]`-Prefix. Pattern in: AddSheet (Add), RowActions (Reset + Remove), ResetItemButton, ItemDetail toggleMut + cascadeMut. Vorher invalidierten einzelne Mutations nur ihre lokalen Keys → Listen-Badges (Neue Folge + itemCount) blieben stale bis 5min staleTime ablief.

**Anti-Pattern aus Logbook das wir hier NICHT machen:** Auf SUBSCRIBED ein Refresh feuern. In Logbook (Next 16) führte das zu einem Re-Render pro Page-Mount und hat den Router-Cache zerschossen. In Nakama brauchen wir das nicht weil TanStack Query staleTime handhabt + Mutations + Postgres-Events alle Wege abdecken.

---

## Datenmodell (im Supabase-Projekt — identisch zu Logbook)

Komplettes Schema steht im **Logbook-Repo unter `handshake.md`**. Wichtigste Tabellen:

- `profiles` — user_id, username, display_name, avatar_url
- `lists` — id, owner_id, name, description, is_shared, created_at, **`short_code`** (TEXT UNIQUE, generiert via DB-Trigger `lists_set_short_code_trigger`, Format `adj-adj-noun`)
- `list_members` — list_id, user_id, role, tracks_home (per-User), joined_at
- `list_invitations` — invitee_user_id, status (pending/accepted/declined)
- `items` — source, source_id (z.B. `anilist:154587`), type, **`slug`** (TEXT, UNIQUE per `(type, slug)`, generiert via DB-Trigger `items_set_slug_trigger` aus `slugify(title)` mit `-<source_id>` Suffix bei Kollision), title, cover_url, metadata
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
| **4 · Items + Tracking** | ✓ done (außer Status-Control für Movies/Games — siehe unten). Plus Welle-2: Jikan + MangaDex Title-Fallback für AniList-Lücken, Heute/Morgen/Demnächst-Tags, Fixed-Width Date-Column, MONTH_ABBR_3, „Name der Folge ist noch nicht bekannt"-Fallback für unreleased |
| **5 · Home Dashboard** | ✓ done — Was kommt (4-col Accordion-Grid mit hero-2fr-1fr-1fr-1fr animated grid-template-columns), Fortsetzen (Accordion-Rows mit wachsendem Cover, ShowMore-Toggle, „Neue Folge"-Badge per-Item since-last-watch), Logbuch (bundled watch events SESSION_GAP_MS=6h + list_add events, „+ Alle Ereignisse" + „Eigene ausblenden"-Toggles). Plus „Neue Folge"-Badge auf `/lists` + `/lists/:shortCode` mit 14-Tage-Fenster |
| **6 · Kalender** | offen — Wochen-/Monatsansicht, Tag-Pane, Quick-Tick |
| **7 · Sharing** | offen — Invite-by-@handle, Members-Modul, Sync-Toggle mit Backfill, Mitseher-Indikator, Ownership-Transfer |
| **8 · Polish** | offen — Motion-Choreografie, Empty-States, Animations-Pass |
| **9 · PWA-Manifest fertigstellen + Hosting** | teilweise — Manifest steht in `vite.config.ts`, Deploy auf Vercel/Cloudflare Pages noch nicht |

### Phase 4 — Detail-Status

| Sub | Status |
|---|---|
| AniList GraphQL Client | ✓ done — `src/lib/anilist.ts` (Search + Episodes) |
| `addItemToList` Mutation | ✓ done — `src/lib/queries/items.ts`, idempotent via 23505-handling |
| AddSheet UI + Animation | ✓ done — `src/components/AddSheet.tsx`, Liquid Nav-Pill-Morph |
| `+` in BottomNav verdrahtet | ✓ done — `data-add-anchor` auf der inneren Pille |
| Items als Rows in `/lists/:id` | ✓ done — `ListEntries` in `ListDetail.tsx`, klickbar auf `/item/:id` |
| Item-Detail-Seite `/item/:id` | ✓ done — Cover (Section 02) + Episode-Liste (Section 01) + Details |
| Lazy `fetchAniListEpisodes` | ✓ done — `airingSchedule` paginiert für Daten + `streamingEpisodes` für Titel + MangaDex-Fallback |
| Episode-Layer (`episodes` table) | ✓ done — `src/lib/queries/episodes.ts`, 12 h stale-gate, prefix-keyed pagination |
| EpisodeList UI | ✓ done — Rows mit Episode-Nr / Titel / Datum / Watched-Dot. Desktop-Kacheln aus Logbook bewusst nicht portiert — Rows lesen sich besser im 2/3-Layout |
| Cascade / Single / „Bis hier" Tick-Pattern | ✓ done — Single-Tap (`toggleEpisode`), Long-Press 500 ms / Right-Click Cascade (`markEpisodesWatchedUpTo`) |
| Reset-Item-Progress | ✓ done — `ResetItemButton` im PageHeader-Aside (inline-confirm) |
| „Weitere laden"-Pagination | ✓ done — `PAGE_SIZE=26`, limit-Signal, `placeholderData: prev` während Fetch |
| Status-Control für Movies/Games (`item_history`) | ⏸ deprio'd — wartet auf TMDB/IGDB-Sources (AniList kennt nur Anime/Manga) |

---

## Offene Punkte (Stand: Phase 5 done + Title-Fallback durch + Cache-Fan-out + High-Res Covers)

### Konkret offen für die nächste Session

1. **Phase 6 — Kalender.** `/calendar` Route existiert noch nicht. Logbook hat eine Wochen-/Monatsansicht mit Tag-Pane + Quick-Tick — Vorlage zum portieren. Daten kommen aus den selben Episodes-Tabellen die Phase 4+5 bereits speisen, kein neuer Data-Layer nötig (vielleicht ein dedizierter `calendarQueryOptions` für effizientere Range-Reads). RPC `item_progress` aus Logbook ist verfügbar wenn wir per-Item Progress-Bars in der Tag-Pane brauchen.

2. **(Optional) Phase 8 — Polish-Pass zwischendurch.** Vor Phase 6 könnten wir eine motion-choreography-Welle einlegen: Route-Transitions (aktuell hart geswapped), Skeleton-States statt „Lade …"-Text-Fallbacks, Cover-Fade-in beim onload, Theme-Switch-Transition (CSS-Vars flippen aktuell instant). Survey + Plan steht im Memory von Session-mit-Phase-5 — wir hatten den Plan schon, dann auf Phase 5 verschoben.

3. **(Optional, zwischen-drin)** Weitere kleine UX-Polish-Punkte falls der User welche hat. Letzte Sessions haben Drag-Reorder, Pin-to-Top, RowActions-Merge, „Neue Folge"-Badge eingebracht — gleiche Klasse von Feature ist denkbar.

### Geplant, aber NICHT akut

- **Sonner / Toast-System.** Aktuell sind alle wichtigen Feedbacks inline (✓ in AddSheet, weg-navigieren nach Delete, Häkchen verschwinden nach Reset). Toast bringt erst Mehrwert mit Async-Events — natürlicher Trigger ist Phase 7 Sharing (Invite akzeptiert vom Partner während User auf anderer Seite). Bis dahin nicht bauen. Wenn dann: kleine Side-Toast (rechts unten? links unten?), keine groß-aufdringliche Variante.

- **Status-Control für Movies/Games** (`item_history` table). Wartet auf TMDB/IGDB-Source. AniList kennt nur Anime/Manga.

- **Sync-Fan-out für Cascade & Single-Toggle.** Aktuell rufe `mark_episodes_watched` mit `_list_item_id=null` → keine Mit-Member-Updates. Wenn Phase 7 das Invite-Modell baut, muss die UI die richtige `list_item.id` ermitteln (über die Listen-Route die der User durchgegangen ist, oder über einen item-pro-list-Resolver) und in beide Tick-Mutations als Parameter durchreichen. Toggle ebenfalls auf RPC `toggle_episode_synced` umstellen (Logbook-Pattern).

- **Logbuch-Welle-2:** Aktuell zeigt Logbuch nur `watch` + `list_add` events. Logbook hat zusätzlich `missed` (released-but-unticked als CTA mit Quick-Tick-Button), `ownership_transfer`. Brauchen wir wenn Sharing live ist. Logik existiert in `src/lib/logbook.ts` im Logbook-Repo zum portieren.

- **Newest-Episode-Title-Lag.** Jikan/MAL und AniList streamingEpisodes hinken typisch 1-3 Wochen hinter dem Air-Date für neueste Folgen (Streaming-Dienste haben sie nicht direkt). User sieht für die brand-aktuellsten Folgen den „Name der Folge ist noch nicht bekannt"-Fallback. Quellen-Issue, kein Code-Fix. Beim nächsten 12h-Stale-Gate-Refresh kommt's automatisch nach.

- **Manga-Kapitel-Titel:** MangaDex-Coverage ist patchy für offiziell-lizenzierte Serien (One Piece hat ~6 Kapitel-Titel in EN aggregate, der Rest leer). Best-effort akzeptiert.

- **Long-anime PostgREST-Cap.** GAP_QUERY_LIMIT ist auf 5000 gesetzt. Für Anime mit 5000+ Folgen (extrem selten) würden wir das letzte Drittel verpassen. Nicht akut.

### Bekannte tech-debt

- **AddSheet: Such-Pill innere Content-Fade beim Schließen** geht mit 300 ms over ease-out, fadet input + icon weg während der Pill noch morpht. Bei sehr schnellen User-Aktionen sichtbar. Nicht akut.
- **AddSheet: `origin()` wird beim Mount EINMAL gemessen.** Window-Resize während Sheet offen kann den Close-Morph zur falschen Position laufen lassen. Auf Mobile selten, Desktop nice-to-have.
- **`/item/:type/:slug` ohne Listen-Kontext.** Wenn man via Deep-Link ankommt (oder Item ist in mehreren Listen), kennt die Detail-Page die „aktuelle Liste" nicht — Back-Button geht via `history.back()`, sonst Fallback `/lists`. Ggf. via location-state vom A-Link mitgegeben für saubere Breadcrumbs.

- **NotFound-Backlink: weiß nicht von welcher Liste man kam.** Der NotFound-Surface verlinkt aktuell pauschal `/lists`. Wenn jemand `/lists/<falsche-shortcode>` öffnet und auf „Zurück" klickt, kommt er auf die Übersicht — OK. Aber `/item/<type>/<falscher-slug>` clicked aus einer Liste sollte vielleicht zurück zur ursprünglichen Liste (history.back via PageHeader handlet das schon).

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
- **Snap-Pattern für Dialog-Content der vom Parent kontrolliert wird.** Wenn ein Dialog Content-Props vom Parent kriegt (z.B. `itemTitle` aus `movingEntry()`), und der Parent diese Props beim Close zeroht (`setMovingEntry(null)`), dann verschwindet der Content INSTANT — die Card collapsed visuell während sie noch fadet. Lösung: lokaler `snap`-Signal im Dialog, setzt eine Kopie der Props beim Open, hält sie bis nach ANIM_MS, dann clear. JSX liest aus dem Snap, nicht aus den Props. Siehe `MoveItemDialog.tsx`.
- **Bubble-zu-Element-Synchro: SETTLE_MS als Opacity-Delay.** Wenn ein Element (Back-Button-Pfeil) erst sichtbar werden soll wenn die Liquid-Bubble unter ihm angekommen ist, kann CSS das nicht direkt — aber die `SETTLE_MS`-Konstante aus der Bubble-Animation funktioniert als Sync-Offset: `transition: opacity 200ms var(--ease-quart) 100ms` matched Phase 2 (Contract)-Start. Pfeil fadet ab dem Moment in dem die Bubble auf seiner Position settelt, voll opak bei t≈300ms (Bubble-Final). Symmetrisch beim Close — Pfeil verlässt mit der Bubble zusammen.
- **Liquid motion language.** Nakama's Animations-Charakter ist „liquid" — stretchy, organic, mercury-like. Default-Easing: `var(--ease-quart)` (`cubic-bezier(0.16, 1, 0.3, 1)`). Default-Duration für sichtbare Chrome-Bewegungen: 500ms (Search-Pill-Morph), 300ms für content-fades. Hard cuts/snaps sind OK für Content (Werte/Text), liquid bleibt für Interface-Chrome (Indicators, Sheets, Drags). Siehe Memory `motion-language-liquid`.
- **Hard corners auch für Icon-Buttons.** `rounded-xs` ist der Default für icon-buttons (BackButton, X-Close, Add-Buttons). `rounded-full` nur für die BottomNav-Pille selbst (weil sie BUCHSTÄBLICH eine Capsule ist) und für den Akzent-Hanko-Dot. Siehe Memory `icon-buttons-hard-corners`.
- **Tailwind v4 + ease-quart:** `--ease-quart` in `@theme inline` SOLLTE die Utility `ease-quart` generieren. In Praxis benutzen wir aktuell die arbitrary-syntax `[transition-timing-function:var(--ease-quart)]` — wirkt zuverlässiger.
- **Per-property transition-timing braucht inline style.** Tailwind's `transition-{prop} duration-X delay-Y` setzt ein einziges timing für alle gelisteten properties. Für unterschiedliche Timings pro Property (z.B. morph 500ms + opacity 50ms): inline `style={{ transition: 'left 500ms ..., opacity 50ms ...' }}` mit comma-separierten Rules.

### Daten / RLS

- **PostgREST 1000-Row-Cap** auf SELECT ohne explizites `.limit()` — bei langlaufenden Shows (One Piece) oder Massen-Episoden-Reads explizit `.limit(5000)` setzen (siehe GAP_QUERY_LIMIT in episodes.ts). Wir hatten einmal silent-truncate auf den NEUESTEN ~100 Folgen weil das Bulk-Upsert deren Titel gar nicht erst in der Gap-Liste hatte.
- **Bulk Upsert ist immer schneller als per-row UPDATE-Loop.** Für 1100+ Rows ist ~5s vs ~110s. Per-row → tab tot, kein Update committed. Pattern in `storeEpisodes` + `enrichJikanTitles` + `enrichMangaDexTitles`.
- **Cross-Cutting Cache-Fan-out:** jede Mutation die einen `itemCount` oder eine Title/Watch-Beziehung ändert, muss `listsQueryKey` + `["list"]`-Prefix invalidieren. Episode-Mutations zusätzlich `episodesQueryKey`. Episode-Realtime in `/item` invalidiert auch die List-Keys, weil sonst Partner-Ticks die Badges auf nicht-gemounteten /lists-Seiten nicht updaten.
- **TITLE_ENRICHMENT_VERSION Pattern für one-time backfill.** Items.metadata trägt eine Version-Zahl; bei Logic-Change bumpen → alle existierenden Items kriegen einmaligen Retry beim nächsten Visit, unabhängig vom 12h-Stale-Gate. Beispiel: v2 hatte einen per-row-UPDATE-Loop der für lange Anime crashte, v3 bumpt + bulk-upsert.
- **AniList Cover-URL-Naming-Falle:** `coverImage.large` liefert eine `/cover/medium/` URL (~230px), nicht `/cover/large/` (~430px). Letzteres steckt im API-Feld `extraLarge`. Search-Query holt extraLarge, `highResCover()` schwenkt Legacy-DB-URLs render-time auf den Pfad-Segment um.
- **Discriminated Union für Logbuch-Events.** `LogbookEvent = WatchBundle | ListAddEvent` mit `kind` als Discriminator. Solid's `<Show>` narrowed nicht; im JSX `{ev.kind === "watch" ? <WatchSentence ev={ev}/> : <ListAddSentence ev={ev}/>}` damit TypeScript brennen kann.
- **Optimistic Writes ohne `.select()` lügen** wenn RLS still blockt (0 rows, kein Error). Pattern: nach `update` zurück selektieren, wenn 0 → `error: "blocked"` rollback.
- **Migrationen** fährt der User manuell im Supabase SQL-Editor. Bei neuer Migration im Chat ankündigen + den SQL liefern.

### Animation-Patterns (Welle 2)

- **Conditional Transition bei hidden-Toggle.** PinButton/DragHandle haben `hidden`-Prop: wenn true, KEIN `transition-opacity` in der Class → opacity-0 wird INSTANT (matched die hard-cut Show-Swap der parallel laufenden destructive icons). Wenn false: transition-opacity aktiv → hover-reveal smooth. Browser checked transition-property AT NEW STATE, nicht alte → wenn neue Class keine Transition für Property hat, wird's instant.
- **Drag-Settle suppresses hover-bg.** Lists.tsx + ListDetail.tsx setzen `dragSettling`-Signal von dragStart bis SETTLE_MS=220ms nach dragEnd. Während dieser Zeit ist `hover:bg-surface` auf Rows ausgeschaltet — sonst flicker'd hover-bg während Items unter dem Cursor durchgleiten.
- **Segmented Liquid-Bubble.** Stretch-and-Contract genau wie BottomNav: data-active misst position, span morpht in 2 Phasen (Kapsel über OLD+NEW → Contract zum Ziel nach SETTLE_MS=100ms). Bei 3-Wege-Skip spannt Kapsel über alle drei Slots → flow statt jump.

---

## Referenzen

- Logbook-Repo: `/Users/johannmertens/Work/Projects/Logbook` — komplettes Vorgänger-Projekt mit ausführlichem `handshake.md` (DB-Schema, RLS-Helper, RPCs, ältere UX-Entscheidungen, Logbuch-Konzept etc.)
- Nakama GitHub: https://github.com/M0dds/nakama (auch lokal als `origin`)
- Supabase Projekt: dasselbe wie Logbook, URL/Key in `.env.local` (kopiert von Logbook)
- Solid Router: https://docs.solidjs.com/solid-router
- TanStack Solid Query: https://tanstack.com/query/latest/docs/framework/solid/overview
- Tailwind v4: https://tailwindcss.com/docs/v4-beta (bzw. die im node_modules ausgelieferte Doku)
