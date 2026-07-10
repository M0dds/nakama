// The "Was ist neu"-Verlauf — a hand-curated changelog, newest first. Update =
// deploy (the code-changelog choice over a DB table; no schema, ships with the
// build that introduces the changes).
//
// On every app load we compare APP_VERSION against the version the user last
// saw (localStorage `nakama:last-seen-version`); if it moved forward and an
// entry exists for the new version, the ReleaseNotesDialog auto-opens once. The
// version label in the profile footer reopens it manually any time.
//
// Convention: `version` MUST match the `package.json` version that shipped it,
// so the "is this newer than last seen?" comparison lines up. Keep `changes`
// short and user-facing (what changed for them, not the commit subject).

export interface ReleaseNote {
  /** Matches package.json version at ship time, e.g. "0.1.0". */
  version: string;
  /** ISO date "YYYY-MM-DD". */
  date: string;
  /** Optional one-line headline shown under the version. */
  title?: string;
  /** User-facing bullet points. */
  changes: string[];
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.23.0",
    date: "2026-07-10",
    title: "Der Kalender, neu fürs Handy",
    changes: [
      "Der Kalender ist am Handy neu gebaut: Die Woche zeigt ihre Folgen jetzt direkt als Liste mit Covern — und nur die Tage, an denen wirklich etwas läuft.",
      "Oben führt ein Wochen-Dial: Wischen wechselt die Woche, jeder Tag trägt einen Status-Punkt (verpasst, gesehen, kommt noch), heute ist markiert.",
      "Ein Tipp aufs Dial öffnet den Monat als Karte von unten — auch er lässt sich durchwischen, und ein Tipp auf einen Tag springt direkt in dessen Woche. Die separate Monats-Ansicht braucht es am Handy damit nicht mehr.",
      "Die Cover-Bühne der Titel- und Listen-Seiten gleitet beim Scrollen jetzt sanft mit (Parallax) — und die Bild-Aussetzer beim schnellen Scrollen sind behoben. Hinter dem Inhalt liegt wieder durchgehend das Cover hinter Milchglas.",
    ],
  },
  {
    version: "0.22.0",
    date: "2026-07-09",
    title: "Mobil neu gedacht — das Cover als Bühne",
    changes: [
      "Titelseiten auf dem Handy neu: Das Cover füllt die volle Breite und liegt fest im Hintergrund — beim Scrollen schiebt sich der Inhalt wie eine Glasscheibe darüber, hinter der das Cover weich verschwimmt. Die Folgen stehen jetzt direkt oben; Details und Notizen sind eingeklappt, ein Tipp öffnet sie.",
      "Listen-Seiten bekommen denselben Auftritt — mit dem Listen-Cover als Bühne. Das Cover ändern (Hochladen, Neu würfeln, Zurücksetzen) geht mobil jetzt über Buttons unter „Details“.",
      "Bereiche lassen sich mobil einklappen: die drei Startseiten-Bereiche und die Kategorie-Abteile der Listenübersicht — letztere auch am Desktop. Was du zuklappst, bleibt zu, auch beim nächsten Besuch.",
      "Die Aktionen oben rechts auf der Titelseite klappen auf dem Handy hinter „⋯“ auf, wie in den Listen — außer es wäre nur ein einzelnes Icon versteckt, dann bleibt es direkt sichtbar. Lange Titel kürzen sich jetzt mit „…“ statt die Kopfzeile umzubrechen.",
      "Als installierte App nutzt Nakama jetzt den ganzen Bildschirm: Das Cover läuft bis unter die Statusleiste, die Navigation macht dem Home-Indikator Platz. (Dafür die App einmal neu zum Home-Bildschirm hinzufügen.)",
      "Generierte Listen-Cover rendern jetzt in voller Schärfe — großflächig wirkten sie vorher matschig.",
      "Beim Hinzufügen zeigt die Listen-Auswahl jetzt die Kategorie — zwei gleichnamige Listen sind endlich unterscheidbar.",
    ],
  },
  {
    version: "0.21.0",
    date: "2026-07-08",
    title: "Nakama stellt sich vor",
    changes: [
      "Neu: usenakama.app hat eine richtige Startseite — wer nicht eingeloggt ist, bekommt jetzt eine Tour statt des Login-Formulars: Sie fragt nach deinem Namen, lässt dich ein Theme wählen (das bis in die App mitkommt) und erzählt, was Nakama kann — inklusive einer Folge, die man probeweise abhaken darf.",
      "Für dich ändert sich nichts: Eingeloggt landest du auf usenakama.app wie immer direkt in der App. Aber wenn du jemanden einladen willst — der Link reicht jetzt als Erklärung.",
    ],
  },
  {
    version: "0.20.0",
    date: "2026-07-07",
    title: "Serien-Pausen im Blick & Aktionen am Titel",
    changes: [
      "Neu: Titel in Staffelpause verschwinden nicht mehr aus „Was kommt“ — steht die nächste Folge erst in ein paar Wochen an, erscheint sie jetzt als ruhiger Eintrag am Ende („in 5 Wochen“). Weit entfernte Film- und Spiel-Termine zeigen ebenso die Distanz statt eines Datums ohne Jahr.",
      "Neu: Zurücksetzen, Verschieben und Aus-der-Liste-Entfernen gibt es jetzt auch direkt auf der Titelseite, oben rechts. Nach dem Verschieben folgst du dem Titel automatisch in die neue Liste.",
      "Neu: „Gesynct in“ — öffnest du einen Titel ohne Listen-Kontext (z. B. über die Suche oder „Was kommt“), zeigt seine Seite jetzt, in welchen Listen ihr ihn gemeinsam schaut: mit Cover, Mitgliedern und eurem Stand. Ein Tipp wechselt hinüber.",
      "Verfolgt ihr einen Titel nur gemeinsam (synchronisiert), öffnet ihn „Was kommt“ jetzt direkt in seiner Liste — vorher landete man auf dem eigenen, ungeteilten Stand.",
      "Verschieben bestätigt jetzt mit einer Meldung; ein Tipp darauf bringt dich in die Ziel-Liste. Meldungen mit Aktion sind generell komplett antippbar, die Aktion steht unter dem Text.",
      "Der Anzeige-Tag (selbst gewählter Wochentag für neue Folgen) ist wieder raus — er hat mehr verwirrt als geholfen. Alle Termine zeigen wieder das echte Release-Datum.",
    ],
  },
  {
    version: "0.19.0",
    date: "2026-07-07",
    title: "Was jetzt? — Als Nächstes & Abschluss-Momente",
    changes: [
      "Neu: „Als Nächstes“ — bist du überall aufgeholt, zeigt die Startseite jetzt ein Cover-Regal mit noch nicht begonnenen Titeln aus deinen Listen, angepinnte zuerst. Ein Tipp aufs Cover zeigt den Titel, ein zweiter öffnet ihn direkt in seiner Liste.",
      "Neu: Abschluss-Momente — hakst du die letzte Folge einer beendeten Serie ab (auch Anime & Manga), steht im Logbuch jetzt „Du hast … abgeschlossen“; in synchronisierten Listen gilt der Abschluss für alle Mitglieder. Bereits früher beendete Titel holen sich den Status still nach, sobald du ihre Detailseite öffnest.",
      "Abgeschlossenes ist in Listen jetzt dezent markiert — „Abgeschlossen“ bei Serien, Anime & Manga, „Gesehen“ bei Filmen, „Gespielt“ bei Spielen.",
      "Release-Uhrzeiten sind raus: Eine Folge gilt ab ihrem Erscheinungs-Tag als verfügbar und lässt sich ab dann abhaken — kein „Heute · 17:00“ mehr, das dem Abhaken im Weg stand.",
      "Hast du für eine Serie einen Anzeige-Tag gewählt, zeigt jetzt auch die Episodenliste diese Termine — vorher stand dort das Original-Datum, im Widerspruch zu „Was kommt“ und Kalender.",
      "Öffnest du einen Titel aus einer Liste, steht in der Kopfzeile jetzt der Listenname über dem Titel statt der Medienart.",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-07-06",
    title: "Nakama am Handy — rundum besser",
    changes: [
      "Neu: Listen lassen sich jetzt komplett am Handy verwalten — der „⋯“-Knopf am Rand jeder Zeile zeigt Anpinnen, Zurücksetzen, Verschieben und Entfernen; der Griff zum Umsortieren ist immer sichtbar.",
      "Die Suche ist am Handy neu gebaut: Sie öffnet jetzt oben am Bildschirm, die Tastatur geht automatisch mit auf und bleibt beim Hinzufügen offen — kein Springen, Verrutschen oder ungewolltes Zoomen mehr.",
      "Die installierte App wechselt deutlich flotter zwischen den Seiten — der weiche Cover-Hintergrund wird jetzt einmalig vorberechnet statt bei jedem Wechsel neu.",
      "„Fortsetzen“ ist am Handy aufgeräumter: Neben dem Titel steht nur noch der Zähler, alles Weitere sammelt sich ordentlich in der Zeile darunter.",
      "Klappt beim Laden etwas nicht (z. B. ohne Netz), sagt die App das jetzt ehrlich — mit „Nochmal versuchen“ statt einer leeren Seite.",
      "Ein Tipp auf „Neu laden“ bei einem Update zeigt jetzt sofort, dass die neue Version lädt.",
      "Feinschliff: keine überflüssige Trennlinie mehr unter dem letzten Listen-Eintrag; Dialoge sind besser mit Tastatur und Screenreader bedienbar.",
    ],
  },
  {
    version: "0.17.0",
    date: "2026-07-01",
    title: "Neue Listen-Cover & Mitglieder-Gesichter",
    changes: [
      "Neu: Die generierten Listen-Cover sind komplett überarbeitet — weiche Farbverläufe mit dezenten Mustern und feiner Körnung statt der harten geometrischen Muster, deutlich abwechslungsreicher (jede Liste bekommt ihren eigenen Look) und in hellem wie dunklem Modus gleich.",
      "Neu: Gefällt dir das Cover einer Liste nicht? Fahr auf der Detailseite über das Cover und würfle mit „Neu würfeln“ ein frisches — oder lad wie gewohnt ein eigenes Bild hoch.",
      "In der Listen-Übersicht zeigen geteilte Listen jetzt die Profilbilder ihrer Mitglieder statt des Worts „geteilt“; private Listen bleiben schlicht.",
      "Öffnest du eine Liste, nimmt ihr Cover jetzt sanft den Seitenhintergrund auf — beim Überfahren der Einträge wechselt er zum jeweiligen Titel.",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-06-30",
    title: "Frisches Design mit Cover-Tiefe",
    changes: [
      "Neu: Das Cover des Titels, auf den du dich gerade konzentrierst, schimmert jetzt als sanfter, unscharfer Hintergrund hinter der ganzen Seite — auf der Startseite, in Listen, im Kalender, auf Detailseiten und im Profil. Beim Überfahren der Einträge wandert er weich mit.",
      "Frischeres, ruhigeres Erscheinungsbild: durchgehend klare, scharfe Kanten — die App wirkt aufgeräumter und materialbetonter.",
      "Die „Was kommt“-Karten zeigen das Cover jetzt vollflächig, mit einer kompakten Info-Leiste darunter.",
      "Die Milchglas-Kopfzeile läuft jetzt randlos über die volle Breite und passt sich der Hintergrund-Helligkeit an, statt als dunkleres Band zu wirken.",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-06-25",
    title: "Anzeige-Tag & schnellere Suche",
    changes: [
      "Neu: Anzeige-Tag — bei Serien & Anime kannst du auf der Detailseite einen Wochentag wählen, an dem eine neue Folge bei dir als „neu“ auftaucht (in „Was kommt“, im Kalender und am Badge). Praktisch, wenn der echte Release-Tag regional abweicht oder ihr einen festen Schau-Tag habt (z. B. immer freitags). In geteilten, synchronisierten Listen gilt der Tag für die ganze Gruppe; die Episodenliste behält die echten Sendetermine.",
      "Verbessert: Such- und Medien-Abfragen (Serien, Anime, Filme, Spiele) laufen jetzt über einen gemeinsamen Zwischenspeicher — Ergebnisse laden oft schneller und Hänger durch Anbieter-Limits werden seltener.",
      "Behoben: Cover wirkten an manchen Stellen (Listen-Zeilen, Home) leicht unscharf — jetzt überall scharf.",
      "Behoben: Zeitangaben wie „gestern“ und „vor 20 Stunden“ waren gelegentlich uneinheitlich.",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-06-18",
    title: "Verschieben aus geteilten Listen & E-Mail-Login",
    changes: [
      "Behoben: Verschiebst du eine gemeinsam (synchronisiert) verfolgte Serie oder einen Anime in eine andere Liste, bleibt jetzt der Fortschritt von euch beiden erhalten — vorher konnte er verschwinden oder es wurde fälschlich fremder Fortschritt angezeigt.",
      "Neu: Beim Verschieben eines Eintrags aus einer geteilten Liste kommt jetzt ein kurzer Hinweis — er wird damit auch für die anderen Mitglieder aus der Liste genommen und die Synchronisierung endet (dein Fortschritt bleibt erhalten).",
      "E-Mail-Login per Magic Link ist jetzt voll einsatzbereit — die Anmelde-Mail kommt zuverlässig an.",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-06-18",
    title: "Datenschutz, Mitseher-Bilder & öffentliche Seiten",
    changes: [
      "Neu: Datenschutzerklärung — erreichbar im Profil unter „Über“ und im Fußbereich der öffentlichen Seiten.",
      "Mitseher werden in der Episodenliste jetzt mit Profilbild angezeigt (bis zu drei, danach „+N“) statt nur als Augen-Symbol.",
      "Die öffentlichen Seiten (Features, Datenschutz, Styleguide) haben jetzt einen einheitlichen Look — mit einem „Zur App“-Knopf statt „Anmelden“, der für ein- wie ausgeloggte Besucher passt.",
      "Die Features-Seite zeigt wieder akkurat, was die App wirklich kann.",
      "Behoben: Der Zurück-Knopf in der Navigationsleiste hinterließ beim Wechsel kurz einen „Schatten“.",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-06-16",
    title: "Automatische Folgen-Benachrichtigungen",
    changes: [
      "Neu: Sobald eine neue Folge eines Titels erscheint, den du verfolgst, bekommst du automatisch einen Push — ganz ohne Zutun (sofern Benachrichtigungen im Profil aktiviert sind).",
      "Mehrere neue Folgen desselben Titels am selben Tag werden zu einer Nachricht gebündelt.",
    ],
  },
  {
    version: "0.11.1",
    date: "2026-06-14",
    title: "Milchglas-Kopfzeile",
    changes: [
      "Die Kopfzeile ist jetzt aus Milchglas — beim Scrollen schimmern die Inhalte dezent durch.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-06-14",
    title: "Listen-Kategorien",
    changes: [
      "Listen können jetzt eine Kategorie haben (Anime, Manga, Serien, Filme oder Spiele) — du legst sie beim Anlegen fest oder änderst sie später auf der Listenseite.",
      "Hat eine Liste eine Kategorie, schlägt der Hinzufügen-Dialog automatisch nur die passende Art vor.",
      "Die Listenübersicht ist nach Kategorien gegliedert: kategorisierte Listen bekommen eigene Abschnitte, alles andere bleibt unter „Meine Listen“.",
    ],
  },
  {
    version: "0.10.2",
    date: "2026-06-05",
    title: "Mehr Logbuch pro Seite",
    changes: [
      "Das Logbuch zeigt jetzt 12 statt 8 Einträge pro Seite.",
    ],
  },
  {
    version: "0.10.1",
    date: "2026-06-05",
    title: "Kleine Fixes",
    changes: [
      "Behoben: Eine in einer geteilten Liste synchronisierte Serie tauchte unter „Fortsetzen“ doppelt auf — einmal mit Liste, einmal ohne. Sie erscheint jetzt nur noch doppelt, wenn du sie wirklich getrennt verfolgst (z. B. solo und zusätzlich mit jemandem zusammen).",
      "„Fortsetzen“: Das Symbol vor dem Listennamen ist jetzt ein Listen-Icon statt der Sync-Pfeile.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-06-05",
    title: "Interaktion",
    changes: [
      "Am Computer lassen sich Einträge und Listen jetzt am ganzen Element ziehen — nicht mehr nur am kleinen Griff.",
      "Im Hinzufügen-Dialog kannst du eine versehentlich gewählte Sache direkt wieder entfernen.",
      "Das Logbuch hat jetzt Filter — Releases, Aktivität und Eigene einzeln ein- und ausblenden — und blättert in Seiten.",
      "Behoben: Am unteren Bildschirmrand wurden neben der Navigationsleiste manchmal Klicks verschluckt.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-06-04",
    title: "Listen & Details",
    changes: [
      "Listenbeschreibungen lassen sich jetzt direkt bearbeiten — und hinzufügen, wenn noch keine da ist.",
      "Eigene Listen-Cover kannst du aufs generierte Muster zurücksetzen (untere Hälfte beim Hovern über dem Cover).",
      "Lange Listen blättern jetzt in Seiten zu je 12 Einträgen.",
      "Bei Serien, Anime & Manga zeigen die Details jetzt Genre, Studio/Sender und Erscheinungsjahr.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-06-04",
    title: "Neues Theme & Theme-Politur",
    changes: [
      "Neues Theme „Teich“ — blaues Wasser mit Seerosen-Grün, in Hell & Dunkel.",
      "„Totoro“ heißt jetzt „Komorebi“ und bekommt eine kräftige Mango-Akzentfarbe — vorher war der Kontrast zu schwach.",
      "Theme-Auswahl aufgeräumt: drei pro Reihe, die Namen werden nicht mehr abgeschnitten.",
      "Die schwebende Navigationsleiste wirft im hellen Modus jetzt einen sichtbaren Schatten.",
      "Durch das neue Theme mischen sich die automatisch generierten Listen-Cover einmalig neu.",
    ],
  },
  {
    version: "0.7.2",
    date: "2026-06-04",
    title: "Update-Reload nachgebessert",
    changes: [
      "Der Ladefehler, der direkt nach einem Update noch vereinzelt auftauchen konnte, ist jetzt behoben — Seiten laden beim Update sauber durch.",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-06-04",
    title: "Update-Reload behoben",
    changes: [
      "Fehler behoben, bei dem direkt nach einem Update kurz ein Ladefehler erscheinen konnte und ein manuelles Neuladen nötig war. Updates greifen jetzt sauber.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-06-04",
    title: "Feinschliff & Fixes",
    changes: [
      "Das Home begrüßt dich jetzt mit deinem Namen.",
      "Die Kopfzeile bleibt beim Scrollen oben sichtbar.",
      "App- und Browserleiste übernehmen jetzt die Farbe deines Themes statt durchgehend rot zu sein.",
      "Episoden-Daten zeigen jetzt das Jahr — eindeutig auch bei älteren Serien & Anime.",
      "Kalender: Der Pfeil zum Monatswechsel springt nicht mehr hin und her.",
      "Kleinere Politur an leeren Listen, der Tracken-Erklärung und den seitlichen Rahmenlinien.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-06-04",
    title: "Stille Updates",
    changes: [
      "Neue Versionen melden sich jetzt still per Badge am Profil statt per Pop-up; ein Tipp auf „Update verfügbar“ im Profil lädt neu.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-06-04",
    title: "Push-Benachrichtigungen",
    changes: [
      "Neu: Push-Benachrichtigungen lassen sich im Profil aktivieren — mit Test-Knopf. Der automatische Versand bei neuen Folgen kommt als Nächstes.",
      "Auf dem iPhone musst du Nakama dafür zuerst als App installieren.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-06-04",
    title: "Spielesuche & Feinschliff",
    changes: [
      "Die Spielesuche (Steam) funktioniert jetzt zuverlässig.",
      "Schärferes App-Icon auf dem Home-Bildschirm.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-06-04",
    title: "Automatische Update-Hinweise",
    changes: [
      "Neu: Sobald eine neue Version da ist, meldet sich die App mit einem Hinweis — ein Tipp auf „Neu laden“ und du bist aktuell, ganz ohne harten Reload.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-04",
    title: "Release Notes, App-Installation & Profil-Politur",
    changes: [
      "Neu: „Was ist neu“ — dieser Verlauf hält dich über jedes Update auf dem Laufenden.",
      "Nakama lässt sich jetzt als App auf den Home-Bildschirm installieren — auch direkt beim Einrichten.",
      "Die App-Version steht im Profil; ein Tippen öffnet die Release Notes.",
      "Profil aufgeräumt: neuer „Über“-Bereich und ein dezenteres Konto-Löschen.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06-04",
    title: "Nakama ist da — die Beta für Freunde",
    changes: [
      "Tracke Anime, Manga, Serien, Filme und Spiele — pro Folge oder als Abschluss.",
      "Geteilte Listen: gemeinsam schauen, Fortschritt optional synchron halten.",
      "Home zeigt, was als Nächstes kommt und wo du weitermachen kannst.",
      "Kalender, Logbuch und Mitseher-Anzeige für geteilte Listen.",
      "8 Themes in Hell & Dunkel, eigene Listen-Cover und Profilbilder.",
    ],
  },
];

/** The newest entry, or null if the changelog is empty. */
export function latestNote(): ReleaseNote | null {
  return RELEASE_NOTES[0] ?? null;
}

/**
 * Compare two semver-ish "x.y.z" strings. Returns >0 if `a` is newer than `b`,
 * <0 if older, 0 if equal. Missing/garbage segments count as 0, so a malformed
 * stored value just reads as the oldest possible version (auto-open fires).
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
