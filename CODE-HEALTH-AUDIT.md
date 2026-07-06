# Nakama — Code-Health-Audit & Aufräum-Plan

**Erstellt:** 2026-06-18 · **Methodik:** Multi-Agent-Audit (16 Agenten / 8 Dimensionen, jeder Befund adversariell ganz-Repo-gegengeprüft) → **23 Befunde, 0 False Positives**.

**Gesamturteil:** Codebasis ist **gesund und gepflegt**. Kein High-Severity-*Korrektheits*problem. Datei-lokaler toter Code ist durch `noUnusedLocals`/`noUnusedParameters` (tsconfig.app) bereits build-seitig abgedeckt — die Funde sitzen an der **Modulgrenze** (duplizierte Helfer, Starter-Reste, überflüssige Exports). Ein Duplikat ist nebenbei ein latenter Bug (`relTime`).

> **So weitermachen:** Stufen sind nach Risiko/Aufwand sortiert. Stufe 1 ist risikolos und sofort machbar; Stufe 2/3 brauchen kurzes Drüberschauen; Stufe 4 ist optionale Kosmetik. Jede Box = ein atomarer Commit (Vorschlag steht dabei). Nach Umsetzung: erledigte Bundles unten als Log-Zeile mit SHA nachziehen und den Pointer in `HEALTH.md` aktualisieren. **Vor dem Löschen jeweils kurz die genannte Stelle gegenchecken** (Zeilennummern sind Stand 2026-06-18 und können verrutschen).

**Legende:** 🔴 substanziell · 🟡 mittel · 🔵 gering · ⚪ kosmetisch/optional · ✋ bewusst NICHT anfassen

---

## Stufe 1 — Quick Wins (risikolos, sofort)

