import { LegalLayout, LegalSection, Placeholder } from "@/components/LegalLayout";

/**
 * Impressum / Anbieterkennzeichnung nach § 5 DDG.
 *
 * ⚠️ DEFERRED DRAFT — currently NOT routed or linked anywhere. Whether an
 * Impressum is required (and in which form) depends on how the service is
 * operated ("geschäftsmäßig"?), which is being clarified with a Datenschutz-
 * beauftragter. To activate once decided: (1) re-add the `/imprint` route in
 * src/routes/index.tsx, (2) re-add the footer links (Login, Features,
 * LegalLayout) + the Profile "Über" row, (3) fill the <Placeholder>s with a
 * ladungsfähige Anschrift. Not legal advice.
 */
export default function Imprint() {
  return (
    <LegalLayout kicker="Rechtliches" title="Impressum">
      <LegalSection title="Angaben gemäß § 5 DDG">
        <p>
          <Placeholder>Name</Placeholder>
          <br />
          <Placeholder>Straße &amp; Nr.</Placeholder>
          <br />
          <Placeholder>PLZ &amp; Ort</Placeholder>
        </p>
      </LegalSection>

      <LegalSection title="Kontakt">
        <p>
          E-Mail: <Placeholder>Kontakt-E-Mail</Placeholder>
          <br />
          Telefon: <Placeholder>optional — Telefon</Placeholder>
        </p>
      </LegalSection>

      <LegalSection title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <p>
          <Placeholder>Name</Placeholder>
          <br />
          <Placeholder>Anschrift wie oben</Placeholder>
        </p>
      </LegalSection>

      <LegalSection title="Haftung für Inhalte & Links">
        <p>
          Die Inhalte dieser Anwendung werden mit Sorgfalt erstellt. Für die
          Richtigkeit, Vollständigkeit und Aktualität wird jedoch keine Gewähr
          übernommen. Diese Anwendung bindet Inhalte und Links externer Dienste
          ein (u. a. AniList, TMDB, Steam); für deren Inhalte ist stets der
          jeweilige Anbieter verantwortlich.
        </p>
      </LegalSection>

      <LegalSection title="Verbraucherstreitbeilegung">
        <p>
          Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren
          vor einer Verbraucherschlichtungsstelle teilzunehmen.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
