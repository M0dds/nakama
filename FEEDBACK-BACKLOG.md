# Nakama — Feedback-Backlog (Freunde, 2026-06-04)

18 Punkte aus dem Freundes-Feedback, kategorisiert und in Deployment-Batches sortiert.

**Legende:** 🐞 Bug · ✨ UX/Politur · 🎁 Feature · 🎨 Theme · ⚠️ braucht Entscheidung/Migration vor dem Bau

---

## Deployment-Plan (Vorschlag, in Reihenfolge)

### ✓ Release 1 — Feinschliff & Fixes  *(deployed 2026-06-04 als v0.7.0)*
Alle Punkte live. Zusätzlich on top: seitliche Content-Frame-Hairlines erscheinen nur noch oberhalb von `--content-max` (kein Strich mehr am Viewport-Rand). PwaUpdater-Leiche (0.6.0-Rest) entfernt.
- **F2** 🐞 Listen-Empty-State („Noch keine Einträge") nicht im Stil der anderen Empty-States + **falscher Text**.
- **F13** 🐞 „Auf Home tracken"-Beschreibung: Tracken/Archiv laufen als Fließtext ohne Umbruch → Umbrüche fixen.
- **F6** 🐞 Kalender: „nächster Monat"-Pfeil springt je nach Monatsnamen-Länge → Monatsname **3-Buchstaben-Abkürzung** (feste Breite).
- **F18** ✨ Episoden-Datum: aktuell nur Tag+Monat (verwirrt bei fertig releaseten Anime) → **Jahr ergänzen** (letzte 2 Stellen).
- **F14** ✨ Username im „Willkommen" der HeaderBar (Home) ergänzen.
- **F15** ✨ HeaderBar **sticky**.
- **F10** 🐞 PWA zeigt roten Header → soll sich **ans Theme anpassen** (`theme-color` dynamisch beim Theme-Wechsel).

### ✓ Release 2 — Themes & Theme-Picker  *(deployed 2026-06-04 als v0.8.0)*
Alle Punkte live. „Totoro" wurde dabei zu **„Komorebi"** umbenannt (id bleibt `totoro`). Zusätzlich on top: NavBar-/Floating-Schatten im Hell-Modus sichtbar gemacht (war near-invisible). Generierte Listen-Cover ziehen jetzt aus 9 Themes (einmaliges Neumischen, abgenickt).
- **F16** 🎨 Totoro-Theme: zu wenig Kontrast, Primary → **Mango-Gelb** o.Ä.
- **F17** 🎨 **Pond-Theme** ergänzen (Grün/Blau, Teich mit Wasserrosenblättern). ⚠️ Farben vorschlagen.
- **F8** ✨ Theme-Auswahl: Name wird teils abgeschnitten → **3 pro Reihe**, mehrere Reihen (v.a. in der Registrierung). Passt gut hierher, da Pond den Picker um ein 9. Theme erweitert.

### ✓ Release 3 — Listen & Item-Details  *(deployed 2026-06-04 als v0.9.0)*
Alle Punkte live. F4 wurde als **geteiltes Hover-Overlay** gebaut (oben hochladen, unten zurücksetzen) statt Button unter dem Cover; Reset behält den Seed. F12 holt Genre/Studio/Sender/Jahr **live** (AniList/TMDB). On top: **Push-Doppel-Subscription-Härtung** (`UNIQUE(endpoint)`, Migr. `20260604130000`) — das Doppel-Notification-Thema des Users war ein **2-Origin-Test-Artefakt** (localhost + Live), kein echter Bug für Freunde.
- **F3** 🐞 Beschreibung **persönlicher** Listen lässt sich nicht ändern.
- **F4** ✨ Listen-Cover **zurücksetzen** (Button) auf den generierten Default.
- **F11** ✨ Listen zeigen **max. 12 Items pro Seite** → Paging (`Pager`).
- **F12** 🎁 Unter „Details" von **Serien/Anime/Manga**: Genre, Publisher/Studio, Release-Datum ergänzen.

### ✓ Release 4 — Interaktion  *(deployed 2026-06-05 als v0.10.0)*
Alle Punkte live. F1 wurde dabei umgestaltet: statt zwei Checkboxen drei unabhängige Toggles im Footer-Button-Stil (Releases · Aktivität · Eigene; Auge offen/durchgestrichen = ein-/ausgeblendet) + Pager. „Aktivität" = Aktionen anderer Mitglieder, „Eigene" = eigene → saubere Partition (kein Overlap). F7 ist auf Zeigegeräte gegated (Touch behält Scrollen + Handle-Drag). On top: BottomNav-Klick-Bug gefixt — der vollbreite Wrapper schluckte Klicks neben der Pille.
- **F7** ✨ **Ganzes Item** per Drag & Drop bewegbar (nicht nur das Drag-Handle).
- **F5** ✨ AddSheet: hinzugefügtes Item **wieder entfernen** können (Fehlauswahl rückgängig).
- **F1** 🎁 Logbuch: oben zwei **Checkboxen** „Releases" + „Mitglieder-Aktivitäten" (wählen, was angezeigt wird) + **Paging** wie überall sonst. ⚠️ Mapping der Event-Arten klären.

### ✓ Release 5 — Listen-Kategorien  *(deployed 2026-06-14 als v0.11.0)*
Alle Punkte live — **damit ist der 18-Punkte-Backlog komplett.** Migration `20260605110000` (`lists.category` + CHECK) bereits gefahren. Design-Entscheidungen (siehe „Vor dem Bau"): (b) Kategorie nachträglich setzen → **dulden + warnen** (Toast nennt Anzahl betroffener Items), (c) Liste ohne Kategorie → bleibt in „Meine Listen", (d) AddSheet **lockt hart** auf die Kategorie, der Move-Dialog **warnt nur** (blockt nicht).
- **F9** 🎁 Kategorie pro Liste (Anime/Manga/Serien/Filme/Spiele): legt fest, was rein darf. Picker im Create-Form + owner-only Switcher auf der Detailseite. AddSheet in einer Liste wählt die Kategorie vor. **Übersicht neu sektioniert:** Default nur „Meine Listen" (privat+geteilt zusammen); kategorisierte Listen kriegen eigene Sections mit fortlaufender Nummerierung.

---

## ⚠️ Vor dem Bau zu klären

- **F9 (Kategorien):** (a) `lists.category`-Migration nötig. (b) Wenn man die Kategorie einer Liste mit gemischten Items nachträglich setzt — bestehende „falsche" Items rauswerfen, blocken oder dulden? (c) Liste **ohne** Kategorie → bleibt in „Meine Listen"? (d) Erzwingen wir die Kategorie hart beim Hinzufügen, oder nur Vorauswahl? — **Eigene Plan-/Design-Runde, bevor R5 startet.**
- **F1 (Logbuch-Filter):** Wie mappen die zwei Checkboxen auf die heutigen Event-Arten? Vorschlag: **„Releases"** = neue/verpasste Folgen-Releases (`missed` + Release-Events), **„Mitglieder-Aktivitäten"** = Watches/Hinzugefügt/Abschlüsse/Übergaben. Und wie kombiniert sich das mit dem bestehenden „Eigene ausblenden"-Toggle?
- **F4 (Cover-Reset):** Auf den generierten Default zurück (`cover_url` = null) — Seed beibehalten oder neu würfeln?
- **F17 (Pond):** Farbwerte (Light/Dark) schlage ich vor, du gibst grün/rot.

---

## Hinweise
- Reihenfolge-Logik: R1 (Bugs/Quick-Wins → sofort Wert für Freunde) → R2 (Themes, sichtbar, risikoarm) → R3 (Listen/Details) → R4 (Interaktion) → R5 (Kategorien, größter Brocken, Schema + eigene Planung).
- Jeder Release: kurzlebiger Branch → `main`, atomare Commits, **Localhost-Test vor Deploy**, Live-Verifikation + Changelog-Eintrag.
- Schöner Nebeneffekt: Schon **R1** ist der erste Deploy nach 0.6.0 → dabei siehst du das **stille Update-Badge** (statt Toast) zum ersten Mal in Aktion.