- [x] **🔴 `relTime`-Duplikat + Tagesgrenzen-Drift beheben** — `src/lib/queries/sharing.ts:147-161` · ✓ `850a116`
  Privates `relTime` löschen, stattdessen `relTime` aus `@/lib/format` importieren (`sharing.ts:3` importiert dort bereits `unique` → kostenlos). **Das ist nicht nur Duplikation, sondern ein Bug:** `format.ts` rechnet gegen lokale Mitternachtsgrenzen (kalender-korrektes „gestern"), `sharing.ts` nutzt `Math.round(diffHrs/24)` (rollender 24-h-Bucket). Dasselbe ~20 h alte Ereignis liest in Home „gestern", im Mitseher-/Transfer-Stempel „vor 20 Std." Verwendet in `sharing.ts:371` + `:501`. → nach Umstellung beide Flächen visuell gegenchecken.
  *Commit:* `fix(format): unify relTime, fix yesterday-vs-20h drift in sharing surfaces`

- [x] **🟡 Totes Vite-Starter-Stylesheet löschen** — `src/App.css` · ✓ `62ef5d4`
  War zwischenzeitlich per `.gitignore` neutralisiert (nie deployt); jetzt lokal gelöscht + gitignore-Sektion mit entfernt.

- [x] **🔵 Ungenutzte Starter-Assets löschen** — `src/assets/` + `public/icons.svg` · ✓ `62ef5d4`
  Wie oben: waren gitignored, jetzt endgültig weg.

- [x] **⚪ Tote Motion-Tokens entfernen** — `--dur-slow` entfernt · ✓ `6c5da31`
  **`--dur-fast` bleibt und ist inzwischen LIVE:** treibt `--animate-reveal-row` (P1-Touch-Paket, Review-U1) — das Finding war insoweit stale.

---

## Stufe 2 — Duplikation entkoppeln (kurzer Blick nötig)

- [ ] **🔴 Profil-Batch-Lookup (3×) in einen geteilten Helfer ziehen** — `src/lib/queries/home.ts:894-919`, `sharing.ts:120-145`, `notes.ts:98-120`
  Drei Funktionen mit identischer Supabase-Query (`select user_id,username,display_name,avatar_url` + `.in('user_id', ids)`), identischer Namensregel (`display_name → @handle → Jemand`) und strukturgleichem Rückgabetyp `{name, handle, avatarUrl}`. `notes.ts` ist byte-identisch bis auf den Log-String. `profile.ts:8` verweist per Kommentar bereits auf die Parallelität. Die app-weite Namensregel soll laut `handshake.md` an *einer* Stelle leben.
  *Vorschlag:* `profilesById(ids): Map<string, {name, handle, avatarUrl}>` nach `format.ts` oder neu `lib/queries/profiles-shared.ts`; alle drei durchrouten. ⚠️ Auf die getrennte Durchreichung von `name` vs `@handle` achten (UserChip-Anti-Spoofing, siehe handshake).
  *Stand 2026-07-06 (teil-erledigt):* `sharing.ts` exportiert `profilesById` inzwischen und `lists.ts` konsumiert es — aber `notes.ts:98` (private Kopie) + `home.ts:998` (`actorProfiles`) duplizieren weiter. Rest offen.
  *Commit:* `refactor(queries): extract shared profilesById lookup (home/sharing/notes)`

- [ ] **🔵 `dateLabel` in Calendar importieren statt inline** — `src/routes/Calendar.tsx:681-682`
  Baut `dateText` von Hand mit exakt dem Körper von `format.ts`' exportiertem `dateLabel(iso)`. Calendar importiert schon `MONTH_ABBR_3` aus `format.ts:35` → `dateLabel` ergänzen, Inline-Ausdruck durch `dateLabel(props.iso)` ersetzen, `MONTH_ABBR_3`-Import entfernen falls dann ungenutzt. (Calendar hält ein `Date` via `fromIsoDay` — Logik ist identisch.)
  *Commit:* `refactor(calendar): reuse format.dateLabel in day-pane header`

- [ ] **🔵 „gesehene episode_ids"-Set (3×) in lane-bewussten Helfer** — `src/lib/queries/calendar.ts:156-173`, `home.ts:492-508`, `episodes.ts:530-543`
  Drei nahezu identische Reads: `episode_watches.select('episode_id').eq('user_id',uid).is('list_item_id',null).in('episode_id',ids)` → `new Set(...)`. `episodes.ts` mit Lane-Ternär (Instanz vs global). *Vorschlag:* `watchedEpisodeSet(userId, episodeIds, listItemId?)`. ⚠️ CAP-1 (1000-Zeilen-Cap, siehe handshake §Daten/RLS) beim Helfer berücksichtigen. (Hinweis: `home.ts:533` ist KEINE 4. Kopie — separater „started"-Check über `item_id`s.)
  *Commit:* `refactor(queries): extract lane-aware watchedEpisodeSet helper`

- [ ] **🔵 Cover-Auflösungs-Upgrade über einen Dispatcher** — `ItemDetail.tsx:578-582`, `Home.tsx:541`, `Calendar.tsx:735`, `ListDetail.tsx:659`
  Zwei parallele Upgrader (`highResCover` anilist.ts:75, `steamHiResCover` steam.ts:72) werden an 4 Call-Sites von Hand gebrancht → **inkonsistente Schärfe**: ItemDetail upgradet nur Spiele (AniList nicht), Home/Calendar nur AniList, ListDetail-Row gar nicht. *Vorschlag:* `coverFor(type|source, url)` der je Typ dispatcht; alle vier durchrouten. Kosmetisch (Schärfe), kein Bug — behebt nebenbei die stumpfe ListDetail-Row.
  *Commit:* `refactor(cover): single coverFor() dispatcher, fix list-row sharpness`

- [ ] **⚪ Tag-Bucket-Label (Heute/Morgen/Demnächst) — nur falls 4. Kopie auftaucht** *(uncertain)* — `Home.tsx:595-605`, `ItemDetail.tsx:864-875`, `:1130-1137`
  Gleiches Skelett (`dayOffset` + `hasAirTime && airDateHasClock` → Offset 0/1/>1), aber die Call-Sites divergieren echt (Hero-Branch, Airtime-Append, `maxAheadDays`-Cap). Faltung lohnt nur bei einer 4. Kopie. **Vorerst belassen.**

---

## Stufe 3 — Größeres Refactor (separat besprechen)

- [ ] **🟡 `MoviePanel`/`GamePanel` Status-Gerüst teilen** — `src/routes/ItemDetail.tsx:1205-1270` / `:1453-1517`
  Beide Panels bis auf Details-Query + Inhaltsblock + Verb nahezu identisch: gleiche Seen-Query (`movieSeenOptions`), Mitseher-Query (`movieCoWatchersOptions`, gated auf `isShared+listId`), Release-Backfill-`createEffect`, Mutation (optimistic `setQueryData` + Rollback + invalidate) — teils zeichengleich. (Dass das Spiel die „movie"-Status-Schicht nutzt, ist Absicht — `status.ts` ist item-id-generisch.)
  *Vorschlag:* Hook `useBinaryStatusPanel(item, listId, isShared)` → `{ isDone, toggle, coWatchers, backfill }`; jedes Panel liefert dann nur noch Details-Query + Inhaltsblock + Verb. Mehr Aufwand → eigener Commit, gründlich testen (Film + Spiel, geteilt + privat).
  *Commit:* `refactor(item): extract useBinaryStatusPanel hook (movie/game)`

---

## Stufe 4 — Kosmetik (optional, nur „im Vorbeigehen")

- [ ] **⚪ Überflüssige Exports zu modul-lokal** — nur intern genutzte Symbole, könnten `export` verlieren:
  - Query-Key-Factories `continueWatchingKey`/`upcomingEpisodesKey`/`recentlyTickedKey` (`home.ts:27/29/31`), `calendarEventsKey` (`calendar.ts:36`) — Invalidierung läuft über die breiten `['home']`/`['calendar']`-Prefixe. ⚠️ Nur entkapseln, wenn **keine** granulare Invalidierung geplant ist.
  - `itemQueryKey` (`items.ts:34`), `ItemMetaRow` (`home.ts:847`).
  - Result-Typen `SubscribeResult` (`push.ts:60`), `UpdateProfileResult`/`SetUsernameResult` (`profile.ts:58/171`), `NoteKind` (`notes.ts:16`).
  - Komponenten-Typen `BadgeTone`/`ButtonVariant`/`CoverSpec`/`pageWindow`/`DestructiveBundle` (`Badge.tsx:14`, `Button.tsx:19`, `GeneratedCover.tsx:24`, `Pager.tsx:9`, `RowActions.tsx:32`). ⚠️ `coverSpecFromSeed` (Funktion) IST extern genutzt (`Styleguide.tsx:38/663`) — Export behalten.
  *Commit:* `chore(types): un-export module-local symbols`

- [ ] **⚪ Type-Smells im dev-only Styleguide** — `src/routes/Styleguide.tsx`
  - `children: any` an `Section`/`Row` (`:691`/`:745`) → durch `JSX.Element` bzw. `ParentProps<{...}>` ersetzen (wie `Badge.tsx:26`). Einzige `: any` im ganzen Baum.
  - `@ts-expect-error` (`:817`) am `NavMockButton`-`icon`-Prop → durch `Component<{ class?: string; strokeWidth?: number }>` typisieren (wie `NavButton.tsx:16`), dann Suppression weg. Einzige ts-Suppression in `src/`.
  *Commit:* `chore(styleguide): tighten children/icon prop types`

- [ ] **⚪ `--font-sans`-Override prüfen** — `src/index.css:308`
  Redundant: `font-sans`-Utility wird nie genutzt, `body:328` erzwingt `var(--font-geist-sans)` bereits app-weit. Grenzfall (definiert den globalen Default-Familien-Kontrakt) → Belassen ist harmlos. `--font-mono` ist echt live (236×). Niedrigste Priorität.

---

## ✋ Bewusst NICHT anfassen (kein toter Code — geparkt & dokumentiert)

- **`src/routes/Imprint.tsx`** — ruhender Impressum-Entwurf, absichtlich nicht geroutet (Datei-Header `:6-12` + `index.tsx:95-97` + handshake). Wartet auf „geschäftsmäßig?"-Klärung via DSB. **Behalten.**
- **`LegalLayout.Placeholder`** (`src/components/LegalLayout.tsx:60`) — nur von `Imprint.tsx` konsumiert, also transitiv „tot", solange Imprint geparkt ist. `LegalLayout`/`LegalSection` sind live (`/privacy`). Erst gemeinsam mit Imprint entfernen, falls die Impressum-Entscheidung endgültig negativ ausfällt.

---

## Erledigt (Log)

*(Beim Landen je Bundle eine Zeile nachziehen: Stufe/IDs · SHA · Outcome.)*

- **Stufe 1 komplett** (2026-07-06, Review-P2-Session) — `relTime` war bereits mit `850a116` (v0.15-Ära) vereinheitlicht; Starter-Reste (`App.css`/`src/assets`/`public/icons.svg`) endgültig gelöscht + gitignore-Sektion entfernt `62ef5d4`; `--dur-slow` raus `6c5da31` (`--dur-fast` bleibt — seit dem P1-Touch-Paket live via `--animate-reveal-row`).
