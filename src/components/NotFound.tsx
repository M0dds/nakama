import { Show } from "solid-js";
import { PageHeader } from "@/components/PageHeader";

/**
 * "Nicht gefunden"-Surface für /item/* und /lists/:id.
 *
 * Items sind öffentlich (jeder mit Account kann ein Item-Detail aufrufen
 * wenn die Quelle existiert) — also klare „Eintrag nicht gefunden".
 * Listen sind privat: hier ist die DB-Antwort {row exists, but you're
 * not a member} privacy-relevant und wir mappen sie auf dieselbe
 * "Liste nicht gefunden"-Antwort wie {row doesn't exist}, damit die
 * URL-Existenz nicht durch Trial-and-Error verifizierbar ist. Wir
 * erklären das hier NICHT — Erklärung wäre selbst schon ein Hinweis.
 */
export function NotFound(props: { kind: "item" | "list" }) {
  return (
    <main class="w-full">
      <PageHeader
        kicker={props.kind === "item" ? "Eintrag" : "Liste"}
        title={
          props.kind === "item"
            ? "Eintrag nicht gefunden"
            : "Liste nicht gefunden"
        }
        backHref="/lists"
      />
      <div class="max-w-2xl px-5 py-10">
        <Show when={props.kind === "item"}>
          <p class="text-body text-text-muted">
            Es gibt keinen Eintrag unter dieser URL. Wahrscheinlich hat
            sich ein Tippfehler eingeschlichen, oder der Link verweist
            auf etwas, das wir aktuell nicht kennen.
          </p>
        </Show>
        <Show when={props.kind === "list"}>
          <p class="text-body text-text-muted">
            Wenn du dir sicher bist, dass hier deine Liste liegen sollte,
            überprüf die URL nochmal — oder lass dir den korrekten Link
            von der Person schicken, die die Liste angelegt hat.
          </p>
        </Show>
      </div>
    </main>
  );
}
