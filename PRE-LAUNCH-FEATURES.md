# Nakama — Pre-Launch-Features (Plan)

**Stand 2026-06-04:** Die App ist **live** auf **https://usenakama.app** (Cloudflare Workers + Static Assets, Git-Auto-Deploy aus `main` via `M0dds/nakama`; SPA-Fallback über `wrangler.jsonc`, Node via `.nvmrc`; Build-Env-Vars `VITE_*` als Build-Variablen in Cloudflare; Supabase-Auth-Redirects auf `usenakama.app` gesetzt; Discord-Login getestet ✓). Test-User wurden gelöscht (frischer Start). **Vor der Weitergabe an Freunde** will der User noch diese vier Dinge — hier als Liste + Plan für die nächste Session.

---

## Liste (Reihenfolge = empfohlene Baufolge)

1. [x] **Versionierung** (S) — `feat/pre-launch-versioning`, erledigt 2026-06-04
2. [x] **Release Notes** (S–M) — erledigt 2026-06-04
3. [x] **PWA-Install-Guide** (M) — erledigt 2026-06-04
4. [~] **Push-Notifications** (L) — **Phase 1 LIVE (0.5.0)**: Opt-in-Toggle im Profil + Test-Versand, end-to-end verifiziert. **Phase 2 offen** (Auto-Versand bei neuen Folgen: Cron).

> Reihenfolge-Logik: #1 ist die Grundlage für #2 („was ist neu in v…"). #3 muss vor #4 stehen, weil iOS Web-Push **nur in der installierten PWA** erlaubt (s.u.).

### Erledigt 2026-06-04 (Branch `feat/pre-launch-versioning` → **in `main`, deployed**)

Entscheidungen dieser Session: Push → **verschoben**, Release-Notes-Quelle → **Code-Changelog**, Versionierung: **`0.1.0` = Launch-Baseline, dieses Update = `0.2.0`** (eigener Changelog-Eintrag, eigene Nummer).

