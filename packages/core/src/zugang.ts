/**
 * Kein Zugang mehr (B22)
 *
 * Archivierte, gesperrte und ausgetretene Mitglieder koennen sich anmelden,
 * bekommen von der Datenbank aber nichts mehr (private.hat_zugang). Web und
 * App fragen deshalb public.mein_zugang() und zeigen statt leerer Seiten
 * einen Hinweis. Hier stehen die Gruende und die Saetze dazu, damit beide
 * dasselbe sagen.
 */

export type ZugangsGrund = "archiviert" | "gesperrt" | "ausgetreten" | "unbekannt";

const GRUENDE: readonly ZugangsGrund[] = ["archiviert", "gesperrt", "ausgetreten", "unbekannt"];

/**
 * Der Grund aus der Datenbank oder aus der Adresse (?grund=). Was dort sonst
 * steht, wird zu "unbekannt" - der Satz bleibt dann allgemein.
 */
export function zugangsGrund(wert: string | null | undefined): ZugangsGrund {
  return GRUENDE.find((g) => g === wert) ?? "unbekannt";
}

export const KEIN_ZUGANG_TITEL = "Kein Zugang mehr";

/** Ein Satz, warum. */
export function keinZugangText(grund: ZugangsGrund): string {
  switch (grund) {
    case "ausgetreten":
    case "archiviert":
      return "Deine Mitgliedschaft ist beendet. Damit endet auch der Zugang zur App.";
    case "gesperrt":
      return "Der Verein hat deinen Zugang gesperrt.";
    case "unbekannt":
      return "Mit diesem Konto ist im Moment keine Anmeldung möglich.";
  }
}

/** Was man tun kann - fuer alle Gruende derselbe Weg. */
export const KEIN_ZUGANG_KONTAKT =
  "Wenn das nicht stimmt oder du wieder einsteigen möchtest, melde dich beim Vorstand.";
