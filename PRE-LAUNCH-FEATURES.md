# Nakama — Pre-Launch-Features (Plan)

**Stand 2026-06-04:** Die App ist **live** auf **https://usenakama.app** (Cloudflare Workers + Static Assets, Git-Auto-Deploy aus `main` via `M0dds/nakama`; SPA-Fallback über `wrangler.jsonc`, Node via `.nvmrc`; Build-Env-Vars `VITE_*` als Build-Variablen in Cloudflare; Supabase-Auth-Redirects auf `usenakama.app` gesetzt; Discord-Login getestet ✓). Test-User wurden gelöscht (frischer Start). **Vor der Weitergabe an Freunde** will der User noch diese vier Dinge — hier als Liste + Plan für die nächste Session.

---

## Liste (Reihenfolge = empfohlene Baufolge)

1. [x] **Versionierung** (S) — `feat/pre-launch-versioning`, erledigt 2026-06-04
2. [x] **Release Notes** (S–M) — erledigt 2026-06-04
3. [x] **PWA-Install-Guide** (M) — erledigt 2026-06-04
4. [ ] **Push-Notifications** (L) — **verschoben** (Entscheidung 2026-06-04: erst #1–#3 ausliefern)

> Reihenfolge-Logik: #1 ist die Grundlage für #2 („was ist neu in v…"). #3 muss vor #4 stehen, weil iOS Web-Push **nur in der installierten PWA** erlaubt (s.u.).

### Erledigt 2026-06-04 (Branch `feat/pre-launch-versioning` → **in `main`, deployed**)

Entscheidungen dieser Session: Push → **verschoben**, Release-Notes-Quelle → **Code-Changelog**, Versionierung: **`0.1.0` = Launch-Baseline, dieses Update = `0.2.0`** (eigener Changelog-Eintrag, eigene Nummer).

- **#1 Versionierung** — `package.json` **0.2.0** (Baseline-Eintrag 0.1.0 = Launch); `vite.config.ts` `define` inlinet `__APP_VERSION__`/`__BUILD_DATE__`/`__GIT_SHA__`; `src/lib/version.ts` (`VERSION_LABEL`); Versions-Zeile im Profil-„Über"-Modul.
- **#2 Release Notes** — `src/lib/release-notes.ts` (Changelog, neueste zuerst, v0.1.0-Eintrag) + `compareVersions`/`latestNote`; `ReleaseNotesDialog` (eine Oberfläche, **scrollbares Akkordeon**: nur eine offen, aktuelle default; Header = Akzent-Punkt + Mono-Kicker „Release Notes"). Auto-Open in `AppShell` bei echtem Versions-Sprung über `nakama:last-seen-version`; **null-Key (Erstnutzer/Pre-Feature) seedet still, kein Popup**. Manuell über die Versionsnummer im Profil.
- **#3 PWA-Install-Guide** — `src/lib/pwa-install.ts` (fängt `beforeinstallprompt` beim App-Start in `App.tsx`, Plattform-Erkennung, `promptInstall`); `InstallGuide` (minimalistisch, body-only: 1-Klick-Button auf Chromium, iOS-Teilen→Home-Schritte als nummerierte Zeilen, „läuft schon"-State, Browser-Menü-Fallback links). **Als letzter `/setup`-Schritt** (Wunsch User: PWA-Empfehlung am Ende der Registrierung; STEPS 3→4) + `InstallDialog` (Kicker-Header) aus dem Profil. `apple-touch-icon`+Title in `index.html`.
- **Profil-Politur** — Version/Install aus schwebenden Footer-Buttons in ein eigenes **„Über"-Modul** (rechte Spalte, exakt Logbuch-Listen-Idiom: kein Strich unter Titel, eingerückte Hairline-Trenner, Hover stoppt an der Column-Guide). **„Benachrichtigungen"-Platzhalter** (Section 02, linke Spalte, „Demnächst"-Badge) für den verschobenen Push. **„Account löschen"** vom großen Akzent-Button zum dezenten Mono-Link (wie das „Abmelden"-Aside).

**Offen / Follow-ups:**
- **PWA-Icons:** Manifest + `apple-touch-icon` referenzieren nur `favicon.svg`. Für scharfes Home-Screen-Icon (v.a. ältere iOS) echte PNGs (180×180 Apple, 192/512 Android maskable) nach `/public` legen + in `vite.config.ts`-Manifest/`index.html` verdrahten. Design-Asset → User.
- Künftige Release-Notes-Einträge: oben in `RELEASE_NOTES` ergänzen, `version` == `package.json`-Version beim Deploy.
- **Push (#4)** bleibt der nächste große Brocken (der Platzhalter im Profil wird dann der echte Toggle).

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