- **#1 Versionierung** — `package.json` **0.2.0** (Baseline-Eintrag 0.1.0 = Launch); `vite.config.ts` `define` inlinet `__APP_VERSION__`/`__BUILD_DATE__`/`__GIT_SHA__`; `src/lib/version.ts` (`VERSION_LABEL`); Versions-Zeile im Profil-„Über"-Modul.
- **#2 Release Notes** — `src/lib/release-notes.ts` (Changelog, neueste zuerst, v0.1.0-Eintrag) + `compareVersions`/`latestNote`; `ReleaseNotesDialog` (eine Oberfläche, **scrollbares Akkordeon**: nur eine offen, aktuelle default; Header = Akzent-Punkt + Mono-Kicker „Release Notes"). Auto-Open in `AppShell` bei echtem Versions-Sprung über `nakama:last-seen-version`; **null-Key (Erstnutzer/Pre-Feature) seedet still, kein Popup**. Manuell über die Versionsnummer im Profil.
- **#3 PWA-Install-Guide** — `src/lib/pwa-install.ts` (fängt `beforeinstallprompt` beim App-Start in `App.tsx`, Plattform-Erkennung, `promptInstall`); `InstallGuide` (minimalistisch, body-only: 1-Klick-Button auf Chromium, iOS-Teilen→Home-Schritte als nummerierte Zeilen, „läuft schon"-State, Browser-Menü-Fallback links). **Als letzter `/setup`-Schritt** (Wunsch User: PWA-Empfehlung am Ende der Registrierung; STEPS 3→4) + `InstallDialog` (Kicker-Header) aus dem Profil. `apple-touch-icon`+Title in `index.html`.
- **Profil-Politur** — Version/Install aus schwebenden Footer-Buttons in ein eigenes **„Über"-Modul** (rechte Spalte, exakt Logbuch-Listen-Idiom: kein Strich unter Titel, eingerückte Hairline-Trenner, Hover stoppt an der Column-Guide). **„Benachrichtigungen"-Platzhalter** (Section 02, linke Spalte, „Demnächst"-Badge) für den verschobenen Push. **„Account löschen"** vom großen Akzent-Button zum dezenten Mono-Link (wie das „Abmelden"-Aside).

**Offen / Follow-ups:**
- Künftige Release-Notes-Einträge: oben in `RELEASE_NOTES` ergänzen, `version` == `package.json`-Version beim Deploy.

### Deploy-Historie (2026-06-04, alle live auf usenakama.app)
`0.2.0` Pre-Launch-Features (Versionierung/Release-Notes/Install) · `0.2.1` Install-Hotfix (Profil linksbündig, Firefox-Desktop-Hinweis) · `0.3.0` Update-Hinweis-Toast (registerType prompt + PwaUpdater) · `0.4.0` Steam-Suche live (steam-proxy deployed) + PNG-Icons + Politur · `0.4.1` robuster „Neu laden"-Handler (explizites skip-waiting + controllerchange + Backstop) · `0.5.0` **Push Phase 1** + Ghost-Delete-Button + Push-An/Aus-Segmented · `0.7.0`–`0.10.2` Freundes-Feedback-Backlog R1–R4 (+ Hotfixes; siehe `FEEDBACK-BACKLOG.md`) · `0.11.0` **Listen-Kategorien** (R5/F9 — Kategorie pro Liste, kategorie-gelockter AddSheet, sektionierte Übersicht; Migration `20260605110000` bereits gefahren) · `0.11.1` **Milchglas-Kopfzeile** (PageHeader app-weit `bg-bg/55` + `backdrop-blur-md`; Glas auf NavBar/Dialogs probiert + verworfen — Nav-Identität + Scrim verdeckt den Effekt) · `0.12.0` **Push Phase 2** (Auto-Push bei neuen Folgen: `notify-new-episodes`-Edge-Function + `pending_episode_notifications`-RPC + Dedup-Ledger + pg_cron alle 4 h; Migrationen `20260615110000`/`20260615120000` gefahren) · `0.13.0` **Datenschutz + Mitseher-Bilder + öffentliche Seiten** (Datenschutzerklärung `/privacy` via `LegalLayout`, Profil-„Über" + Footer-Links; **Impressum** als ruhender Entwurf `Imprint.tsx`, nicht geroutet, bis Pflicht via DSB geklärt; Mitseher als **Avatar-Stack** in `CoWatcherMark`; **`StandaloneShell`** vereinheitlicht Features/Datenschutz/Styleguide — geteilter Header/Footer, einheitliche `max-w-5xl`-Contentbreite, **„Zur App"-CTA**; NavBar-Zurück-Geist gefixt). · `0.14.0` **Verschieben aus geteilten Listen + E-Mail-Login** (synced Move erhält beidseitig Fortschritt via `unsync_item` + Confirm-Schritt; Magic-Link prod-live über Resend-SMTP; Migration `20260618100000` Heal-Fix gefahren). · `0.15.0` **Anzeige-Tag + Media-Proxy** (per-Lane Wochentag-Versatz fürs Verfügbarkeits-Signal, Picker auf Serie/Anime, lane-aware „Was kommt", Migration `20260623100000` gefahren; **Cloudflare-Worker als cachender Media-Proxy** unter `/api/media/*` — TMDB-Token server-seitig (`SEC-TMDB` geschlossen), geteilter Edge-Cache, CORS-frei, Abuse-Guard via `Sec-Fetch-Site`; `TMDB_TOKEN` als Worker-Secret gesetzt; + relTime-/Cover-Schärfe-Fixes). · `0.16.0` **App-Redesign** (true-sharp corners, tokenisiertes `.glass`, `CoverBackdrop`-Ambient-Layer auf allen eingeloggten Flächen, „Was kommt"-Karten neu). · `0.17.0` **Listen-Cover neu + Mitglieder-Gesichter** (Generated-Cover-System weich + theme-entkoppelt, Reroll auf der Detailseite, Member-/Invitee-Avatare auf der Übersicht, Listen-Cover als Default-Backdrop). · `0.18.0` **Mobile-Rework** (Review-P0+P1: lane-aware Row-Aktionen, Leave-Merge Migration `20260703100000`, Magic-Link-Fehlerpfad, „⋯"-Touch-Steuerung + immer sichtbarer Drag-Griff, `QueryErrorCard` an den Query-Gates, Dialog-Fokus; **AddSheet-Suche mobil TOP-verankert** mit Tastatur-Auto-Open — iOS-26-Keyboard-Saga, siehe `AddSheet.tsx`-Kommentare; **CoverBackdrop als Canvas-Bake** gegen PWA-Tab-Wechsel-Freezes; ≥16px-Input-Regel gegen iOS-Zoom; Update-Reload-Spinner; Fortsetzen-Mobile-Row entrümpelt).

### Push Phase 1 — gebaut & live (0.5.0)
- **VAPID**-Paar erzeugt; Public-Key Client-Konstante (`queries/push.ts`), Private-Key + Subject als **Supabase-Secrets**.
- **`push_subscriptions`**-Tabelle (Migration gefahren) · RLS own-only.
- **SW-Handler** `public/push-sw.js` (push→showNotification, click→focus/open) via `workbox.importScripts` (bleibt generateSW).
- **`send-push`** Edge-Function (Deno + `npm:web-push`, VAPID-signiert, caller-auth, 410-Cleanup) — **deployed**. CORS-Allowlist erweitert um `localhost:5173/4173` fürs Preview-Testen.
- **UI** `PushSettings` (An/Aus-Segmented + „Test senden"; iOS-/denied-/unsupported-States).
- **Gotcha gelöst:** „Test gesendet"/FCM `201`, aber keine Anzeige — lag NICHT am Code. Chromes Push-Empfangs­verbindung (`chrome://gcm-internals` → `CONNECTING` statt `CONNECTED`) hing; **Chrome-Neustart** → alle gepufferten Pushes kamen. Reines Umgebungs-/Netz-Thema.

### Offen
- **Push Phase 2:** Auto-Versand bei neuen Folgen (Cron + „neue Folge"-Erkennung wie beim Badge wiederverwenden). Der nächste große Brocken.
- **PWA-Icons** als designtes Asset (der Hinomaru-Stopgap aus 0.4.0 läuft; ersetzbar).
- ~~**Resend-Domain** für E-Mail/Magic-Link-Login~~ → ✓ **erledigt 2026-06-18**: Magic-Link prod-live über Custom SMTP via verifizierte Resend-Domain (`noreply@usenakama.app`), End-to-end getestet. Details → handshake §Offene Punkte; DE-Template in `supabase/email-templates/magic-link.html`.
- **Deploy-Nebenwirkung:** Jeder Push nach `main` ändert den Bundle-Hash (`__GIT_SHA__` inlined) → triggert den „Neue Version"-Toast, **auch bei reinen Docs-Commits**. Darum Docs-only nicht einzeln pushen (sonst Fehl-Toast ohne echte Änderung) — mit dem nächsten Versions-Deploy mitnehmen. Siehe Memory `git-sha-triggers-update-toast`.

---

## ⚠️ Offene Entscheidungen — ZU BEGINN der nächsten Session klären

Der User wollte die Fragen erst klären, nicht direkt beantworten — also offen:

1. **Push-Umfang** — (a) *Phase 1 jetzt:* Erlaubnis-Abfrage + Subscriptions speichern, Versand später · (b) *Voll:* inkl. VAPID + Edge-Function + Cron-Auto-Versand bei neuen Folgen · (c) *Später:* erst #1–#3 ausliefern. **Empfehlung: (a).**
2. **Release-Notes-Quelle** — im Code gepflegt (Changelog-Datei, Update = Deploy) **[Empfehlung]** vs. DB-Tabelle (ohne Deploy editierbar, braucht Schema).
3. **Start-Versionsnummer** — `package.json` steht auf `0.0.0`. Vorschlag: `0.1.0` (Beta-Phase mit Freunden) oder `1.0.0`.

---

## Feature-Details

### 1 · Versionierung (S)
- **Ziel:** App-Version + Build-Info dezent sichtbar (z. B. Profil-Footer `v0.1.0 · 2026-06-04`).
- **Ansatz:** Vite `define` injiziert `__APP_VERSION__` aus `package.json` + Build-Datum (+ optional kurzer Git-SHA) ins Bundle. `package.json`-Version auf Startwert setzen.
- **Anzeige:** kleiner Mono-Text im Profil (und/oder Styleguide). Klick könnte später die Release Notes öffnen.
- **Liefert die Basis für #2** (Versions-Vergleich fürs „Was ist neu").

### 2 · Release Notes (S–M)
- **Ziel:** „Was ist neu"-Verlauf; bei einer neuen Version **einmalig automatisch** anzeigen.
- **Mechanik:** zuletzt gesehene Version in `localStorage` (`nakama:last-seen-version`); ist die aktuelle App-Version neuer → Modal/Toast „Neu in v…". Manuell aufrufbar (z. B. über die Versionsnummer im Profil).
- **Inhalt:** je nach Entscheidung — Changelog-Datei im Code (`src/lib/release-notes.ts`, Array `{version, date, changes[]}`) **[Empfehlung]** oder DB-Tabelle.
- **Neuer Screen** (Modal oder `/changelog`) — bewusst geplant (CLAUDE.md „vor neuen Screens fragen" → hier dokumentiert/entschieden).

### 3 · PWA-Install-Guide (M)
- **Ziel:** Hinweis + Anleitung, die Seite als App zu installieren (PC / iOS / Android).
- **Plattform-Erkennung** → passende Anleitung:
  - **Android/Chrome + Desktop:** `beforeinstallprompt`-Event abfangen → eigener **„Installieren"-Button** (1-Klick).
  - **iOS/Safari:** kein Auto-Prompt möglich → manuelle Schritt-Anleitung „**Teilen → Zum Home-Bildschirm**" (mit Icons).
- **Platzierung:** eigene Seite/Modal (`/install`), Einstieg aus dem Onboarding + ein Button im Profil; optional dezenter, dismissbarer Banner.
- **Vorab prüfen:** Manifest/Icons sind install-tauglich (Name, Icon-Größen, `theme_color`, `display: standalone`) — liegt in `vite.config.ts` (`VitePWA`).

### 4 · Push-Notifications (L) — gephased

**Harte Fakten, die den Plan bestimmen:**
- 🍎 **iOS erlaubt Web-Push nur in der installierten PWA** (ab iOS 16.4, vom Home-Bildschirm). Im Safari-Tab ist die Permission-API nicht verfügbar → „bei Registrierung abfragen" geht auf **Desktop/Android** direkt, auf **iOS erst nach Installation** (→ Abhängigkeit zu #3).
- **Versand braucht Infrastruktur:** VAPID-Schlüsselpaar, `push_subscriptions`-Tabelle (**Schema → vorher fragen/anlegen**), Edge-Function zum Senden (web-push-Protokoll), und ein **Cron**, der neu erschienene Folgen erkennt und auslöst (der schwerste Teil).

**Phase 1 — Erlaubnis + Subscriptions (medium):**
- VAPID-Keypair erzeugen (Public-Key im Client, Private-Key als Edge-Secret).
- `push_subscriptions`-Tabelle (`user_id`, `endpoint`, `p256dh`, `auth`, `created_at`) + RLS (nur eigene Zeilen) + Realtime nicht nötig. **Migration → ankündigen.**
- **Onboarding-Schritt** im `/setup`-Wizard, plattform-bewusst:
  - Desktop/Android: `Notification.requestPermission()` → bei „granted" `pushManager.subscribe()` → Subscription speichern.
  - iOS im Browser: Hinweis „erst installieren" (Link zu #3), Push danach in der installierten PWA aktivierbar.
- Service-Worker um `push`/`notificationclick`-Handler erweitern (vite-plugin-pwa nutzt `generateSW` → ggf. `injectManifest`-Modus oder zusätzlicher SW-Code prüfen).

**Phase 2 — Versand (large, separater Schritt):**
- Edge-Function `send-push` (VAPID-signiert).
- Auslöser: Cron (Supabase Scheduled Function / `pg_cron` / extern), der neu **released** Folgen getrackter Items je User findet → an dessen Subscriptions sendet. Definition wie beim „Neue Folge"-Badge (14-Tage/released-ungesehen) wiederverwenden.
- Inhalt + Deep-Link aufs Item; abgelaufene Endpoints (HTTP 410) aufräumen.

---

## Abhängigkeiten / Notizen
- **#3 vor #4** (iOS-Push braucht installierte PWA).
- **Onboarding** (`/setup`) bekommt durch #4 (und ggf. #3-Hinweis) neue Schritte — Wizard-Flow entsprechend erweitern.
- **E-Mail-Release-Benachrichtigungen** (Backlog #11) sind ein *separater* Pfad (hängt an der Resend-Domain, siehe `handshake.md`) — **nicht** Teil dieses Plans.
- Service-Worker-Strategie für Push checken: `vite-plugin-pwa` läuft aktuell auf `generateSW` (`registerType: autoUpdate`); Push-Handler brauchen evtl. `injectManifest` oder einen zusätzlichen importierten SW-Teil.

---

## Service-Hinweis für die nächste Session
1. Mit den **3 offenen Entscheidungen** starten (oben).
2. Dann der Reihe nach #1 → #2 → #3 → (#4 je nach Entscheidung).
3. Bauen wie üblich: kurzlebiger Feature-Branch → `main`; **Push nach `main` löst Auto-Deploy auf `usenakama.app` aus** (also bewusst pushen). Atomare Commits.
4. Vor Schema-Änderung (#2-DB-Variante, #4 `push_subscriptions`) Migration ankündigen + SQL liefern.
