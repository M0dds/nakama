import { LegalLayout, LegalSection } from "@/components/LegalLayout";

/**
 * Datenschutzerklärung — drafted from what the app actually does (Supabase
 * auth/DB/storage, Discord OAuth + magic-link, push subscriptions, watch data,
 * external metadata sources, Cloudflare hosting). Controller = Johann Mertens,
 * contact servus@usenakama.app. Not legal advice — have the final text reviewed
 * before relying on it.
 */
function Ext(props: { href: string; children: string }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
      class="text-text underline-offset-2 hover:underline"
    >
      {props.children}
    </a>
  );
}

export default function Privacy() {
  return (
    <LegalLayout kicker="Rechtliches" title="Datenschutzerklärung" updated="Juni 2026">
      <LegalSection title="1 · Verantwortlicher">
        <p>
          Verantwortlich für die Datenverarbeitung in dieser Anwendung im Sinne
          der Datenschutz-Grundverordnung (DSGVO) ist:
        </p>
        <p>
          Johann Mertens
          <br />
          E-Mail:{" "}
          <a
            href="mailto:servus@usenakama.app"
            class="text-text underline-offset-2 hover:underline"
          >
            servus@usenakama.app
          </a>
        </p>
      </LegalSection>

      <LegalSection title="2 · Grundsatz">
        <p>
          Nakama ist ein Tracker für Anime, Manga, Serien, Filme und Spiele für
          dich und kleine Freundeskreise. Wir verarbeiten nur die Daten, die für
          den Betrieb nötig sind, setzen{" "}
          <strong class="font-medium text-text">kein</strong> Werbe- oder
          Analyse-Tracking ein und geben keine Daten zu Werbezwecken weiter.
        </p>
      </LegalSection>

      <LegalSection title="3 · Hosting">
        <p>
          Die Anwendung wird über Cloudflare (Cloudflare, Inc.) ausgeliefert.
          Beim Aufruf verarbeitet der Hoster technisch notwendige Zugriffsdaten
          (u. a. IP-Adresse, Zeitpunkt, angefragte Ressource), um die Auslieferung
          und Sicherheit zu gewährleisten. Rechtsgrundlage ist unser berechtigtes
          Interesse an einem stabilen, sicheren Betrieb (Art. 6 Abs. 1 lit. f
          DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="4 · Konto & Anmeldung">
        <p>
          Für die Anmeldung nutzt du entweder Discord (OAuth) oder einen
          Magic-Link per E-Mail. Authentifizierung und Datenhaltung erfolgen über
          Supabase (Supabase, Inc.) als Auftragsverarbeiter.
        </p>
        <ul class="list-disc space-y-1.5 pl-5">
          <li>
            <strong class="font-medium text-text">Discord:</strong> Wir erhalten
            deine E-Mail-Adresse sowie deinen Discord-Benutzernamen/-Identifier,
            um dein Konto anzulegen und dir einen eindeutigen @handle zuzuordnen.
          </li>
          <li>
            <strong class="font-medium text-text">Magic-Link:</strong> Wir
            verarbeiten deine E-Mail-Adresse, um dir einen Anmeldelink zu schicken.
          </li>
        </ul>
        <p>
          Rechtsgrundlage ist die Erfüllung des Nutzungsverhältnisses (Art. 6 Abs.
          1 lit. b DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="5 · Profil & Inhalte">
        <p>
          In deinem Konto speichern wir die Daten, die die App ausmachen: deinen
          Anzeigenamen und @handle, ein optionales Profilbild, deine Listen und
          Einträge, deinen Seh-/Spiel-Fortschritt (welche Folgen du abgehakt
          hast) sowie optionale Notizen. Diese Daten liegen bei Supabase.
        </p>
        <p>
          Wenn du einer geteilten Liste beitrittst, sind die zu dieser Liste
          gehörenden Einträge, Fortschritte und „Mitseher"-Angaben für die übrigen
          Mitglieder dieser Liste sichtbar — das ist der Zweck der geteilten
          Liste. Außerhalb geteilter Listen sind deine Daten privat.
          Rechtsgrundlage ist die Erfüllung des Nutzungsverhältnisses (Art. 6 Abs.
          1 lit. b DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="6 · Push-Benachrichtigungen">
        <p>
          Auf Wunsch benachrichtigen wir dich über neue Folgen. Dafür musst du
          die Benachrichtigung pro Gerät aktiv erlauben; wir speichern dann ein
          Push-Abonnement (technischer Endpoint und Schlüssel deines Browsers).
          Die Zustellung erfolgt über den Push-Dienst deines Browsers bzw.
          Betriebssystems (z. B. Google, Mozilla oder Apple).
        </p>
        <p>
          Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Du
          kannst sie jederzeit widerrufen, indem du die Benachrichtigungen in den
          Einstellungen bzw. in deinem Browser deaktivierst.
        </p>
      </LegalSection>

      <LegalSection title="7 · Externe Medienquellen">
        <p>
          Titel, Cover und Erscheinungsdaten beziehen wir von externen Diensten:{" "}
          <Ext href="https://anilist.co/terms">AniList</Ext> (Anime/Manga),{" "}
          <Ext href="https://www.themoviedb.org/privacy-policy">TMDB</Ext>{" "}
          (Serien/Filme) und{" "}
          <Ext href="https://store.steampowered.com/privacy_agreement/">
            Steam
          </Ext>{" "}
          (Spiele). Cover-Bilder können dabei direkt von den Servern dieser
          Anbieter geladen werden; in diesem Fall wird deine IP-Adresse technisch
          an den jeweiligen Anbieter übermittelt. Rechtsgrundlage ist unser
          berechtigtes Interesse an der Bereitstellung der Inhalte (Art. 6 Abs. 1
          lit. f DSGVO).
        </p>
      </LegalSection>

      <LegalSection title="8 · Lokale Speicherung">
        <p>
          Wir speichern in deinem Browser ein Anmelde-Token (damit du angemeldet
          bleibst) sowie deine Oberflächen-Einstellungen (Theme, Filter). Es
          werden keine Tracking- oder Werbe-Cookies gesetzt.
        </p>
      </LegalSection>

      <LegalSection title="9 · Speicherdauer">
        <p>
          Wir speichern deine Daten, solange dein Konto besteht. Du kannst dein
          Konto jederzeit in deinem Profil unter „Account löschen" entfernen —
          damit werden die zugehörigen Daten gelöscht.
        </p>
      </LegalSection>

      <LegalSection title="10 · Deine Rechte">
        <p>
          Dir stehen die Rechte auf Auskunft, Berichtigung, Löschung,
          Einschränkung der Verarbeitung, Datenübertragbarkeit sowie Widerspruch
          zu (Art. 15–21 DSGVO). Eine erteilte Einwilligung kannst du jederzeit
          mit Wirkung für die Zukunft widerrufen. Außerdem hast du das Recht, dich
          bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Wende dich für
          alle Anliegen an{" "}
          <a
            href="mailto:servus@usenakama.app"
            class="text-text underline-offset-2 hover:underline"
          >
            servus@usenakama.app
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="11 · Änderungen">
        <p>
          Wir passen diese Erklärung an, wenn sich die Anwendung oder die
          Rechtslage ändert. Es gilt jeweils die hier veröffentlichte Fassung
          (siehe „Stand" oben).
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
