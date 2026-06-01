# Nakama — Handshake

Master-Kontext. Lies das zuerst.

**Stand (Tagesstatus):** Phasen 1-8 + Sync-Instanzen + Politur-Session + **Themen 1a (Serien) · 1b (Filme) · 1c (Spiele/Steam)** alle in lokalem `main`. Arbeit läuft seit 2026-06-01 über **kurzlebige Feature-Branches → `main` gemerged** (User: „better safe than sorry"; atomare Commits). **`origin` bewusst NICHT aktuell:** `main` ist `origin/main` ~200 Commits voraus — „mergen ok, nur nicht pushen". Build grün, Tree clean, **17 Migrationen** in `supabase/migrations/` (Status je Migration → §Gotchas → Daten/RLS). Feature-Detail je Phase → §Status; Nächstes → §Offene Punkte. **Alle drei Medien-Themen durch:** Serien (echte Staffeln), Filme + Spiele (episodenlos → binärer Gesehen/Gespielt-Status in `item_history`, eigene Detailseite, Mitseher-Auge, unreleased in „Was kommt"). **Außerdem:** `ConfirmDialog` (Modal statt inline); Detailseiten-Politur; Content-Cap als feste Breite (1728px) + Framing-Hairlines. **Zuletzt (2026-06-01):** Health-Audit (23-Agenten-Review → 10 Fixes, HEALTH Bundle 8; u.a. `added_by_user_id`-Bug) **+ Thema 2 · Paging** (nummerierter `Pager` + geteilter `createLiquidBubble`-Hook, den Pager & `Segmented` nutzen) **+ Login-Redesign** (Discord-Hero, Magic-Link hinter „Kein Discord-Konto?"-Disclosure, `email`-Scope) **+ `UserChip`** (Hover-Identitätskarte Avatar+Anzeigename+@handle in Logbuch/Roster/Mitseher — Anti-Spoofing). **Auth-Modell:** Discord primär; Magic-Link an dieselbe Discord-Mail = Recovery in *denselben* Account (Supabase Same-Email-Linking, verifiziert). **+ Thema 3 · First-Login-Setup** (`/setup`-Wizard Identität→Avatar→Theme, Handle wählbar mit Live-Check, `onboarded_at`-Gate; Migr. `20260601100000`). **+ Privacy-Fix + Audit:** ein **echtes RLS-Leck** gefunden & geschlossen (globale `episode_watches` waren für jeden sichtbar, der dasselbe Item trackt — `is_co_member` band nicht an den Watcher; Migr. `20260601110000`), dann **alle** Lese-Pfade auditiert (RLS-Policies + DEFINER-RPCs) → **sauber**. **Nächste Session: Thema 4** — Onboarding-Tooltips (§Offene Punkte).

> **Wegweiser (eine Quelle je Sache):** Feature-Inventar pro Phase → **§Status** · Offenes/nächste Schritte → **§Offene Punkte** · durable Architektur + Fallen (inkl. Sync-Instanzen-Modell, Migrationsliste) → **§Gotchas**. Diese Datei ist die *einzige* Status-Quelle; CLAUDE.md verweist nur hierher.

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
| `/features` | public | done — Feature-/Landingpage (standalone, von Login verlinkt), `src/routes/Features.tsx` |
| `/` | protected (AppLayout) | done — Was kommt / Fortsetzen / Logbuch |
| `/lists` | protected (AppLayout) | done |
| `/lists/:shortCode` | protected (AppLayout) | done — DB-generated `adj-adj-noun` (`/lists/mystic-coral-voyager`) |
| `/item/:type/:slug` | protected (AppLayout) | done — DB-generated slug mit `-<source_id>` Suffix bei Kollision |
| `/profile` | protected (AppLayout) | done — Identität (Avatar-Upload mit circular Crop-Dialog + Inline-Display-Name-Edit + @handle/E-Mail), Theme-Switcher, Account-Löschen (Danger-Zone). `src/lib/queries/profile.ts` + `EditableAvatar`/`AvatarCropDialog`/`EditableDisplayName`/`DeleteAccountSection`. Anzeigename ist app-weit das primäre Label (§Data-Layer) |
| `/calendar` | protected (AppLayout) | done — Wochen-/Monats-Grid + Tag-Pane Quick-Tick + Date-Picker |
| `*` | public | NotFound |

---

## Design-System

**Komplett aus Logbook gepfropft.** `src/index.css` enthält:

- **8 Themes × 2 Modes:** `default` (Standard japanisch-minimalistisch, Vermillion-Akzent), `teenaged` (Teenage Engineering), `sakura`, `totoro`, `biotech`, `maritime`, `onsen` (Teal/Koralle, komplementär), `vesper` (Violett/Amber, komplementär). Pro Theme nur die Core-Tokens; `--rule`/`--nav-*`/Shadows leiten sich global ab. Eine Akzentfarbe pro Theme (`--accent-secondary` war ungenutzt, Phase 8 entfernt).
- **Tokens:** `--bg`, `--surface`, `--text`, `--text-muted`, `--border` (hairline), `--rule` (heavier tier), `--accent`, `--accent-on`, `--nav-bg/fg` (inverted).
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
- `Tooltip` — dependency-free, JS-positioniert mit Viewport-Clamping (escapes overflow-hidden via `position: fixed`). Optional `content` (reiche Surface-Karte statt Mono-Chip) + `openDelay` (Hover-Verzögerung; Keyboard-Focus immer sofort) — beides für `UserChip`
- `UserChip` (`src/components/UserChip.tsx`) — Hover-Identitätskarte (Avatar + Anzeigename + @handle), gebaut auf `Tooltip` `content`. **Anti-Spoofing:** zwei Mitglieder können denselben Anzeigenamen tragen, der @handle ist eindeutig (DB-`UNIQUE`). Eingesetzt im Logbuch (Actor-Namen), Roster (andere Mitglieder), und das Mitseher-Overlay zeigt den @handle inline. Self/„Jemand" → schlichter Text (keine Karte). 300 ms Open-Delay. Datenlayer reicht den `@handle` getrennt vom kollabierten `name` durch (`home.ts` actorProfiles/Event-Typen, `sharing.ts` CoWatcher)
- `Pager` (`src/components/Pager.tsx`) — nummerierter Pager (Prev/Next-Chevrons + gefenstertes `1 … 7 8 9 … 43` mit Ellipsen), aktive Seite trägt die liquid Akzent-Bubble (`createLiquidBubble`). Rendert nichts bei einer Seite. Geteilt von Home-„Fortsetzen" (4/Seite, clientseitig) + Episodenliste (`EPISODE_PAGE_SIZE`-Fenster via `.range()`). Content-Swap hart, nur der Indikator liquid
- `createLiquidBubble` (`src/lib/liquid-bubble.ts`) — **die eine Quelle der Mercury-Morph-Bewegung** (WAAPI translateX+scaleX-Overlay, gestreckter Mid, `composite:add`, reduced-motion-aware). Geteilt von `Segmented` + `Pager` (BottomNav spiegelt dieselbe Rezeptur). Gibt das resting-`box`-Signal zurück; Consumer liefern Container-/Bubble-Refs + `track`-Accessor
- `Toaster` + `ToastProvider`/`useToast` (`src/lib/toast.tsx`) — dependency-free Toast-Layer (kein sonner). Top-right Stack (z-30, unter dem AddSheet-Backdrop z-40), slide-in von rechts + Auto-Dismiss-Fortschrittsbalken (`scaleX` origin-left) an der Unterkante; `leaving`-Set treibt Exits (Array bleibt referenz-stabil fürs `<For>`). In AppShell gemountet → überlebt Routenwechsel. `toast(msg, { icon, action, durationMs })`, Default 5 s.
- `SelectMenu` — styled Single-Select, click-outside + Escape close
- `ColumnGuide` — vertikale Trennlinie bei 2/3-Position (`position: fixed inset-y-0`), nur ab `md`. `left` per `min()`-Formel auf die 2/3-Grenze des gekappten Content-Frames (nicht des Viewports)
- `ContentFrame` — zwei vertikale Framing-Hairlines an den Content-Kanten (`position: fixed inset-y-0`, `left/right: max(0, (100vw − --content-max)/2)`). Flush an den Viewport-Kanten bei voller Breite, eingerückt als Rahmen bei Screens > `--content-max`. Global in AppShell gemountet
- `ThemeSwitcher` — Modus-Toggle + Theme-Grid; in Profil + Styleguide
- `Segmented` — liquid 2/3-Wege-Switch mit Stretch-and-Contract-Bubble (siehe §Gotchas → Liquid Bubble). Eingesetzt von `ListTrackingToggle`, `ThemeSwitcher`, Styleguide
- `NotFound` — geteilte Surface für nicht-existente Liste/Item. Ersetzt früheren silent `navigate("/lists")`-Bounce
- `Skeleton` (`src/components/Skeleton.tsx`) — Phase 8 Lade-Platzhalter: surface-getönter, hart-eckiger, `motion-safe:animate-pulse` Block. Per-Fläche zu formhaltenden Kompositionen zusammengesetzt (Listen-/Item-Rows, Was-kommt-Cards, Logbuch-Feed, Kalender-Grid, Profil-Avatar) → kein Layout-Shift beim Nachladen. Ersetzt alle „Lade …"-Texte.
- `fadeOnLoad` (`src/lib/image-fade.ts`) — Phase 8 Ref-Helfer für `<img>`: faded das Bild beim Decode ein (WAAPI, `fill: backwards`, kein Flash, kein zurückbleibender Transform → klobbert `transition-transform` der Hover-Cover nicht). An allen 7 Bild-Stellen. `prefers-reduced-motion` → sofort sichtbar.

**Layout-Shell:**

- `AppShell` — Parent-Route-Layout, mountet **einmal**. Hält AddSheet-State als Two-Signal-Split (`addMounted` für DOM-Lifetime, `addVisible` für Animation; siehe §Gotchas → Two-Signal-Pattern)
- `BottomNav` — Floating Pill, 5 Tabs. `+` sitzt CENTER, trägt `data-add-anchor` als Morph-Origin für AddSheet. Liquid Accent-Bubble. **Back-Button-Satellit** hängt auf Detail-Routen links neben der Pille (`absolute right-full ...`), trägt `data-accent` — Bubble flowt aus Pill in Satelliten und zurück. Pfeil-Opacity ist um 100 ms (`SETTLE_MS`) versetzt
- `NavButton` — setzt `data-accent=""` wenn aktiv (Bubble-Target)
- `AddSheet` — Search + Add-to-list, liquid morph aus der BottomNav. Card oben (page-tier) + Search-Pill unten (nav-tier capsule, morpht aus `[data-add-anchor]`). NavBar fadet sequential-handoff (nicht crossfade). Pre-selected Liste wenn aus `/lists/:id` geöffnet. 220 ms debounce + AbortController. Tap auf Result triggert `addItemToList`
- `MoveItemDialog` — Modal-List-Picker. Same Two-Signal-Pattern wie AddSheet. Lokaler `snap`-Signal hält Item-Title für die Lebensdauer eines Open-Cycles (siehe §Gotchas → Snap-Pattern)
- `ConfirmDialog` — **app-weiter** Bestätigungs-Modal (`{kicker, title, body, confirmLabel, pending, onConfirm, onClose}`). Ersetzt ALLE inline „Wirklich? ✓/✗"-Cluster (ResetItemButton, DeleteListButton, LeaveListButton, RowActions reset/remove, DeleteAccountSection, MembersModule ownership, SyncToggle). Two-Signal-Mount + Content-Snap fürs Schließen (wie MoveItemDialog). Primär-Button bleibt `accent` — destruktive Absicht trägt die Copy. Anti-Pattern-Karte im Styleguide entsprechend umgedreht (inline-confirm vermeiden → Dialog)
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

Jede Feature-Area ist `src/lib/queries/<area>.ts` mit derselben Struktur: typed Query-Keys + `*Options(...)`-Reads + Mutation-Funktionen. **Signaturen stehen im Source** (kurz reinschauen statt hier duplizieren) — hier nur die nicht-offensichtlichen Konventionen + eine Datei-Landkarte. Durable Fallen (Sync-Lanes, Cover-URLs, Bulk-Upsert, Discriminated-Union, Multi-Season) leben in **§Gotchas**.

**Query-Key-Konventionen (entscheidend fürs Invalidieren):**

- `lists.ts` keys sind nach `short_code` indexiert (URL-stabil), **nicht UUID**; Mutations filtern auf `lists.id`. Cross-cutting Writes invalidieren den `["list"]`-Prefix (deckt alle offenen shortCodes).
- `episodes.ts`: konkrete Keys sind `[...episodesQueryKey, limit]` + die Sync-Lane → Prefix-Invalidierung clear-t alle Paginations + beide Lanes auf einmal.
- `sharing.ts` keys sind **Prefixe** (`["list-members", listId]`, `["co-watchers", itemId]` …) damit Realtime ohne Mount-Zeit-id invalidieren kann.

**Datei-Landkarte:**

- `lists.ts` — Listen-CRUD, Pin/Reorder, per-row Item-Mutations (`removeListItem`/`moveListItem`), **„Neue Folge"-Badge-Engine** (`findItemsWithNewEpisodes`, 14-Tage-Fenster; anime/series → folgen, manga → kapitel; `ListSummary.newCounts` pro Liste, `ListEntry.hasNewEpisode` pro Item).
- `items.ts` — Item by natural key `(type, slug)` (Items effektiv public). `addItemToList` upsertet `items(source,source_id)` → Trigger setzt slug → `list_items`; liest `result.source` (nicht mehr hardcoded "anilist"); 23505 = schon drin → success.
- `episodes.ts` — Episoden-Read (resolve via `(type,slug)` + 12 h Stale-Gate + lazy fetch). Writes via `set_episode_watch` / `mark_episodes_watched_upto` / `reset_progress` — **alle lane-branchend** server-side (§Gotchas → Sync-Instanzen). Title-Enrichment: `TITLE_ENRICHMENT_VERSION` (bumpen = one-time backfill), `GAP_QUERY_LIMIT=5000`.
- `home.ts` — `continueWatchingOptions` (RPC `home_continue_watching`, Sync-Instanzen als eigene Einträge) / `upcomingEpisodesOptions` (Episoden 14-Tage **+ unreleased Filme & Spiele** via `fetchUpcomingDated`, `metadata->>releaseDate`, kein oberes Fenster) / `recentlyTickedOptions`. **`LogbookEvent` ist Discriminated Union über 4 kinds**: `watch` · `list_add` · `missed` (read-only Indikator, nur begonnene Items) · `ownership_transfer`. `ContinueItem.hasNewEpisode` = „while you were away" (≠ List-Badge 14-Tage-Fenster).
- `sharing.ts` — Membership, Invitations, per-item Sync, Co-Watchers. **App-weite Namensregel** (auch Logbuch/Roster): `display_name` ▸ `@handle` ▸ „Jemand"; self → „Du". `InviteResult = {ok} | {ok:false, error: empty|not_found|self|already_member}`.
- `status.ts` — episodenloser Binär-Status für Filme **& Spiele** (`item_history`, `completed` an/aus): `movieSeenOptions` (read) + `setItemSeen` (upsert/delete). Namen sagen „movie", sind aber item-id-generisch → von Film- und Spiel-Branch geteilt.
- `profile.ts` — Identität (Display-Name, Avatar-Upload, Theme), Account-Löschen.
- **Medienquellen** `anilist.ts` · `tmdb.ts` · `steam.ts` · `jikan.ts` · `mangadex.ts` hinter `search.ts` → `searchMedia(q, type)` (provider-agnostischer Boundary, routet **typ-gezielt**: anime/manga→AniList, series+movie→TMDB, **game→Steam**; kein fan-out). Alle fünf live. Quell-spezifische Fallen → §Gotchas → Multi-Source.

**Pattern für neue Feature-Area:** (1) neue `queries/<area>.ts` (keys + options + mutations); (2) RPC oder direkter Table-Access (RLS filtert, **kein** `user_id`-Filter); (3) `.select()` nach Mutations zum Detect von silent-RLS-blocks (Logbook-Lektion); (4) Optimistic: `onMutate` snapshot+patch / `onError` rollback / `onSuccess` confirm.

---

## Realtime

`src/lib/realtime.ts` exportiert `useRealtimeInvalidation(channelKey, [{table, invalidates}])`. Im Component-Mount wird ein Supabase-Channel aufgemacht, jeder postgres_changes-Event invalidiert die deklarierten Query-Keys. RLS scoped Events server-side, kein Client-Filter nötig.

**Verwendet in:**

- `/` home → channel `home`, listens to `episode_watches/episodes/list_items/list_members/list_ownership_transfers`, invalidates `homeQueryKey`-Prefix (transfers landen so live im Logbuch-Feed)
- `/lists` overview → channel `lists-overview`, listens to `lists/list_members/list_items/episodes/episode_watches/list_invitations`, invalidates `listsQueryKey` (+ `["invitations","mine"]` für die Inbox-Karten)
- `/lists/:shortCode` → channel `list-{shortCode}`, invalidates `listQueryKey(shortCode) + listsQueryKey + listItemsQueryKey(shortCode)`; Phase 7: `list_invitations`/`list_members` invalidieren auch die `["list-members"]`/`["list-invitations"]`-Prefixe (Roster + Pending live)
- `/item/:type/:slug` → channel `item-{type}-{slug}`, invalidates `episodesQueryKey(type, slug) + listsQueryKey + ["list"]`-Prefix + `["co-watchers"]` (Cross-Cutting: Partner-Ticks updaten Listen-Badges + Mitseher live)
- `/calendar` → channel `calendar`, `episode_watches` invalidiert `calendarQueryKey` + `["calendar","co-watchers"]`, `episodes` nur `calendarQueryKey`
- **BottomNav (global, mountet einmal)** → channel `global-invitations`, `list_invitations` invalidiert `["invitations","mine"]` → das Listen-Tab-Badge tickt von jeder Route aus live

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
| **6 · Kalender** | ✓ done — Wochen-/Monats-Grid, Tag-Pane Quick-Tick + Long-Press-Cascade, Date-Picker, Mitseher-Marker (Phase 7), dynamisches anker-zentriertes Range-Read |
| **7 · Sharing** | ✓ done — Invite-by-@handle, Mitglieder-Modul, Einladungs-Inbox + Nav-Badge, Sync-Toggle mit Backfill, Auto-Sync-Fan-out, Mitseher-Indikator, Ownership-Transfer, Leave-List |
| **7-Reste** | ✓ done (in `main`) — Logbuch-Welle-2 (`missed`, nur begonnene Items, + `ownership_transfer`), Co-Member-Avatare im Feed, Toast-System (`toast.tsx` + `Toaster`) + Trigger, ErrorBoundary, `MovePointerSensor` |
| **8 · Polish** | ✓ done — Cover/Avatar-Fade-in (`fadeOnLoad`), Skeleton-States (`Skeleton`), Theme-Switch-Crossfade (`@layer base`). Route-Transitions bewusst verworfen (Tab-Tool cuttet hart, Apple-Linse) |
| **9 · PWA + Hosting** | teilweise — Manifest in `vite.config.ts`, Deploy ausstehend |
| **Sync-Instanzen** | ✓ **in `main`** (gemerged). Fortschritt global pro User bis Sync → Instanz ab 0; Reads/Writes lane-branchen (global `IS NULL` / Instanz `= LI`); Un-Sync = Union-Merge zurück ins Globale. List-scoped Item-Route `/lists/:shortCode/item/:type/:slug` (reload-fest). Kalender + Logbuch **read-only** (keine Ticks/Links — ersetzt Phase-6-Quick-Ticks). **Mitseher-Auge nur in geteilten Listen** (Mitglieder *dieser* Liste). **Reset in synced Liste fächert für alle** (Migration `20260531160000`). `is_shared`-Reconcile (Liste wird wieder privat). „Fortsetzen" zeigt aktive Instanzen als eigene Einträge (Listenname-Label). |
| **Politur-Session** | ✓ **in `main`** (`chore/misc-tweaks` gemerged) — theme-folgendes Favicon, **liquid Navbar-Bubble** (Transform-Morph translateX+scaleX, snappy Bell-Easing, kein Settle-Stopp) + Back-Satellit-Recoil (WAAPI one-shot, `composite:"add"`), `Segmented` teilt denselben Morph (Form bleibt eckig — liquid lebt in der Bewegung), **Sync-Flip als Modal-`SyncConfirmDialog`** (statt Inline-Confirm), „Was kommt"-Cards Overshoot-Spring, Hover-Layer an der Column-Guide (Logbuch + Kalender-Tag-Pane), Kalender-Episodennummer entakzentuiert. |
| **Thema 1a · Serien (TMDB)** | ✓ **in `main`** — 2. Quelle TMDB (`tmdb.ts`, browser-side, `VITE_TMDB_TOKEN`), quellen-agnostische Suche (`search.ts` + Medientyp-Filter im AddSheet), echte Staffeln + Staffel-Gliederung, Continue-Watching staffel-bewusst (Migr. `20260531180000`), date-only Air-Dates ohne erfundene Zeit, Badge episoden-gezählt + tracking-gated. |
| **Thema 1b · Filme (TMDB)** | ✓ **in `main`** — Film-Suche (`searchTmdbMovies`), Film-Filter im AddSheet. Filme sind **folgenlos** → binärer Gesehen-Status in `item_history` (`status='completed'` an/aus, `queries/status.ts`), **keine** items/CHECK-Migration. **Eigene Film-Detailseite** (Movie-Branch in `ItemDetail`, kein Episoden-Listing): links Gesehen-Toggle (Episoden-Tick-Optik) + Release-Datum mit Heute/Morgen/Demnächst-Tag (≤14 Tage) + Tagline + Beschreibung + Besetzung (Foto-Streifen, auto-fit-Grid); rechts „Details" mit Regie/Laufzeit/Genres/**Kinostart-Datum**/FSK/Quelle. Film-Infos **live aus TMDB** (`fetchTmdbMovieDetails`, kein DB-Store), **deutscher** Release (`release_dates`, Kino bevorzugt). **Mitseher-Auge** in geteilten Listen über `item_history`-Co-Member-RLS (Migr. `20260531200000`). **Unreleased Filme in „Was kommt"** nach DE-Release (`items.metadata.releaseDate`, beim Add gestempelt + auf der Detailseite per `setItemReleaseDate` nachgezogen), **kein** oberes Fenster. |
| **Thema 1c · Spiele (Steam)** | ✓ **in `main`** — 3. Quelle Steam (`steam.ts`). Store-Endpoints sind **CORS-geblockt** → Proxy: dev über Vite (`/steam-store`, `vite.config.ts`), Prod über **Edge Function** (`supabase/functions/steam-proxy`, Deploy erst Phase 9). `searchSteamGames` (storesearch) + `fetchSteamGameDetails` (appdetails). `items.source`-CHECK um `'steam'` erweitert (Migr. `20260531210000`). Spiele **folgenlos** → binärer **„Gespielt"**-Status (teilt `status.ts` + `BinaryStatusRow` mit Filmen). **Eigene Spiel-Detailseite** (Game-Branch in `ItemDetail`): links Gespielt-Toggle (unten) + **Screenshot-Galerie** (`ScreenshotGallery`: Hero + Thumbnail-Strip mit Pfeilen) + Beschreibung; rechts „Details" mit Entwickler/Publisher/Genres/Release/Metacritic. Cover = 616px Steam-Capsule, **typ-bewusst adaptiv** (Querformat füllt Spalte, Hochkant höhenbegrenzt). **Unreleased Spiele in „Was kommt"** (`fetchUpcomingDated`). Fuzzy-Release-Daten → §Offene Punkte. |
| **Detailseiten-Politur + ConfirmDialog** | ✓ **in `main`** — Release-Datum auch als Fact rechts (`releaseLabel`, „Kinostart"/„Erschienen"); mobil Details/Cover-Section vor Episoden/Film, Bento-Nummern springen mit (`BentoModule.mobileNumber`). **Alle Confirms → einheitlicher `ConfirmDialog`** (Modal, ersetzt inline „Wirklich? ✓/✗" an 6 Stellen + `SyncToggle`; `SyncConfirmDialog` gelöscht). |
| **Layout — Content-Frame** | ✓ **in `main`** — `--content-max` = feste **1728px** (höhenunabhängig); bis dahin volle Breite, darüber Gutter. **`ContentFrame`** (zwei vertikale Framing-Hairlines an den Content-Kanten, fixed, full-height) macht den Gutter gewollt. PageHeader-Bottom-Rule als **100vw-Breakout** (full-bleed trotz Cap), `body { overflow-x: clip }`. `.scrollbar-none`-Utility (Galerie-Strip). |

---

## Offene Punkte

### Jetzt — Git / Merge

1. ~~`chore/misc-tweaks` → `main` mergen~~ — **erledigt.** Politur-Session ist in `main` (`main` == `0fb8e17`, Diff zum Branch leer). Build grün, Tree clean, Migration `20260531160000` gefahren (User-bestätigt).
2. **`origin`-Push-Strategie klären.** Lokales `main` ist `origin/main` ~190 Commits voraus (sync-instances + Politur + Medien-Themen 1a-c + Layout nie gepusht). Outward-facing — nur auf explizite Zustimmung.

### Diese Session erledigt (in `main`)

- **Login-Redesign** (Branch `feat/login`, gemerged): Discord-Hero (inline Brand-Glyph), Magic-Link hinter „Kein Discord-Konto?"-Disclosure, expliziter `email`-Scope. **Auth-Modell verifiziert:** Discord primär, Magic-Link an dieselbe Discord-Mail → Recovery in *denselben* Account (Supabase Same-Email-Linking). Theme-Default für First-Timer = Standard+System (bereits so). E-Mail-Prod-Voraussetzung (Resend-Domain verifizieren) → §Geplant.
- **`UserChip`** (Branch `feat/user-chip`, gemerged): Hover-Identitätskarte (Avatar + Anzeigename + @handle) gegen Identitäts-Spoofing in Logbuch/Roster/Mitseher. `Tooltip` um `content`+`openDelay` erweitert; Datenlayer reicht den @handle getrennt durch. Roster vereinheitlicht (self = „Name · du", andere = UserChip).
- **Thema 3 · First-Login-Setup** (Branch `feat/onboarding`, gemerged): `/setup`-Wizard (Identität → Avatar → Theme, Slide+Bounce), nur solange `profiles.onboarded_at` null (AppLayout-`OnboardingGate`). Handle wählbar mit Live-Verfügbarkeitscheck (`username_available`-RPC + `setUsername`). **Migration `20260601100000`** (onboarded_at + Backfill bestehender User + RPC). Setup nutzt Inline-Fehler (kein `useToast` außerhalb der AppShell).
- **Privacy-Fix + Voll-Audit** (Branch `fix/episode-watches-privacy`, gemerged): **echtes RLS-Leck** — `episode_watches_select_co` band die globale Lane an `is_co_member(episode_id, viewer)` (prüft nur, ob der *Betrachter* das Item trackt, NICHT den Watcher) → jeder sah fremde globale Watch-Historie. Fix: globale Lane auf `shares_list_with(user_id, auth.uid())` (Migr. `20260601110000`). Danach **alle Lese-Pfade auditiert**: jede cross-user SELECT-Policy + jeder DEFINER-RPC mit Daten-Rückgabe (`get_my_invitations`/`get_list_invitations`/`continue_watching`/`home_continue_watching`/`item_progress`/`list_item_progress`) → **alle korrekt self-scoped**, kein weiteres Leck.
- **Health-Audit (2026-06-01) + Fixes** (Branch `fix/audit-findings`, gemerged): adversariales Multi-Agent-Review (23 Agenten, 16 Roh → 12 bestätigt, 4 Fehlalarm; Urteil: solide, kein kritisches/aktiver Datenverlust/Privacy-Leck). 10 gefixt, 1 übersprungen (Logbook-Constraint — Logbook raus). Standout: **`addItemToList` stempelt jetzt `added_by_user_id`** (war NULL → Logbuch-„hinzugefügt"-Events erschienen nie). Außerdem: staffel-bewusster Cascade-Optimistic, Episode-Tick invalidiert Home+Kalender, Release-Backfill pro Item-ID, TMDB-Datum-Guard, Jikan/MangaDex-Retry-Gate, Drag-Rollback, AddSheet-pending-Set, Privacy-Boundary-Marker. **Voll dokumentiert in HEALTH.md → Bundle 8** (Findings AUD-1..11).
- **Thema 2 · Paging** (Branch `feat/paging`, gemerged): „Weitere laden"-Append → **nummerierter Pager** (neue `Pager`-Komponente, gefenstert mit Ellipsen, ~43 Seiten für One Piece). (a) **Fortsetzen** (Home) blättert 4er-weise statt aufzuklappen (clientseitig). (b) **Episodenliste**: `episodesQueryOptions` `limit`-Wachstum → festes `EPISODE_PAGE_SIZE`-Fenster via `.range()`. **Liquid Indikator:** aktive Seite trägt die Akzent-Bubble mit dem Tab-Switcher-Morph — extrahiert in **`src/lib/liquid-bubble.ts` (`createLiquidBubble`)**, das jetzt Pager **und** `Segmented` teilen (eine Quelle der Bewegung). Content-Swap bleibt hart (Motion-Philosophie). HEALTH **A5**-Round-Trip-Reduktion bewusst aufgeschoben (würde Item-Resolve serialisieren).
- **Detailseiten-Politur** (`ItemDetail`): Release-Datum auch als Fact rechts (`releaseLabel` wieder da, „Kinostart"/„Erschienen", volles Datum m. Jahr) · mobil Details/Cover-Section vor Episoden/Film mit mitspringenden Bento-Nummern (`BentoModule` um `mobileNumber`-Prop erweitert).
- **Confirms global → `ConfirmDialog`** (Modal statt inline „Wirklich? ✓/✗"). Alle 6 Stellen + `SyncToggle` darauf umgestellt, `SyncConfirmDialog` gelöscht (§Gotchas → ConfirmDialog).
- **Thema 1c (Spiele/Steam)** durch — §Status-Zeile *Thema 1c* + §Gotchas → Multi-Source.
- **Layout**: Content-Cap als feste px-Breite (1728px) statt Aspekt-Experiment, `ContentFrame` (vertikale Framing-Hairlines an den Content-Kanten), PageHeader-Rule als 100vw-Breakout (full-bleed trotz Cap), `body { overflow-x: clip }` (§Gotchas → Layout/Content-Frame).
- **„Was kommt"-Designfrage geklärt:** **kein** oberes Fenster (Filme + Spiele) — das nächste Datum gewinnt, egal wie weit weg.

### Nächste Session — Thema 4 (vom User priorisiert; vor Umsetzung Detail-Design + bei Schema/Screens fragen)

*(Thema 2 · Paging und Thema 3 · First-Login-Setup sind erledigt → §Diese Session erledigt.)*

1. **Onboarding-Tooltips.** Geführte Einführung über die `Tooltip`-Primitive, **nur beim ersten Login**, **überspringbar**. Teilt die First-Login-Erkennung mit dem First-Login-Setup (gemeinsames `onboarded_at`-Flag — oder eigenes „tips_seen"-Flag, Detail klären). Reihenfolge/Skip-State persistieren.

### Geplant, nicht akut

- **Phase 9 — Deploy/Hosting.** PWA-Manifest steht in `vite.config.ts`; DB-Verifikation (Logbook-Migrationen gegen Live-DB abgleichen + als Nakama-Migrationen tracken). **Steam-Edge-Function deployen** (`supabase/functions/steam-proxy`, `npx supabase functions deploy steam-proxy` — dev läuft über den Vite-Proxy, Prod braucht die Function). Nach den Themen 3-4.
- **E-Mail-Prod-Voraussetzung (Auth).** Magic-Link-Fallback + Confirm-Email brauchen vor echten Nutzern eine **verifizierte Resend-Domain** (sonst sendet Resend nur an die eigene Konto-Adresse → derzeit zum Testen deaktiviert, Fallback auf Supabase-Mailer mit ~4 Mails/Std-Cap). Discord-`email`-Scope ist im Code gesetzt; Same-Email-Linking (Discord-Mail ↔ Magic-Link) ist verifiziert. Vor Launch: Resend-Domain verifizieren + „Confirm email" an.
- **Status-Control für Movies/Games** (`item_history`-Table) — jetzt Teil von Thema 1b/1c (Filme/Spiele).
- **Newest-Episode-Title-Lag.** Jikan/MAL + AniList `streamingEpisodes` hinken 1-3 Wochen hinter Air-Date; UI zeigt „Name der Folge ist noch nicht bekannt"-Fallback bis zum nächsten 12 h Stale-Refresh. Quellen-Issue.
- **Manga-Kapitel-Titel.** MangaDex-Coverage patchy für lizenzierte Serien (One Piece ~6 EN-Titel insgesamt). Best-effort akzeptiert.
- **Long-anime PostgREST-Cap.** `GAP_QUERY_LIMIT=5000`; bei 5000+ Folgen (extrem selten) fehlt das letzte Drittel.

### Bekannte tech-debt

- **Pre-Launch-Härtung (aus Privacy-Audit 2026-06-01, KEINE Lecks — Integrität/Rechte):** (1) `items` + `episodes` sind welt-schreibbar (`INSERT/UPDATE using true`) — jeder eingeloggte User kann Katalog-Daten ändern. (2) `list_members`-DELETE + `lists`-UPDATE erlauben *jedem Mitglied* andere (Nicht-Owner) zu entfernen bzw. die Liste umzubenennen (equal-members-Modell — bewusst?). (3) redundante doppelte SELECT-Policies auf `item_history` + `profiles` (alte own-only neben co-member, OR-verknüpft → harmlos, aufräumbar). Alles vor „echtem" Launch entscheiden/eindämmen.
- **AddSheet Such-Pill Content-Fade beim Schließen** läuft 300 ms over ease-out, fadet Input + Icon während die Pill noch morpht. Bei sehr schnellen Aktionen sichtbar.
- **`/item/:type/:slug` ohne Listen-Kontext.** Sync-Toggle kriegt `listItemId` via Router-Link-State von der Listen-Row. Offen: Back-Button auf Deep-Links (kein State → `history.back()`/Fallback `/lists`); Home/Kalender/Suche-Einstiege bleiben bewusst kontextfrei (kein Sync-Toggle dort).
- **NotFound-Backlink** verlinkt pauschal `/lists`; Deep-Link auf falsche shortCode landet auf Overview statt voriger Liste.
- **Listen-Row/Was-kommt-Cover-Slots** sind quadratisch + `object-cover` → Spiel-Header (Querformat) werden dort beschnitten. Nur die Detailseite ist adaptiv. Bewusst zurückgestellt.
- **Steam-Release-Datum unscharf.** `parseSteamDate` (steam.ts) parst nur das exakte deutsche „DD. Mon. YYYY"-Format; fuzzy („Q2 2025", „Demnächst") → kein ISO → Spiel erscheint NICHT in „Was kommt" (zeigt aber den Rohstring in den Facts). Quellen-Issue.
- **Spiel-Release-Datum nur per Detailseiten-Besuch.** Steam-Suche liefert kein Datum → `items.metadata.releaseDate` wird (wie bei Filmen) erst beim Öffnen der Detailseite aus `appdetails` nachgezogen. Ein nie geöffnetes Spiel fehlt bis dahin in „Was kommt".

---

## Workflow-Notizen (User)

Vollständig in `CLAUDE.md`. Operativ wichtig: **Dev** `npm run dev` (Port 5173, bei Bedarf `npx kill-port 5173 && npm run dev`). **Git** atomar pflegen, lowercase Conventional (`feat(area): …`, `fix(ui): …`, `chore: …`). **Vor** Schema-Änderungen + neuen Screens fragen, bei Design-Richtungswechseln kurz skizzieren. Zeigen schlägt erklären — Iteration im Dev-Server, nicht in Mockups. Visuell: material/tactile + japanisch-minimalistisch + TE, flache uniforme Card-Grids vermeiden.

---

## Gotchas

### Solid / Router / Reactivity

- **Solid ≠ React.** `class` statt `className`, refs via direkte Variablen-Zuweisung (`ref={myEl!}`), keine Re-Renders sondern fine-grained Reactivity, `createEffect` statt `useEffect`, `createSignal` statt `useState`.
- **JSX-Attribute spread funktioniert anders als in React.** `{...(cond ? {attr: ""} : {})}` produziert inkonsistenten Output bei data-Attributen. Stattdessen direkt: `data-attr={cond ? "" : undefined}`.
- **Solid Router params** sind `Partial<Record<string, string>>`. Bei `:id` segment ist value zur Laufzeit garantiert, aber TypeScript braucht non-null-assertion oder explizites Typing: `useParams<{ id: string }>()`.
- **Layout-Persistenz braucht Parent-Routes.** Wenn ein Layout-Wrapper über Routenwechsel mounted bleiben soll, MUSS er als Parent-Route mit Pages als `children`-Array deklariert sein. Per-Page-Import des Wrappers → Re-Mount pro Navigation.
- **`on()` vs plain `createEffect`:** `on(deps, fn)` DEFERRED den ersten Run per default. Plain `createEffect` fires on initial setup AND on dep changes.
- **Show-Wrapper + Transitions:** Wenn `<Show>` ein animiertes Element umhüllt, kann beim Wechsel von falsy → truthy → falsy das Element unmount → remount, was Transitions zerschießt. Lösung: Always-render mit opacity gating. Ausnahme: wenn das Element von einem gemessenen Wert abhängt (z.B. AddSheet `origin()`), `<Show when={origin()}>` damit das erste Render schon korrekte Werte hat.
- **`<For>` remountet bei Objekt-Identitätswechsel — Hover-/CSS-State-Flicker.** `<For>` keyt nach Objekt-Referenz. Optimistic-Updates (`setQueryData(key, old => old.map(e => match ? {...e, x} : e))`) erzeugen für den getroffenen Eintrag eine NEUE Referenz → `<For>` disposed die alte Row und mountet eine frische. Die frisch eingefügte DOM-Row verliert für einen Frame ihren `:hover`-Zustand → sichtbares Flackern. Bei einem optimistic-patch + settle-refetch passiert das ZWEIMAL (zwei neue Arrays). Lösung für Listen deren Items sich in-place ändern (statt umsortiert/added/removed werden): `<Index each={...}>{(ev) => <Row ev={ev()} .../>}</Index>` — Index keyt nach Position, die Row bleibt gemountet, nur `props.ev` (als reaktiver Getter) aktualisiert sich. Referenz: Calendar Tag-Pane `DayPaneRow`. Achtung: Index NUR wenn die Listenlänge/-reihenfolge stabil ist; für Drag-Reorder etc. bleibt `<For>` korrekt.

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
- **Motion-Philosophie (Apple-Linse, Phase 8).** Nakama ist ein *Tool*, keine Landingpage: Motion ist **funktional**, nicht dekorativ — sie erklärt Zustandsänderungen (Bubble-Morph, Pin-Resort, Toast), wahrt räumliche Kontinuität (AddSheet morpht aus dem `+`), oder versteckt Lade-/Decode-Ruckeln (Cover-Fade, Skeletons). **Kein Entrance-Choreo auf Content** (gestaffelte Page-/Element-Einblendungen wurden gebaut und wieder verworfen — lasen sich „aufgeführt"/laggy). **Route-Transitions sind bewusst hart** (Tab-Tool wie iOS-Tabbar — nicht erneut animieren).
- **Theme-Switch-Crossfade braucht `@layer base`, NICHT unlayered.** Die `theme-transition`-Regel (faded alle Farben beim Theme-Wechsel) muss in einem Cascade-Layer *unter* Tailwinds `utilities` liegen. **Cascade Layers schlagen Spezifität:** eine *unlayered* Regel (auch mit `:where()`/Spezifität 0) überschreibt JEDE `@layer utilities`-Utility — also auch `transition-all` der Liquid-Bubble → die Bubble springt statt zu stretchen, aber nur während des Theme-Fensters (heimtückisch: Kalender-Segmented heil, Theme-Segmented kaputt). In `@layer base` gewinnt jede eigene Transition-Utility, nur statische Flächen kriegen den Farb-Crossfade. `applyTheme` toggelt die Klasse 300 ms + forced reflow (`void root.offsetHeight`) damit der Fade zuverlässig feuert; reduced-motion überspringt.

### Daten / RLS

- **PostgREST 1000-Row-Cap** auf SELECT ohne explizites `.limit()`. Bei langlaufenden Shows explizit `.limit(5000)` setzen (siehe `GAP_QUERY_LIMIT`). Hatten silent-truncate auf den neuesten ~100 Folgen, weil das Bulk-Upsert deren Titel gar nicht erst in der Gap-Liste hatte.
- **Bulk Upsert ist immer schneller als per-row UPDATE-Loop.** 1100+ Rows: ~5 s vs ~110 s. Per-row → tab tot, kein Update committed. Pattern: `storeEpisodes`, `enrichJikanTitles`, `enrichMangaDexTitles`.
- **Cross-Cutting Cache-Fan-out:** jede Mutation die `itemCount` oder Title/Watch-Beziehung ändert, MUSS `listsQueryKey` + `["list"]`-Prefix invalidieren. Episode-Mutations zusätzlich `episodesQueryKey`. Episode-Realtime in `/item` invalidiert auch List-Keys, sonst updaten Partner-Ticks die Badges auf nicht-gemounteten /lists-Seiten nicht.
- **TITLE_ENRICHMENT_VERSION Pattern für one-time backfill.** Items.metadata trägt Version-Zahl; bei Logic-Change bumpen → alle Items kriegen einmaligen Retry beim nächsten Visit, unabhängig vom 12 h Stale-Gate. Beispiel: v2 hatte per-row-UPDATE-Loop der für lange Anime crashte, v3 bumpt + bulk-upsert.
- **AniList Cover-URL-Naming-Falle:** API-Feld `coverImage.large` liefert `/cover/medium/` URL (~230 px), nicht `/cover/large/` (~430 px). Letzteres im API-Feld `extraLarge`. Search holt extraLarge, `highResCover()` schwenkt Legacy-DB-URLs render-time um.
- **Discriminated Union für Logbuch-Events.** `LogbookEvent = WatchBundle | ListAddEvent` mit `kind` als Discriminator. Solid's `<Show>` narrowed nicht; im JSX `{ev.kind === "watch" ? <WatchSentence ev={ev}/> : <ListAddSentence ev={ev}/>}` damit TypeScript narrowed.
- **Optimistic Writes ohne `.select()` lügen** wenn RLS still blockt (0 rows, kein Error). Pattern: nach `update` zurück selektieren, wenn 0 → `error: "blocked"` rollback.
- **Cross-User-RLS MUSS an den Zeilen-Eigentümer binden, nicht an den Item-Zugang des Betrachters.** Ein Leck (gefixt `20260601110000`): `episode_watches_select_co` band die globale Lane an `is_co_member(episode_id, auth.uid())` — das prüft nur „trackt der *Betrachter* dieses Item", referenziert den Watcher (`user_id` der Zeile) gar nicht → jeder, der dasselbe Item in irgendeiner Liste hatte, sah **fremde globale Watch-Historie**. Korrekt: `shares_list_with(user_id, auth.uid())` (bindet an den Watcher), wie `profiles_select_co_member`/`item_history_select_co`. **Regel:** jede „sieht A die Daten von B"-Policy muss `shares_list_with(<owner_col>, auth.uid())` o.ä. nutzen — ein Helfer, der nur den Betrachter + ein geteiltes Objekt prüft (ohne den Eigentümer), leckt. **Privacy-Audit 2026-06-01:** alle Lese-Policies + DEFINER-RPCs mit Daten-Rückgabe danach geprüft → sauber (Details → §Diese Session erledigt).
- **DEFINER-RPCs umgehen RLS — sie MÜSSEN selbst auf `auth.uid()` scopen.** Jede `security definer`-Funktion, die Zeilen zurückgibt, filtert explizit (`where user_id = auth.uid()` / `is_list_member(...)`). Geprüft: `get_my_invitations`, `get_list_invitations`, `continue_watching`, `home_continue_watching`, `item_progress`, `list_item_progress` — alle korrekt. `home_watch_bundles`/`home_new_releases` sind bewusst `invoker` (lehnen auf RLS).
- **Migrationen** fährt der User manuell im Supabase SQL-Editor. Bei neuer Migration im Chat ankündigen + den SQL liefern (Falle: der User kopiert leicht den Erklärtext mit — SQL klar abgrenzen). Seit 2026-05-29 in `supabase/migrations/` getrackt: Phase-3-5-Catch-up `20260528200000`, Home-RPCs `20260529120000`, Pin-RPCs `20260529130000`, Auto-Sync-Cascade `20260530120000`, Realtime-Sharing-Tables `20260530140000`, Avatar-Storage `20260530150000`, delete_account `20260530160000`, invitation_names_prefer_display `20260530170000` (**Status prüfen — war zuvor offen**), **Sync-Instanzen `20260531100000` (gefahren), home_sync_instances `20260531120000` (gefahren), unshare_when_solo `20260531140000` (gefahren), reset_progress_fanout `20260531160000` (gefahren — synced Reset fächert für alle Mitglieder), continue_watching_seasons `20260531180000` (gefahren), item_history_co_member `20260531200000` (gefahren — `item_history_select_co` via `shares_list_with` für das Film-Mitseher-Auge + item_history in die supabase_realtime publication)**, **items_source_steam `20260531210000` (gefahren — `'steam'` in den `items.source`-CHECK für Thema 1c)**, **onboarding `20260601100000` (gefahren — `profiles.onboarded_at` + Backfill + `username_available`-RPC für Thema 3)**, **fix_episode_watches_global_privacy `20260601110000` (gefahren — globale-Lane-RLS auf `shares_list_with(user_id,…)` statt `is_co_member`, schließt Cross-User-Leck)** = 17 Files. Logbook-Era-Schema lebt weiter in dessen Repo; eine frische Nakama-DB = Logbook-Migrationen zuerst, dann Nakamas Files in Timestamp-Reihenfolge.

- **Sync-Instanzen (durable Modell).** Fortschritt ist **global pro User** (`episode_watches.list_item_id IS NULL`), BIS ein `list_item` gesynct wird (`sync_enabled=true`) → eigene **Instanz** (`list_item_id = LI`), startet bei 0. **Jede `episode_watches`-Leseabfrage MUSS die Lane filtern** — global `.is("list_item_id", null)` oder Instanz `.eq("list_item_id", LI)`; ohne den expliziten `IS NULL` lecken Instanz-Zeilen in globale Flächen, sobald Instanzen existieren. Writes laufen über `set_episode_watch` / `mark_episodes_watched_upto` / `reset_progress` mit optionalem `_list_item_id` — der RPC branchet server-side (null/nicht-gesynct → global, kein Fan-out; gesynct → Instanz + Fan-out an Mitglieder). Un-Sync = `unsync_item` (Union der Instanz ins Globale jedes Mitglieds, dann Instanz löschen). Die alten `*_synced`/`reset_item_progress`/`backfill_*` RPCs bleiben für Logbook unberührt. Item-Seite: globale Route `/item/...` vs. list-scoped `/lists/:shortCode/item/...`; `instanceLI = syncEnabled ? listItemId : null`; `laneReady`-Gate verhindert kurzes Anzeigen der falschen Lane.

- **`location.state` (Solid Router) überlebt einen Hard Reload** — es liegt auf `history.state`. Ein dort abgelegter Snapshot (z.B. `syncEnabled` als Pre-Load-Hint) kann also **veraltet** sein; eine Live-Query (syncCtx) muss via `liveValue ?? stateHint` Vorrang haben, NICHT `stateHint ?? liveValue` (sonst gewinnt ein stale `false` auch nach Reload).

- **Mitseher-Auge = Shared-List-only + Privacy.** `coWatchersOptions` ist auf EINE Liste scoped (`listMemberIdsOf`, nicht „alle Co-Member") und wird nur gemountet, wenn das Item über eine **geteilte** Liste geöffnet ist (`isShared` + `listId`). Private Liste / globale Item-Seite / Kalender → **kein Auge** (ein privater Tracker darf den Stand anderer nie verraten). Lane-matched wie die Episode-Reads.

- **Logbuch + Kalender sind reine read-only Indikatoren.** Keine Ticks, keine Verlinkungen — getickt wird nur auf der Item-Seite (wo die Lane eindeutig ist). Logbuch-Sätze sind statischer Text (kein `<A>`), `missed` ohne „Abhaken"-Button; Kalender-Tag-Pane ohne Link + ohne Mitseher-Auge (nur eigener Punkt).

- **Auto-Sync-RPCs statt Listen-Kontext (Phase 7).** Die geteilte Live-DB trägt `toggle_episode_synced(_item_id, _episode_id, _watched)` als *Auto-Sync*-Variante (Logbook `20260528180000`): sie fächert über ALLE Sync-ON-Listen mit dem Item auf, kein `list_item.id` im Call. Der Cascade hatte kein Auto-Sync-Twin — `mark_episodes_watched` fächert nur für ein explizit übergebenes `_list_item_id`. Nakamas Item-Page/Kalender sind kontextfrei, daher Migration `20260530120000`: neuer `mark_episodes_watched_synced(_item_id, _up_to_episode_id)` (Twin) + sicherheitshalber Re-Assert von `toggle_episode_synced` in der Auto-Sync-Form (drop+create, falls die geteilte DB noch die alte Signatur trug). **Falle:** named-param RPC-Calls brechen, wenn die Live-Funktion andere Parameter-NAMEN bei gleichen Typen hat — `create or replace` kann Param-Namen nicht ändern, es braucht `drop function` zuerst.

### Multi-Source (TMDB-Serien/Filme, Steam-Spiele)

- **`items.type`/`source` CHECK-Constraints (Logbook-Core-Schema `20260527102000`).** `type in ('anime','manga','series','movie','game','music')` — alle erlaubt. `source` war `('anilist','tmdb','tvmaze','igdb','manual')`; **`'steam'` per Migration `20260531210000` ergänzt** (Thema 1c). `item_history.status in ('watching','completed','dropped')` — **kein `'planned'`**; Film+Spiel nutzen nur `completed` (binär).
- **TMDB = browser-side (CORS ok), Steam = NICHT.** TMDB setzt CORS-Header → direkter `fetch` wie AniList. Steam-Store-Endpoints blocken CORS hart → **Proxy**: dev über Vite (`server.proxy` `/steam-store` → `store.steampowered.com`, `vite.config.ts`), Prod über Edge Function (`supabase/functions/steam-proxy`, noch nicht deployed). `steam.ts → steamApiUrl` schaltet per `import.meta.env.DEV`. „SteamDB.info" ist Cloudflare-geschützt + ohne API → unbrauchbar; Steams *eigene* Store-Endpoints sind die Quelle.
- **Steam-Bild-Fallen.** Cover = `capsule_616x353.jpg` (616px, scharf genug für die volle Detail-Spalte); `header.jpg` (460px) würde dort blurren UND **301-redirected** auf dem cloudflare-Host. `steamHiResCover()` swappt alte `/header.jpg`-URLs render-time auf das Capsule (wie `highResCover` für AniList). Screenshot-`path_full` (1920px) fürs Hero, `path_thumbnail` (600px) für den Strip.
- **Steam-Release-Datum ist nur ein lokalisierter STRING** (`release_date.date`, z.B. „10. Okt. 2007"), kein strukturiertes Feld. `parseSteamDate` (steam.ts) parst nur das exakte deutsche „DD. Mon. YYYY" → ISO; fuzzy („Q2 2025", „Demnächst") → null. Storesearch liefert **gar kein** Datum → `metadata.releaseDate` wird erst beim Detailseiten-Besuch via `appdetails` nachgezogen (wie bei Filmen). Folge: ein nie geöffnetes / fuzzy-datiertes Spiel fehlt in „Was kommt".
- **Multi-Season-Episodenmodell.** TMDB-Serien haben echte Staffeln; `episode_number` springt pro Staffel zurück (S2E1). Die `episodes`-Unique ist `(item_id, season_number, episode_number)` → kein Konflikt. **Jede „nächste Folge"/„Fortschritt"-Logik MUSS nach `(season_number, episode_number)` ordnen, nie nur `episode_number`** — sonst kollabieren die Staffeln (war der `home_continue_watching`-Bug: `min(episode_number)` über alle Staffeln → Müll; gefixt via `distinct on … order by season, episode` + `next_season` im RPC, Migration `20260531180000`). Ebenso: Episodentitel-Lookups auf `(item, season, episode)` keyen, nicht nur `episode_number` (sonst falscher Staffel-Titel). AniList ist immer Staffel 1, daher fiel das vorher nie auf.
- **Date-only Air-Dates (TMDB) ⇒ keine Uhrzeit zeigen.** TMDB liefert für Folgen nur ein DATUM (kein Time), gespeichert als UTC-Mitternacht. In lokaler +TZ rendert das als erfundenes „02:00". `airDateHasClock(type)` (format.ts) = nur `anime` (AniList `airingAt` ist präzise); series sind date-only → Zeit unterdrückt (gated in ItemDetail-Tag, Home `DayTag`, Kalender-Tag-Pane: `hasAirTime(iso) && airDateHasClock(type)`). **Der Tag selbst ist TMDBs Ursprungs-Datum (US)** und kann von der regionalen (DE-)Veröffentlichung um 1 Tag abweichen — aus `air_date` nicht ableitbar. Latente Tag-Verschiebung nur für Nutzer **westlich** von UTC (UTC-Mitternacht-Parse); für DE-Nutzer stimmt der Tag. Falls je international: date-only via UTC-Komponenten interpretieren.
- **„Neue Folge(n)"-Badge zählt Episoden, nicht Items, + nur bei Tracking.** `findItemsWithNewEpisodes` (lists.ts) gibt `Map<listItemId, count>` (released-ungesehen in 14 Tagen); `aggregateNewCounts` summiert Episoden → Plural korrekt bei Same-Day-Batch-Release auf EINEM Item. Labels (`newCountLabel`, `newEpisodeLabel`, `newReleaseLabel(type, count)`) zeigen nur Singular/Plural, **keine Zahl**. Archiv-Listen (`tracks_home` off) zeigen das Badge NICHT (Overview gated, Detail reicht `tracksHome` durch). `home_continue_watching.new_episode_count` nutzt dieselbe 14-Tage-Definition → Fortsetzen + Liste konsistent.

---

## Referenzen

- Logbook-Repo: `/Users/johannmertens/Work/Projects/Logbook` — Vorgänger-Projekt mit ausführlichem `handshake.md` (DB-Schema, RLS-Helper, RPCs, ältere UX-Entscheidungen, Logbuch-Konzept)
- Nakama GitHub: https://github.com/M0dds/nakama
- Supabase Projekt: dasselbe wie Logbook, URL/Key in `.env.local`
- Solid Router: https://docs.solidjs.com/solid-router
- TanStack Solid Query: https://tanstack.com/query/latest/docs/framework/solid/overview
- Tailwind v4: https://tailwindcss.com/docs/v4-beta
