# Nakama — Handshake

Master-Kontext. Lies das zuerst.

**Stand (2026-06-25):** App ist **live auf usenakama.app** (Cloudflare Workers, **Git-Auto-Deploy aus `main`**; `origin/main` aktuell — gelegentliche reine Docs-Commits reiten bewusst mit dem nächsten echten Deploy mit, weil ein Solo-Push über `__GIT_SHA__` ein Fehl-Update-Badge auslöst, siehe Memory `git-sha-triggers-update-toast`). Aktuelle Version **v0.15.0**. **Live:** Phasen 1-9 · alle Medien-Themen (1a Serien · 1b Filme · 1c Spiele/Steam, Steam-Proxy als Edge-Function deployed) · Sync-Instanzen · First-Login-Setup · Cover-Epos · Pre-Launch-Features (Versionierung / Release-Notes / PWA-Install / stille Updates) · **Push Phase 1+2** (VAPID + `push_subscriptions` + `send-push` (manuell/Test) + **Auto-Push bei neuen Folgen**: `notify-new-episodes`-Edge-Function + `pending_episode_notifications`-RPC + Dedup-Ledger, alle 4 h via pg_cron/pg_net, end-to-end verifiziert). **34 inkrementelle Migrationen** (+ `00000000000000_baseline`), alle gefahren + bestätigt (Liste → §Gotchas → Daten/RLS). Security-Audit durch — kein kritisches Finding, RLS-Schicht sauber (Report `SECURITY-AUDIT.md`). **`FEEDBACK-BACKLOG.md`** (Freundes-Feedback, 18 Punkte in R1-R5): **komplett deployed** — R1-R4 (v0.7.0–v0.10.0; + Hotfixes bis v0.10.2: Fortsetzen-Dedupe, Logbuch 12/Seite) + **R5 Listen-Kategorien** (v0.11.0, 2026-06-14). Versions-/Deploy-Historie → `PRE-LAUNCH-FEATURES.md` §Deploy-Historie; abgeschlossene Arbeit lebt in §Status + git. **v0.13.0** (2026-06-18): Datenschutz-Seite (`/privacy` via `LegalLayout`, Profil-„Über" + Footer; **Impressum als ruhender Entwurf** `Imprint.tsx`, nicht geroutet, bis „geschäftsmäßig?"-Pflicht via DSB geklärt) · Mitseher als **Avatar-Stack** (`CoWatcherMark`, max. 3 + „+N") · **`StandaloneShell`** vereinheitlicht Features/Datenschutz/Styleguide (geteilter Header/Footer, **„Zur App"-CTA** statt „Anmelden"). **E-Mail-Prod ist live** (2026-06-18): Magic-Link verschickt über **Custom SMTP via verifizierte Resend-Domain** (`noreply@usenakama.app`, DKIM/SPF/MX in Cloudflare, Email-Routing-Koexistenz via Resends `send.`-MAIL-FROM-Subdomain), Supabase-URL-Config gesetzt, End-to-end auf Prod getestet; „Confirm email" bewusst **aus**. DE-Template liegt versioniert in `supabase/email-templates/magic-link.html`. **v0.15.0 deployed (2026-06-25):** **Anzeige-Tag** (per-Lane Wochentag-Versatz fürs Verfügbarkeits-Signal, Picker Serie/Anime, lane-aware „Was kommt", Migration `20260623100000` gefahren + verifiziert) + **Media-Proxy** (Cloudflare-Worker `worker/index.ts` unter `/api/media/*`: TMDB-Token server-seitig → `SEC-TMDB` geschlossen, geteilter Edge-Cache, CORS-frei, Abuse-Guard via `Sec-Fetch-Site`; `TMDB_TOKEN` als Worker-Secret gesetzt; `PROXY_ENABLED` nur im Prod-Build, dev hittet Provider direkt) + relTime-/Cover-Schärfe-Fixes; live-getestet (alle 5 Quellen über den Worker, MISS→HIT verifiziert). **Offen:** nur noch Impressum-Aktivierung → §Offene Punkte.

> **Wegweiser (eine Quelle je Sache):** Feature-Inventar je Phase → **§Status** · Offenes/nächste Schritte → **§Offene Punkte** + **`FEEDBACK-BACKLOG.md`** (aktiver Freundes-Feedback-Backlog) · durable Architektur + Fallen (Sync-Instanzen-Modell, Migrationsliste) → **§Gotchas**. Diese Datei ist die *einzige* Status-Quelle; CLAUDE.md verweist nur hierher. Abgeschlossene Arbeit lebt in §Status + git, nicht als Fließtext hier.

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

**Storage-Keys:** `nakama:*` Prefix (`nakama:theme`, `nakama:mode`, `nakama:logbuch-filters`). NICHT `logbook:*`.

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
- `MoveItemDialog` — Modal-List-Picker. Same Two-Signal-Pattern wie AddSheet. Lokaler `snap`-Signal hält Item-Title (+ `sourceIsShared`/`itemSynced`) für die Lebensdauer eines Open-Cycles (siehe §Gotchas → Snap-Pattern). **Bestätigungs-Schritt** beim Verschieben aus einer **geteilten** Liste oder eines **gesyncten** Items (es nimmt das Item via der einen geteilten `list_item`-Zeile auch den anderen Mitgliedern weg + beendet die Sync; „Fortschritt bleibt erhalten") — der Picker wird durch eine In-Dialog-Confirm ersetzt, statt sofort zu mutieren. `onSuccess` invalidiert auch `syncContext`/`coWatchers`/`episodes`/Home/Kalender (Move flippt die Lane instance→global; sonst Geister-Auge gegen die alte geteilte Liste)
- `ItemNotes` (`src/components/ItemNotes.tsx`) — geteiltes Notizbrett (Item-Detail Section 03). Block-Liste: Text-Blöcke + Link-Blöcke (Label+URL → klickbare Pill, `target=_blank rel=noopener`). „+ Text"/„+ Link" mit Inline-Editoren; eigene Blöcke löschbar (Hover-X) mit Undo-Toast; Co-Member-Blöcke tragen `UserChip`-Attribution. Optimistic add/delete + Realtime. URL via `normalizeUrl` (nur http(s), sonst kein Link — XSS-Schutz). Gemountet nur mit Listen-Kontext (siehe §Gotchas → Daten/RLS, Notizen-Scope).
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

**Home-Dashboard (inline in `Home.tsx`):** `WasKommt` (4-col Accordion-Grid mit hero-2fr-1fr-1fr-1fr; first-click activate, second-click navigate), `Fortsetzen` (Accordion-Rows mit wachsendem Cover 2.25rem→4rem, initial 4 + `ShowMoreToggle`), `Logbuch` (Events-Feed; R4: drei Filter-Toggles Releases/Aktivität/Eigene im Ghost-Button-Stil — Auge offen/durchgestrichen = ein-/ausgeblendet, Buckets nicht-überlappend; `Pager` 12/Seite; Auswahl in `nakama:logbuch-filters` localStorage), `DayTag`, `EventIcon`, `WatchSentence`, `ListAddSentence` (mit „Du hast" / „@user hat"-Konjugation), `Cover`, `TodayLabel`.

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
- `notes.ts` — geteiltes Item-Notizbrett pro (list, item). `itemNotesOptions` liest Blöcke (`kind` text/link) + batch-resolvte Autor-Profile fürs Attribution; `addTextNote`/`addLinkNote`/`deleteNote` (alle `.select()` → silent-RLS-Block wirft). `normalizeUrl` validiert/normalisiert Link-Ziele (nur http(s)).
- **Medienquellen** `anilist.ts` · `tmdb.ts` · `steam.ts` · `jikan.ts` · `mangadex.ts` hinter `search.ts` → `searchMedia(q, type)` (provider-agnostischer Boundary, routet **typ-gezielt**: anime/manga→AniList, series+movie→TMDB, **game→Steam**; kein fan-out). Alle fünf live. Quell-spezifische Fallen → §Gotchas → Multi-Source.

**Pattern für neue Feature-Area:** (1) neue `queries/<area>.ts` (keys + options + mutations); (2) RPC oder direkter Table-Access (RLS filtert, **kein** `user_id`-Filter); (3) `.select()` nach Mutations zum Detect von silent-RLS-blocks (Logbook-Lektion); (4) Optimistic: `onMutate` snapshot+patch / `onError` rollback / `onSuccess` confirm.

---

## Realtime

`src/lib/realtime.ts` exportiert `useRealtimeInvalidation(channelKey, [{table, invalidates}])`. Im Component-Mount wird ein Supabase-Channel aufgemacht, jeder postgres_changes-Event invalidiert die deklarierten Query-Keys. RLS scoped Events server-side, kein Client-Filter nötig.

**Verwendet in:**

- `/` home → channel `home`, listens to `episode_watches/episodes/list_items/list_members/list_ownership_transfers`, invalidates `homeQueryKey`-Prefix (transfers landen so live im Logbuch-Feed)
- `/lists` overview → channel `lists-overview`, listens to `lists/list_members/list_items/episodes/episode_watches/list_invitations`, invalidates `listsQueryKey` (+ `["invitations","mine"]` für die Inbox-Karten)
- `/lists/:shortCode` → channel `list-{shortCode}`, invalidates `listQueryKey(shortCode) + listsQueryKey + listItemsQueryKey(shortCode)`; Phase 7: `list_invitations`/`list_members` invalidieren auch die `["list-members"]`/`["list-invitations"]`-Prefixe (Roster + Pending live)
- `/item/:type/:slug` → channel `item-{type}-{slug}`, invalidates `episodesQueryKey(type, slug) + listsQueryKey + ["list"]`-Prefix + `["co-watchers"]` (Cross-Cutting: Partner-Ticks updaten Listen-Badges + Mitseher live) + `item_history` (`["movie-co-watchers"]`/`["movie-seen"]`) + `item_notes` (`["item-notes"]` — Co-Member-Notizen live)
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
| **8 · Polish** | ✓ done — Cover/Avatar-Fade-in (`fadeOnLoad`), Skeleton-States (`Skeleton`), Theme-Switch-Crossfade (`@layer base`). Route-Transitions bleiben bewusst hart; nur der „Was kommt"-Pager-Swap (Desktop) bekam einen dezenten Bounce (§Gotchas Motion) |
| **9 · PWA + Hosting** | ✓ done — **live auf usenakama.app** (Cloudflare Workers + Static Assets, Git-Auto-Deploy aus `main`), Manifest + SW (`vite-plugin-pwa`), PWA-Install-Guide + Update-Flow (siehe Memory `pwa-clientsclaim-update-reload`) |
| **Sync-Instanzen** | ✓ live — Fortschritt global pro User bis Sync → Instanz ab 0; Reads/Writes lane-branchen; Un-Sync = Union-Merge. List-scoped Item-Route `/lists/:shortCode/item/...`. Kalender + Logbuch read-only, Mitseher-Auge nur in geteilten Listen. Durables Modell → §Gotchas. |
| **Politur-Session** | ✓ live — liquid Navbar-Bubble + Back-Satellit-Recoil, `Segmented` teilt den Morph, Confirms als Modal, „Was kommt"-Overshoot, entakzentuierte Kalender-Episodennummer. |
| **Thema 1a · Serien (TMDB)** | ✓ live — 2. Quelle TMDB (`tmdb.ts`), quellen-agnostische Suche, echte Staffeln, staffel-bewusstes Continue-Watching, date-only Air-Dates. |
| **Thema 1b · Filme (TMDB)** | ✓ live — Film-Suche, folgenloser binärer „Gesehen"-Status (`item_history`/`status.ts`), eigene Film-Detailseite (live aus TMDB, DE-Release), Mitseher-Auge, unreleased Filme in „Was kommt". |
| **Thema 1c · Spiele (Steam)** | ✓ live — 3. Quelle Steam (Proxy: dev Vite, prod Edge-Function), binärer „Gespielt"-Status (teilt `status.ts`), eigene Spiel-Detailseite mit Screenshot-Galerie, unreleased Spiele in „Was kommt". Quell-Fallen → §Gotchas → Multi-Source. |
| **Detailseiten-Politur + ConfirmDialog** | ✓ live — Release-Datum als Fact, mobile Bento-Reihenfolge; alle Confirms → einheitlicher `ConfirmDialog`. |
| **Layout — Content-Frame** | ✓ live — `--content-max` 1728px-Cap, `ContentFrame` (Framing-Hairlines), full-bleed PageHeader-Rule, `.scrollbar-none`. |
| **Cover-Epos** | ✓ live — Listen-Cover: `GeneratedCover` (Seed→Theme+Muster) oder owner-Upload (`list-covers`-Bucket); `PinBadge` auf Cover; Item-Cover hochkant 2:3. Durables Modell → §Gotchas. |
| **Listen-Kategorien (F9/R5)** | ✓ live (v0.11.0) — `lists.category` (Anime/Manga/Serien/Filme/Spiele, NULL = „Alle"): Picker im Create-Form, owner-only Switcher auf der Detailseite, AddSheet **hart gelockt** auf die Kategorie, Move-Dialog **warnt nur** (dulden), Übersicht **kategorie-sektioniert** (kategorielos → „Meine Listen"). Migration `20260605110000`. |
| **Anzeige-Tag (Versatz)** | ✓ live (v0.15.0) — optionaler per-Lane Wochentag-Override: snappt das *Verfügbarkeits-Signal* (Was kommt / Kalender / „neue Folge"-Badge) auf den ersten gewählten Wochentag ≥ echtem Release (regionaler Drop „From" So→Mo / Gruppen-Schautag „freitags"). Picker auf der Detailseite (Serie/Anime). Lane-Modell: globale Lane = per-User (`item_display_prefs`), Sync-Instanz = gruppen-geteilt (`list_items.display_weekday` via `set_instance_display_weekday`-RPC). „Was kommt" lane-bewusst (split bei abweichenden Tagen). Episodenliste behält echte Termine. Migration `20260623100000`. Durables → §Gotchas. |
| **Media-Proxy (Worker)** | ✓ live (v0.15.0) — Cloudflare-Worker `worker/index.ts` hostet die SPA (`ASSETS`) **und** proxyt alle Lese-Quellen unter `/api/media/<source>/*` (anilist/tmdb/steam/jikan/mangadex). TMDB-Token server-seitig (`SEC-TMDB` geschlossen), geteilter `caches.default`-Edge-Cache pro Quell-TTL, same-origin (kein CORS), Abuse-Guard via `Sec-Fetch-Site`/Referer + Pfad-/Param-Allowlist je Quelle. Client-Boundary `src/lib/proxy.ts` (`PROXY_ENABLED = !DEV` → dev direkt, prod über Worker). `TMDB_TOKEN` als Worker-Secret. |

---

## Offene Punkte

### Aktiver Backlog

Freundes-Feedback in `FEEDBACK-BACKLOG.md` (18 Punkte, R1-R5) — **komplett deployed.** R1-R4 (v0.7.0–v0.10.0) + **R5 Listen-Kategorien** (v0.11.0, 2026-06-14: F9 — Kategorie pro Liste, kategorie-gelockter AddSheet, sektionierte Übersicht; Migration `20260605110000` gefahren). Der 18-Punkte-Backlog ist damit abgearbeitet.

### Geplant, nicht akut

- **Push-Reste (low).** Phase 1+2 sind live (Auto-Push bei neuen Folgen, v0.12.0). Lose Enden: die `push_subscriptions`-Basis-Tabelle ist als rohes SQL entstanden (kein `CREATE TABLE`-Migrations-File — die optionale Baseline-Snapshot-Migration wurde bewusst nicht gebaut, bräuchte einen Live-Policy-Namen-Check); `send-push`-CORS-Allowlist enthält noch localhost (Test); Auto-Push deckt nur **Folgen** (anime/series) ab — Film-/Spiel-Releases sind auf v2 verschoben (kein Episodenmodell).
- **E-Mail-Prod (Auth) → ✓ erledigt (2026-06-18).** Magic-Link läuft auf Prod über **Custom SMTP via verifizierte Resend-Domain** (Versand `noreply@usenakama.app`; DKIM + `send.`-SPF/MX in Cloudflare; Resends MAIL-FROM-Subdomain `send.usenakama.app` koexistiert konfliktfrei mit dem Root-SPF von Cloudflare Email Routing → `servus@`-Empfang unberührt). Supabase: SMTP `smtp.resend.com:465` (User `resend`, Passwort = Resend-API-Key), URL-Config (Site `https://usenakama.app` + Redirect-Allowlist inkl. localhost), Rate-Limit hochgesetzt. End-to-end getestet ✓. „Confirm email" bewusst **aus** (Interaktion mit Discord-Same-Email-Linking + Neu-User-Onboarding → falls je an: Neu-User-Flow vorher auf Prod testen). DE-Template (Light + Dark) versioniert in `supabase/email-templates/magic-link.html`, in Supabase eingespielt + mit echten Mails getestet ✓. DMARC optional offen (kein Blocker). (Der Handoff-Prep-Doc `MAGIC-LINK-PREP.md` war damit abgearbeitet + wurde entfernt.)
- **Quellen-Limitierungen (best-effort, akzeptiert):** Newest-Episode-Title-Lag (Jikan/AniList hinken 1-3 Wochen hinter Air-Date) · Manga-Kapitel-Titel (MangaDex-Coverage patchy) · Long-anime Titel-Cap (`db-max-rows`=1000 → Episodentitel jenseits Folge 1000 leer; echte Lösung `.range()`-Chunking, §Gotchas → Daten/RLS) · Serien-Termine = TMDBs US-/Ursprungs-Datum statt DE-Streaming (teils 1 Tag früh; Memory `tmdb-de-release-day-shift`).

### Sicherheits-Deploy-Reste (low → `HEALTH.md` / `SECURITY-AUDIT.md`)

- **SEC-BASELINE** — Live-Sicherheits-Layer in `00000000000000_baseline.sql` gesnapshottet; Tabellen-DDL bewusst offen (voller `pg_dump` später optional).
- **SEC-TMDB** — ✓ geschlossen (v0.15.0, 2026-06-25): TMDB läuft jetzt wie Steam über den Worker-Proxy, der Token liegt server-seitig als `TMDB_TOKEN`-Secret; `VITE_TMDB_TOKEN` wird nur noch hinter `import.meta.env.DEV` gelesen → im Prod-Bundle dead-code-eliminated (verifiziert: kein JWT in `dist/`).

### Thema 4 (Onboarding-Tooltips) — verworfen

Empty-Canvas-Onboarding löst es besser (Empty States erklären im Moment des Brauchens). Spec liegt in der Git-Historie dieser Datei.

### Bekannte tech-debt

- **AddSheet Such-Pill Content-Fade beim Schließen** läuft 300 ms over ease-out — bei sehr schnellen Aktionen sichtbar.
- **`/item/:type/:slug` ohne Listen-Kontext.** Sync-Toggle / Mitseher-Auge / Notizen fehlen dort bewusst (Home/Kalender/Suche-Einstiege sind kontextfrei); der Sync-Toggle bekommt `listItemId` via Router-Link-State von der Listen-Row. Back-Ziel ist kontextecht via `src/lib/navigation.ts` (`canGoBack()`, Deep-Link-Fallbacks mit `replace` + Zähler-Suppress).
- **„Was kommt"-Cover-Slots** sind quadratisch + `object-cover` → Spiel-Header (Querformat) werden beschnitten; nur die Item-Detailseite ist voll adaptiv (Listen-Detail-Item-Cover hochkant 2:3, dort croppen Spiele umgekehrt — bewusster Trade-off).
- **Steam-Release-Datum unscharf.** `parseSteamDate` (steam.ts) parst nur exaktes „DD. Mon. YYYY" → fuzzy („Q2 2025") → kein ISO → fehlt in „Was kommt". Das Datum wird zudem erst beim Detailseiten-Besuch aus `appdetails` nachgezogen → ein nie geöffnetes Spiel fehlt bis dahin.

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
- **Motion-Philosophie (Apple-Linse, Phase 8).** Nakama ist ein *Tool*, keine Landingpage: Motion ist **funktional**, nicht dekorativ — sie erklärt Zustandsänderungen (Bubble-Morph, Pin-Resort, Toast), wahrt räumliche Kontinuität (AddSheet morpht aus dem `+`), oder versteckt Lade-/Decode-Ruckeln (Cover-Fade, Skeletons). **Kein Entrance-Choreo auf Content** (gestaffelte Page-/Element-Einblendungen wurden gebaut und wieder verworfen — lasen sich „aufgeführt"/laggy).
- **Route-Transitions bleiben bewusst hart** (Tab-Tool wie iOS-Tabbar). Ein app-weiter `RouteTransition`-Wrapper wurde 2026-06-02 gebaut + wieder **verworfen** — der User meinte mit „Seitenwechseln" nicht den Routenwechsel, sondern das **Blättern im Pager**. Statt route-weit also gezielt der **„Was kommt"-Pager-Swap (nur Desktop)**: `WasKommt` spielt bei `page()`-Wechsel eine kurze WAAPI-Animation auf dem Grid, **horizontal in Blätterrichtung** — vorwärts gleiten die Karten von rechts rein, rückwärts von links (opacity 0→1 + `translateX` ±28px→0, back-out-Easing `cubic-bezier(0.34,1.5,0.5,1)` = dezenter Bounce). Richtung kommt aus `on(page, (p, prev) => …, {defer:true})` (prev-Seite); Initial-Render animiert nicht, nur echtes Blättern; reduced-motion-aware. Hier ist `transform` ok (das Grid hat keine `position:fixed`-Kinder — die `ColumnGuide` lebt auf Home-Ebene, außerhalb; `body` hat `overflow-x:clip` → kein Scrollbar durch den transienten X-Versatz). Stellschrauben (Bounce/Tempo/Weg) inline in `WasKommt`. **Mobile** blättert nicht (reveal-by-row über „+N weitere"); dort kommt die neu geladene Reihe **vertikal von oben** rein (`translateY` -14px→0, gleicher Bounce). Dafür wurde das mobile Outer-`<For each={rows()}>` auf **`<Index>`** umgestellt (keyt nach Position): `rows()` baut bei jedem Reveal frische Slices → `<For>` (keyt nach Referenz) hätte ALLE Reihen remountet (Cover-Re-Fade = Flackern); mit `<Index>` bleiben bestehende Reihen gemountet und nur der neue Index mountet — das innere `<For each={row()}>` keyt weiter nach Item-Referenz (stabil über Reveals) → Karten bleiben auch erhalten. Der `onMount` der neuen Reihe spielt die Animation, gegated auf Index ≥ Initial-Reihen (Initial-Render + reduced-motion animieren nicht).
- **Theme-Switch-Crossfade braucht `@layer base`, NICHT unlayered.** Die `theme-transition`-Regel (faded alle Farben beim Theme-Wechsel) muss in einem Cascade-Layer *unter* Tailwinds `utilities` liegen. **Cascade Layers schlagen Spezifität:** eine *unlayered* Regel (auch mit `:where()`/Spezifität 0) überschreibt JEDE `@layer utilities`-Utility — also auch `transition-all` der Liquid-Bubble → die Bubble springt statt zu stretchen, aber nur während des Theme-Fensters (heimtückisch: Kalender-Segmented heil, Theme-Segmented kaputt). In `@layer base` gewinnt jede eigene Transition-Utility, nur statische Flächen kriegen den Farb-Crossfade. `applyTheme` toggelt die Klasse 300 ms + forced reflow (`void root.offsetHeight`) damit der Fade zuverlässig feuert; reduced-motion überspringt.

### Daten / RLS

- **PostgREST/Supabase HARTER 1000-Row-Cap (`db-max-rows`).** ACHTUNG, frühere Notiz war falsch: ein explizites `.limit(5000)` **hebt den Cap NICHT auf** — Supabase erzwingt einen serverseitigen Hard-Cap von **1000 Zeilen**, der jedes größere `.limit()` nach unten überstimmt (empirisch bestätigt 2026-06-01: das Mitseher-Auge auf One Piece brach exakt bei Folge 1000 ab, obwohl `coWatchersOptions` `.limit(5000)` trug). **Für >1000 Zeilen: NICHT auf ein großes `.limit()` verlassen** — entweder per `.range()` in ≤1000er-Chunks paginieren, ODER (besser) die Query auf das sichtbare Fenster scopen (`.in("episode_id", visibleIds)`, wie `episodesQueryOptions` + jetzt `coWatchersOptions`). `count: exact, head: true`-Heads sind NICHT betroffen (zählen, liefern keine Zeilen) — darum sahen A's eigener Fortschritt (Head-Count) + sichtbare Seiten korrekt aus, nur B's Voll-Fetch des Auges nicht. **Bekannt noch betroffen:** `selectTitleGaps` (`episodes.ts`, `GAP_QUERY_LIMIT=5000`) ist real bei 1000 gekappt → Episodentitel jenseits Folge 1000 bleiben leer (Titel sind ohnehin best-effort, daher zurückgestellt).
- **Bulk Upsert ist immer schneller als per-row UPDATE-Loop.** 1100+ Rows: ~5 s vs ~110 s. Per-row → tab tot, kein Update committed. Pattern: `storeEpisodes`, `enrichJikanTitles`, `enrichMangaDexTitles`.
- **Cross-Cutting Cache-Fan-out:** jede Mutation die `itemCount` oder Title/Watch-Beziehung ändert, MUSS `listsQueryKey` + `["list"]`-Prefix invalidieren. Episode-Mutations zusätzlich `episodesQueryKey`. Episode-Realtime in `/item` invalidiert auch List-Keys, sonst updaten Partner-Ticks die Badges auf nicht-gemounteten /lists-Seiten nicht.
- **TITLE_ENRICHMENT_VERSION Pattern für one-time backfill.** Items.metadata trägt Version-Zahl; bei Logic-Change bumpen → alle Items kriegen einmaligen Retry beim nächsten Visit, unabhängig vom 12 h Stale-Gate. Beispiel: v2 hatte per-row-UPDATE-Loop der für lange Anime crashte, v3 bumpt + bulk-upsert.
- **AniList Cover-URL-Naming-Falle:** API-Feld `coverImage.large` liefert `/cover/medium/` URL (~230 px), nicht `/cover/large/` (~430 px). Letzteres im API-Feld `extraLarge`. Search holt extraLarge, `highResCover()` schwenkt Legacy-DB-URLs render-time um.
- **Discriminated Union für Logbuch-Events.** `LogbookEvent = WatchBundle | ListAddEvent` mit `kind` als Discriminator. Solid's `<Show>` narrowed nicht; im JSX `{ev.kind === "watch" ? <WatchSentence ev={ev}/> : <ListAddSentence ev={ev}/>}` damit TypeScript narrowed.
- **Optimistic Writes ohne `.select()` lügen** wenn RLS still blockt (0 rows, kein Error). Pattern: nach `update` zurück selektieren, wenn 0 → `error: "blocked"` rollback.
- **Cross-User-RLS MUSS an den Zeilen-Eigentümer binden, nicht an den Item-Zugang des Betrachters.** Ein Leck (gefixt `20260601110000`): `episode_watches_select_co` band die globale Lane an `is_co_member(episode_id, auth.uid())` — das prüft nur „trackt der *Betrachter* dieses Item", referenziert den Watcher (`user_id` der Zeile) gar nicht → jeder, der dasselbe Item in irgendeiner Liste hatte, sah **fremde globale Watch-Historie**. Korrekt: `shares_list_with(user_id, auth.uid())` (bindet an den Watcher), wie `profiles_select_co_member`/`item_history_select_co`. **Regel:** jede „sieht A die Daten von B"-Policy muss `shares_list_with(<owner_col>, auth.uid())` o.ä. nutzen — ein Helfer, der nur den Betrachter + ein geteiltes Objekt prüft (ohne den Eigentümer), leckt. **Privacy-Audit 2026-06-01:** alle Lese-Policies + DEFINER-RPCs mit Daten-Rückgabe danach geprüft → sauber (Details → HEALTH `PRIV-1`).
- **DEFINER-RPCs umgehen RLS — sie MÜSSEN selbst auf `auth.uid()` scopen.** Jede `security definer`-Funktion, die Zeilen zurückgibt, filtert explizit (`where user_id = auth.uid()` / `is_list_member(...)`). Geprüft: `get_my_invitations`, `get_list_invitations`, `continue_watching`, `home_continue_watching`, `item_progress`, `list_item_progress` — alle korrekt. `home_watch_bundles`/`home_new_releases` sind bewusst `invoker` (lehnen auf RLS).
- **Client-Reads, die per-User filtern, dürfen sich NICHT auf RLS-Scoping verlassen, wenn die SELECT-Policy Co-Member-Zeilen durchlässt.** Falle (gefixt 2026-06-02): `trackedItemIds` (home.ts) las `list_members` mit `.eq("tracks_home", true)` OHNE `.eq("user_id", …)` und kommentierte „RLS scopes to caller". Tut sie nicht: `list_members_select_member` gibt `user_id = auth.uid() OR is_list_member(list_id, auth.uid())` zurück — also **auch alle Co-Member-Zeilen** (fürs Roster). Folge: in jeder geteilten Liste machte das `tracks_home` *irgendeines* Mitglieds die Liste für *alle* „getrackt". **Regel:** wenn eine Query eine per-User-Spalte auswertet, explizit `.eq("user_id", uid)` setzen — RLS-Sichtbarkeit ≠ per-User-Scope.
- **Storage-RLS-Policies mit Subquery auf eine Tabelle, die selbst eine `name`-Spalte hat → Namenskonflikt.** Falle (gefixt `20260601160000`): die `list-covers`-Insert-Policy prüfte `exists(select 1 from public.lists l where l.id::text = (storage.foldername(name))[1] …)`. `lists` hat eine `name`-Spalte → unqualifiziertes `name` band im Subquery an **`lists.name`** (den Listentitel, z.B. „Test1"), nicht an `storage.objects.name` (den Objektpfad) → `foldername('Test1') = {'Test1'}` → `l.id = 'Test1'` nie wahr → `exists` immer falsch → **403 „new row violates row-level security policy" für ALLE, auch den Owner**. Fix: den Pfad explizit als **`storage.objects.name`** qualifizieren. (Die Avatar-Policy hatte das nie — sie vergleicht direkt `(storage.foldername(name))[1] = auth.uid()::text`, kein Tabellen-Subquery.) **Regel:** in Storage-Policy-Subqueries immer `storage.objects.name` voll qualifizieren.
- **Notizen-Scope (durable Modell).** Das Item-Notizbrett (`item_notes`, Section 03) ist pro **(list_id, item_id)** — die Liste ist die Sharing-Einheit der App, also greift die übliche `is_list_member`-RLS (kein neuer Helper). Folge: dasselbe Item in zwei Listen hat zwei getrennte Bretter; eine private Liste = Ein-Mann-Brett (faktisch privat). **Die Section erscheint nur mit Listen-Kontext** (`syncCtx.data.listId` vorhanden, d.h. list-scoped Route) — die globale Item-Seite (Home/Suche/Kalender-Einstieg) hat keine eindeutige Liste, genau wie Sync-Toggle + Mitseher-Auge dort fehlen. Blöcke: jeder Member liest+fügt hinzu; nur **eigene** Blöcke editier-/löschbar (kollaboratives Brett ohne Edit-Wars). **Link-Sicherheit:** `normalizeUrl` (notes.ts) lässt nur `http(s)` durch (prependet `https://`), sonst kein Link → `javascript:`/`data:`-URLs können nie als klickbarer `href` landen (XSS). Mobile-Section-Nummern: Details=01, Notizen=02, Episoden/Film/Spiel=03 (Episoden-`mobileNumber` ist dynamisch `notesListId() ? "03" : "02"`, damit ohne Notizen keine Lücke entsteht).
- **List Covers (durable Modell).** Jede Liste hat `cover_seed bigint` (DB-Default random) + `cover_url text` (owner-Upload, überschreibt). **`ListCover`** rendert `cover_url ? <img> : <GeneratedCover seed>`. `GeneratedCover` ist Inline-SVG aus dem Seed → deterministisch Theme+Muster, Farben aus `THEMES[].swatch[mode]` (kein CSS-Var, da das Cover ein *festes* zufälliges Theme nutzt, nicht das aktive) → braucht den Mode reaktiv in JS: **`useResolvedMode()`**. Custom-Cover-Write owner-only (Storage-Policy + `lists_update_owner`). Cover-Behandlung app-weit: **flat, hard corners, keine Outline** (User-Entscheidung; Item-Detail-Cover ebenso). Pin-Status zeigt **`PinBadge`** auf dem Cover, NICHT mehr das Row-Pin-Icon (das ist jetzt hover-only).
- **Migrationen** fährt der User manuell im Supabase SQL-Editor. Bei neuer Migration im Chat ankündigen + den SQL liefern (**Falle:** der User kopiert leicht den Erklärtext mit → SQL klar abgrenzen). Eine frische Nakama-DB = erst Logbook-Migrationen (leben in dessen Repo), dann Nakamas Files in Timestamp-Reihenfolge. **Status: alle 34 inkrementellen gefahren + User-bestätigt.** (Plus `00000000000000_baseline.sql` — KEINE „zu fahrende" Migration, sondern ein Live-**Snapshot** des Sicherheits-Layers für Reviewbarkeit/Fresh-Deploy; auf der bestehenden DB NICHT ausführen, würde „already exists" werfen. Siehe `SEC-BASELINE`.) Liste (ID — Zweck):
    - `20260528200000` — Phase-3-5-Catch-up · `20260529120000` — Home-RPCs · `20260529130000` — Pin-RPCs (atomare `set_list_pin`/`set_list_item_pin`)
    - `20260530120000` — Auto-Sync-Cascade (`mark_episodes_watched_synced` + Re-Assert `toggle_episode_synced`) · `20260530140000` — Realtime-Sharing-Tables · `20260530150000` — Avatar-Storage · `20260530160000` — `delete_account` · `20260530170000` — invitation_names_prefer_display
    - `20260531100000` — Sync-Instanzen · `20260531120000` — home_sync_instances · `20260531140000` — unshare_when_solo · `20260531160000` — reset_progress_fanout (synced Reset fächert für alle) · `20260531180000` — continue_watching_seasons (staffel-bewusst) · `20260531200000` — item_history_co_member (Film-Mitseher-Auge via `shares_list_with` + Realtime-Publication) · `20260531210000` — items_source_steam (`'steam'` im `source`-CHECK)
    - `20260601100000` — onboarding (`onboarded_at` + Backfill + `username_available`) · `20260601110000` — fix_episode_watches_global_privacy (globale Lane auf `shares_list_with`, schließt Cross-User-Leck) · `20260601120000` — remove_default_watchlist (`handle_new_user()` ohne Listen-Insert) · `20260601130000` — prelaunch_hardening (items/episodes-DEFINER-RPCs + Direkt-Writes entzogen; owner-only `lists`-UPDATE/`list_members`-DELETE; `shares_item_in_list_with`) · `20260601140000` — set_list_tracking (self-scoped `tracks_home`-Toggle) · `20260601150000` — list_covers (`cover_url`+`cover_seed`+`list-covers`-Bucket) · `20260601160000` — fix_list_cover_policies (Objektpfad als `storage.objects.name` qualifiziert, siehe §Daten/RLS) · `20260602100000` — watch_bundles_seasons (`home_watch_bundles` staffel-bewusst: zusätzlich nach `season_number` gruppiert + `season` zurückgegeben, fürs Logbuch #5) · `20260603100000` — item_notes: geteiltes Notizbrett pro (list, item), Blöcke `kind ∈ {text,link}`, RLS via `is_list_member` (Insert Member, Update/Delete own), Realtime-Publication
    - `20260604100000` — catalog_rpc_authz (M-1, Security-Audit): neuer Helper `can_write_catalog_item(item, uid)`; `set_item_metadata` + `upsert_episodes` schreiben nur noch, wenn der Aufrufer das Item in einer eigenen/Mitglieds-Liste hat — als **stiller No-Op** (Authz als `WHERE`, nicht `raise`, sonst crasht der ungefangene Enrichment-Write auf Deep-Links). `upsert_item` unangetastet (Insert-Pfad, no-op-on-conflict) · `20260604110000` — username_integrity (M-2): CHECK `^[a-z0-9._-]{3,30}$` auf `profiles.username` + Unique-Index auf `lower(username)` (Handle-Format war nur client-seitig; schließt Spoofing via Anon-Key + `Alice`/`alice`-Koexistenz) · `20260604120000` — text_length_limits (L-1): CHECK-Caps `lists.name`≤120/`description`≤500/`profiles.display_name`≤80/`item_notes.body`≤5000/`url`≤2048 + spiegelnde `maxlength` an den Inputs (kein Längen-Backstop existierte → Multi-MB-Strings in geteilten Feldern) · `20260604130000` — push_subscriptions_endpoint_unique: `UNIQUE(endpoint)` auf `push_subscriptions` (schließt Gleicher-Endpoint-Doppel-Subscription; R3) · `20260605100000` — continue_watching_dedupe_synced: globaler „Fortsetzen"-Eintrag nur noch, wenn das Item in einer nicht-gesyncten getrackten Liste liegt (synced-only Items erschienen sonst doppelt — global + Instanz) · `20260605110000` — list_category (F9/R5): `lists.category text` + CHECK (NULL = „Alle", sonst anime/manga/series/movie/game); Writes reiten auf der bestehenden owner-only `lists_update_owner`-Policy, kein RLS-Change; idempotent (gefahren + bestätigt 2026-06-11) · `20260615110000` — episode_notifications_sent (Push Phase 2): Dedup-Ledger `(user_id, episode_id)` + RLS + Detection-RPC `pending_episode_notifications(_lookback)` (service-role-only, SECURITY DEFINER; `tracks_home` + Push-Abo + any-lane-ungesehen + Dedup-Anti-Join; manga/Film/Spiel raus) + Seed aller bereits erschienenen getrackten Folgen (Anti-Backfill-Blast) · `20260615120000` — schedule_notify_new_episodes (Push Phase 2): pg_cron alle 4 h → pg_net `http_post` an die `notify-new-episodes`-Edge-Function, `X-Notify-Secret` aus Vault (`notify_cron_secret`), Function `--no-verify-jwt` (neues Key-Format); gefahren + bestätigt 2026-06-16 · `20260618100000` — heal_orphaned_sync_instances (einmaliger Daten-Fix): merget `episode_watches`-Instanz-Zeilen, deren `list_item` nicht (mehr) gesynct ist (`list_item_id IS NOT NULL AND sync_enabled=false`), zurück in die globale Lane jedes Watchers + löscht sie. Repariert Altlasten des alten „billigen" Move (sync_enabled=false ohne `unsync_item`) → gestrandeter Fortschritt + Geister-Mitseher-Auge. Idempotent (gefahren + bestätigt 2026-06-18) · `20260623100000` — display_weekday (Anzeige-Tag): per-User-Tabelle `item_display_prefs(user_id, item_id, weekday)` (own-rows RLS) + gruppen-geteilte Spalte `list_items.display_weekday` (nullable) + member-scoped RPC `set_instance_display_weekday`; Wochentag-Konvention 0=So..6=Sa (`Date.getDay()`). Additiv/idempotent, gefahren + bestätigt 2026-06-23 · `20260702100000` — watch_bundles_all_lanes: `home_watch_bundles` liest beide Lanes (global + Instanz, dedupe `distinct on (user_id, episode_id)`) statt nur global → Co-Member-/gesyncte Watches erscheinen im Logbuch-„Aktivität"-Feed (waren durch den alten `list_item_id IS NULL`-Filter unsichtbar); nur diese RPC, Progress-RPCs unberührt; kein Client-Change. Gefahren + bestätigt 2026-07-02

- **Sync-Instanzen (durable Modell).** Fortschritt ist **global pro User** (`episode_watches.list_item_id IS NULL`), BIS ein `list_item` gesynct wird (`sync_enabled=true`) → eigene **Instanz** (`list_item_id = LI`), startet bei 0. **Jede `episode_watches`-Leseabfrage MUSS die Lane filtern** — global `.is("list_item_id", null)` oder Instanz `.eq("list_item_id", LI)`; ohne den expliziten `IS NULL` lecken Instanz-Zeilen in globale Flächen, sobald Instanzen existieren. **Bewusste Ausnahme: `home_watch_bundles`** (der „watch"-Teil des Logbuch-Feeds) liest *beide* Lanes (dedupe `distinct on (user_id, episode_id)`), damit geteilte/gesyncte Aktivität überhaupt im Logbuch auftaucht — das ist ein Aktivitäts-Log, keine Fortschritts-Fläche, also kein Leck (Migration `20260702100000`; vorher fiel jeder synced Tick durch den `list_item_id IS NULL`-Filter raus → Co-Member-Watches erschienen nie unter „Aktivität"). Die Progress-Flächen (`home_continue_watching` / Was-kommt) bleiben strikt lane-gefiltert. Writes laufen über `set_episode_watch` / `mark_episodes_watched_upto` / `reset_progress` mit optionalem `_list_item_id` — der RPC branchet server-side (null/nicht-gesynct → global, kein Fan-out; gesynct → Instanz + Fan-out an Mitglieder). Un-Sync = `unsync_item` (Union der Instanz ins Globale jedes Mitglieds, dann Instanz löschen). **Jeder Weg, der `sync_enabled` auf false dreht, MUSS über `unsync_item` laufen — nie ein nacktes `update sync_enabled=false`.** Sonst stranden die Instanz-Zeilen (Fortschritt des Movers unsichtbar in der globalen Lane + fremde Mitseher-Zeilen verwaisen an einem list_item, das nun in einer anderen/privaten Liste liegt = Geister-Auge). `moveListItem` ruft daher `unsync_item` VOR dem Listenwechsel auf, solange die Zeile noch in der Quell-Liste liegt (member-scoped Merge korrekt). Altlasten aus dem alten billigen Flip heilt Migration `20260618100000`. Die alten `*_synced`/`reset_item_progress`/`backfill_*` RPCs bleiben für Logbook unberührt. Item-Seite: globale Route `/item/...` vs. list-scoped `/lists/:shortCode/item/...`; `instanceLI = syncEnabled ? listItemId : null`; `laneReady`-Gate verhindert kurzes Anzeigen der falschen Lane.

- **Anzeige-Tag / Display-Weekday-Versatz (durable Modell).** Optionaler Wochentag-Override, der das *Verfügbarkeits-Signal* (Was kommt · Kalender · „neue Folge"-Badge · Heute/Morgen-Tag) via `snapToWeekday(iso, weekday)` (`format.ts`, 0=So..6=Sa, `Date.getDay()`) auf den ersten gewählten Wochentag **≥** echtem Release schiebt (0-6 Tage vorwärts, Tag-Math lokal wie `dayOffset`). Behebt regionalen Drop (TMDB-Ursprungsdatum „From" So → DE Mo) + Gruppen-Schautag. **Per Lane, spiegelt das Sync-Instanz-Modell:** globale Lane = **per-User** in `item_display_prefs(user_id, item_id, weekday)` (own-rows RLS, `display-prefs.ts`); Sync-Instanz = **gruppen-geteilt** in `list_items.display_weekday`, geschrieben über den member-scoped DEFINER-RPC `set_instance_display_weekday` (gelesen via `syncContext.displayWeekday`). Picker (`DisplayWeekdayPicker`) auf der Item-Detailseite, nur Serie/Anime; er editiert die aktuelle Lane (Instanz wenn `instanceLI()`, sonst global). **„Was kommt" ist lane-bewusst** (`trackedLanesByItem` baut pro Item eine globale + je Sync-Instanz eine Lane; pro Lane wird das soonest-Episode-Datum gesnappt): gleiche Tage **kollabieren** zu einem Eintrag (= No-Override-Normalfall, unverändert), abweichende **splitten** in eigene, mit dem Listennamen beschriftete Einträge. **Entscheidend:** `WasKommt` keyt Identität per **`itemId|airDate`**, NICHT per `itemId` — sonst aktivieren/hero'en doppelte Einträge gemeinsam. Badge (`findItemsWithNewEpisodes`, per `list_item` lane-scoped) zählt eine Folge erst „neu", wenn ihr **gesnappter** Tag ≤ jetzt ist (Mo-Drop + Fr-Override → Badge erst Freitag). Kalender nutzt einen **effektiven** Override (global gewinnt, sonst Instanz-Fallback) für eine Grid-Position pro Folge. **Bewusst NICHT abgedeckt:** die **Episodenliste der Detailseite bleibt bei den ECHTEN Sendeterminen** (wahrer Fahrplan; der Versatz wirkt nur auf Vorschau/„neu"-Signale), und ein recently-aired→snap als eigener Was-kommt-Eintrag (das übernimmt der Badge).

- **`location.state` (Solid Router) überlebt einen Hard Reload** — es liegt auf `history.state`. Ein dort abgelegter Snapshot (z.B. `syncEnabled` als Pre-Load-Hint) kann also **veraltet** sein; eine Live-Query (syncCtx) muss via `liveValue ?? stateHint` Vorrang haben, NICHT `stateHint ?? liveValue` (sonst gewinnt ein stale `false` auch nach Reload).

- **Mitseher-Auge = Shared-List-only + Privacy.** `coWatchersOptions` ist auf EINE Liste scoped (`listMemberIdsOf`, nicht „alle Co-Member") und wird nur gemountet, wenn das Item über eine **geteilte** Liste geöffnet ist (`isShared` + `listId`). Private Liste / globale Item-Seite / Kalender → **kein Auge** (ein privater Tracker darf den Stand anderer nie verraten). Lane-matched wie die Episode-Reads.

- **Logbuch + Kalender sind reine read-only Indikatoren.** Keine Ticks, keine Verlinkungen — getickt wird nur auf der Item-Seite (wo die Lane eindeutig ist). Logbuch-Sätze sind statischer Text (kein `<A>`), `missed` ohne „Abhaken"-Button; Kalender-Tag-Pane ohne Link + ohne Mitseher-Auge (nur eigener Punkt).

- **Auto-Sync-RPCs statt Listen-Kontext (Phase 7).** Die geteilte Live-DB trägt `toggle_episode_synced(_item_id, _episode_id, _watched)` als *Auto-Sync*-Variante (Logbook `20260528180000`): sie fächert über ALLE Sync-ON-Listen mit dem Item auf, kein `list_item.id` im Call. Der Cascade hatte kein Auto-Sync-Twin — `mark_episodes_watched` fächert nur für ein explizit übergebenes `_list_item_id`. Nakamas Item-Page/Kalender sind kontextfrei, daher Migration `20260530120000`: neuer `mark_episodes_watched_synced(_item_id, _up_to_episode_id)` (Twin) + sicherheitshalber Re-Assert von `toggle_episode_synced` in der Auto-Sync-Form (drop+create, falls die geteilte DB noch die alte Signatur trug). **Falle:** named-param RPC-Calls brechen, wenn die Live-Funktion andere Parameter-NAMEN bei gleichen Typen hat — `create or replace` kann Param-Namen nicht ändern, es braucht `drop function` zuerst.

### Multi-Source (TMDB-Serien/Filme, Steam-Spiele)

- **`items.type`/`source` CHECK-Constraints (Logbook-Core-Schema `20260527102000`).** `type in ('anime','manga','series','movie','game','music')` — alle erlaubt. `source` war `('anilist','tmdb','tvmaze','igdb','manual')`; **`'steam'` per Migration `20260531210000` ergänzt** (Thema 1c). `item_history.status in ('watching','completed','dropped')` — **kein `'planned'`**; Film+Spiel nutzen nur `completed` (binär).
- **TMDB = browser-side (CORS ok), Steam = NICHT.** TMDB setzt CORS-Header → direkter `fetch` wie AniList. Steam-Store-Endpoints blocken CORS hart → **Proxy**: dev über Vite (`server.proxy` `/steam-store` → `store.steampowered.com`, `vite.config.ts`), Prod über Edge Function (`supabase/functions/steam-proxy`, **deployed** + gehärtet: per-User-`getUser()`-Auth + CORS-Allowlist). `steam.ts → steamApiUrl` schaltet per `import.meta.env.DEV`. „SteamDB.info" ist Cloudflare-geschützt + ohne API → unbrauchbar; Steams *eigene* Store-Endpoints sind die Quelle.
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
