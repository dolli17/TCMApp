/**
 * Beschreibungen der Einwilligungen in der richtigen Anrede (U71).
 *
 * Die Beschreibung eines Merkmals steht in der Datenbank und ist für beide
 * Sichten dieselbe. Das passt nicht: im Konto liest das Mitglied über sich
 * selbst und wird geduzt, in der Verwaltung liest der Vorstand über jemand
 * anderen. „Darf die Person …“ klang im Konto wie ein Formular über Dritte,
 * „deine Platzbuchungen“ in der Verwaltung, als ginge es um den Vorstand.
 *
 * Für die Merkmale, die das Onboarding und die Benachrichtigungen kennen,
 * steht hier der Text je Sicht. Alles andere - auch was der Vorstand selbst
 * anlegt - zeigt weiter die Beschreibung aus der Datenbank. Ändert der
 * Vorstand den Text eines dieser Merkmale, gilt seiner, solange er nicht mehr
 * der Ausgangstext ist (siehe AUSGANG).
 */

export type MerkmalSicht = "mitglied" | "verwaltung";

/** Die Ausgangstexte aus Seed und Migration, an denen ein Ersatz hängt. */
const AUSGANG: Record<string, string> = {
  foto:
    "Darf die Person auf Fotos der Website, in Aushängen und in der Presse erscheinen? " +
    "Bei Minderjährigen erteilen die Erziehungsberechtigten die Einwilligung.",
  mannschaft_interesse: "Die Person möchte in einer Mannschaft spielen. Der Sportwart meldet sich.",
  booking_mail:
    "Ob Änderungen an deinen Platzbuchungen zusätzlich per E-Mail kommen. " +
    "In der App siehst du sie in jedem Fall.",
};

const ERSATZ: Record<string, Partial<Record<MerkmalSicht, string>>> = {
  foto: {
    mitglied:
      "Dürfen wir dich auf Fotos der Website, in Aushängen und in der Presse zeigen? " +
      "Bei Minderjährigen willigen die Erziehungsberechtigten ein.",
  },
  mannschaft_interesse: {
    mitglied: "Du möchtest in einer Mannschaft spielen. Der Sportwart meldet sich bei dir.",
  },
  booking_mail: {
    verwaltung:
      "Ob Änderungen an den Platzbuchungen des Mitglieds zusätzlich per E-Mail kommen. " +
      "In der App sieht es sie in jedem Fall.",
  },
};

/** Die Beschreibung eines Merkmals in der Anrede der Sicht. */
export function merkmalBeschreibung(code: string, beschreibung: string, sicht: MerkmalSicht): string {
  const ersatz = ERSATZ[code]?.[sicht];
  // Alte Datenbestände tragen den Text noch ohne Umlaute (vor 20261022120000).
  const gleich = (a: string, b: string) => a.trim() === b || a.trim() === ohneUmlaute(b);
  if (ersatz && AUSGANG[code] && gleich(beschreibung, AUSGANG[code])) return ersatz;
  return beschreibung;
}

function ohneUmlaute(s: string): string {
  return s
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss");
}
