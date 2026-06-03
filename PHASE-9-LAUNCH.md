# Nakama — Phase 9: Launch-Checkliste

Der Weg vom lokalen `main` zum ersten öffentlichen Deploy. Abhaken in Reihenfolge —
die Blöcke bauen aufeinander auf. Status-Quelle bleibt `handshake.md`; diese Datei
ist die operative Deploy-Liste.

> **Rollen:** 🧑 = du machst es (Ops/Config/Entscheidung) · 🤖 = ich kann es im Repo umsetzen · 🧑🤖 = gemeinsam (du führst aus, ich liefere Code/SQL).

---

## 0 · Entscheidungen (zuerst — sie prägen den Rest)

- [ ] 🧑 **Hosting-Anbieter wählen.** Nakama ist eine statische Vite-SPA + PWA → jeder Static-Host reicht. Empfehlung (alle können SPA-Fallback + HTTPS + Env-Vars out of the box):
  - **Cloudflare Pages** — kostenlos, schnell, einfach. *(Empfehlung)*
  - **Netlify** / **Vercel** — genauso tauglich, etwas mehr Komfort-UI.
  - Build-Command überall: `npm run build` · Output-Verzeichnis: `dist`
- [ ] 🧑 **Domain entscheiden.** Eigene Domain (z. B. `nakama.deinedomain.de`) oder erstmal die Host-Subdomain (`nakama.pages.dev`)? Die Wahl bestimmt mehrere Einträge unten (Auth-Redirects, CORS, Discord).
- [ ] 🧑 **`origin`-Push klären.** Lokales `main` ist ~200 Commits vor `origin` (bewusst nie gepusht). Vor/zum Launch entscheiden, ob gepusht wird. *(Outward-facing — nur auf deine explizite Zustimmung.)*

---

## 1 · Datenbank absichern & reproduzierbar machen

- [x] 🧑 **Alle 27 Migrationen gefahren + bestätigt.** *(erledigt)*
- [ ] 🧑🤖 **SEC-BASELINE — RLS-Modell in dieses Repo holen.** Die Basis-Policies + Helfer (`is_list_member`, `shares_list_with`, …) leben nur im Logbook-Repo. Für Reproduzierbarkeit: Live-DB-Schema per `pg_dump --schema-only` (oder Supabase-Export) ziehen → ich gieße es in **eine** self-contained Baseline-Migration in `supabase/migrations/`. *(HEALTH `SEC-BASELINE`)*
- [ ] 🧑 **DB-Verifikation.** Kurz prüfen, dass die Live-DB exakt dem Migrations-Stand entspricht (keine ad-hoc im SQL-Editor gemachten, undokumentierten Objekte mehr offen).

---

## 2 · Supabase-Projekt für Produktion konfigurieren

- [ ] 🧑 **Auth → URL Configuration.** Die Prod-Domain als **Site URL** setzen + unter **Redirect URLs** eintragen (sonst schlägt Login/Magic-Link in Prod fehl):
  - `https://<prod-origin>/auth/callback`
  - `https://<prod-origin>` (Site URL)
- [ ] 🧑 **Discord OAuth.** Im Discord Developer Portal die **Redirect-URI** der Supabase-Callback-URL hinzufügen (`https://<project-ref>.supabase.co/auth/v1/callback`) — und prüfen, dass der `email`-Scope aktiv ist (ist im Code gesetzt).
- [ ] 🧑 **E-Mail-Prod (Resend).** Magic-Link-Fallback + „Confirm email" brauchen eine **verifizierte Resend-Domain** (sonst sendet Resend nur an die eigene Konto-Adresse → derzeit zum Testen deaktiviert, Supabase-Mailer-Fallback ~4 Mails/Std). Vor echten Nutzern: Resend-Domain verifizieren + **„Confirm email" anschalten**. *(handshake §Offene Punkte → E-Mail-Prod)*

---

## 3 · SPA deployen

- [ ] 🧑 **Repo mit dem Host verbinden** (oder manuell `npm run build` + `dist/` hochladen).
- [ ] 🧑 **Environment-Variablen im Host setzen** (alle `VITE_`-prefixed, dürfen ins Bundle — sind öffentlich gedacht):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_TMDB_TOKEN` *(read-only, low-risk — SEC-TMDB; optional später über Edge-Function proxyen)*
- [ ] 🧑 **SPA-Fallback aktivieren** — der Host muss für **alle** Pfade `index.html` ausliefern (Solid Router ist client-seitig; sonst geben Deep-Links wie `/lists/...` einen 404). Cloudflare Pages/Netlify/Vercel machen das für Vite-SPAs automatisch bzw. per 1-Zeilen-Regel.
- [ ] 🧑 **HTTPS** — Pflicht für die PWA/Service-Worker. Bei allen genannten Hosts automatisch.

---

## 4 · Steam-Proxy deployen *(SEC-DEPLOY)*

> Reihenfolge wichtig: **erst** Secret, **dann** Deploy — ohne Secret blockt CORS bewusst alles.

- [ ] 🧑 `npx supabase secrets set ALLOWED_ORIGINS="https://<prod-origin>"`
- [ ] 🧑 `npx supabase functions deploy steam-proxy --project-ref <ref>`
- [ ] 🧑 Spiele-Suche in Prod testen (greift dann die gehärtete Function: User-Auth + CORS-Pin).

---

## 5 · PWA verifizieren

- [ ] 🧑 **Manifest + Icons** prüfen (Name, Theme-Color, Icons in allen nötigen Größen — liegt in `vite.config.ts`).
- [ ] 🧑 **„Installieren"-Prompt** auf Mobile/Desktop testen; App im Standalone-Modus öffnen.
- [ ] 🧑 **Service-Worker** lädt + cached die statischen Assets (kein Stale-Problem nach Update — vite-plugin-pwa nutzt `generateSW`).

---

## 6 · Prod-Smoke-Test (nach dem ersten Deploy)

- [ ] 🧑 **Login** per Discord **und** Magic-Link (beide landen auf `/auth/callback`).
- [ ] 🧑 **First-Login-Setup** (`/setup`) durchlaufen — Handle + Anzeigename + Avatar.
- [ ] 🧑 **Liste anlegen**, Item hinzufügen (alle 3 Quellen: Anime/AniList, Serie+Film/TMDB, Spiel/Steam).
- [ ] 🧑 **Episoden ticken** + **Sync** mit einem zweiten Test-Account in einer geteilten Liste.
- [ ] 🧑 **Realtime** prüfen: Tick im einen Account erscheint live im anderen.
- [ ] 🧑 **Notizen** (Text + Link), **Cover-Upload**, **Profil/Theme** kurz antesten.

---

## Offen / bewusst zurückgestellt (kein Launch-Blocker)

- **SEC-TMDB** — TMDB-Token im Bundle (low, read-only). Optional: später wie Steam proxyen.
- **#13 Push Notifications** — Release-Erinnerungen via Web-Push (großes Feature, post-Launch).
- **#11 E-Mail-Benachrichtigungen** — hängt an der Resend-Domain (siehe 2).
- **Features-Landingpage-Rework** — bewusst ans Ende der Kette gelegt.
- Diverse Quellen-Lags (Episodentitel, Steam-Fuzzy-Daten, TMDB-DE-Release-Tag) — best-effort, dokumentiert in `handshake.md`/`HEALTH.md`.
