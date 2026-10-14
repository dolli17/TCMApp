/**
 * Einteilung der Mitglieder ohne Login
 *
 * Reine Logik ohne Netz und Datenbank, damit sie sich testen laesst. Das
 * Skript sammelt vorher drei Dinge ein: die Mitglieder ohne Login (mit dem
 * Urteil von public.ist_testadresse), alle Konten aus auth.users und die schon
 * vergebenen Verknuepfungen. Hier wird daraus fuer jedes Mitglied genau eine
 * Massnahme.
 */

/** Ein nicht archiviertes Mitglied ohne Login, so wie es die Datenbank liefert. */
export interface MitgliedOhneLogin {
  id: string;
  name: string;
  email: string | null;
  /** Urteil von public.ist_testadresse – dieselbe Regel wie in member-login. */
  istTestadresse: boolean;
}

/** Ein Konto aus auth.users. */
export interface AuthKonto {
  id: string;
  email: string | null;
}

/** Ein Mitglied, das schon mit einem Konto verbunden ist. */
export interface Verknuepfung {
  memberId: string;
  name: string;
  authUserId: string;
}

export type Massnahme =
  /** Echte Adresse, noch kein Konto: Einladungsmail. */
  | { art: "einladen"; mitglied: MitgliedOhneLogin; email: string }
  /** Testadresse, noch kein Konto: Konto still anlegen, keine Mail. */
  | { art: "still_anlegen"; mitglied: MitgliedOhneLogin; email: string }
  /** Zur Adresse gibt es schon ein freies Konto: nur verknuepfen. */
  | { art: "verknuepfen"; mitglied: MitgliedOhneLogin; email: string; authUserId: string }
  /** Das Konto zur Adresse gehoert schon einem anderen Mitglied. */
  | { art: "vergeben"; mitglied: MitgliedOhneLogin; email: string; anderesMitglied: string }
  /** Ohne Adresse kein Login – das pflegt der Vorstand von Hand nach. */
  | { art: "ohne_email"; mitglied: MitgliedOhneLogin };

export type Art = Massnahme["art"];

/** Vergleich wie in findeBenutzer (member-login): ohne Leerraum, ohne Gross/klein. */
export function normalisiereEmail(email: string | null | undefined): string | null {
  const bereinigt = (email ?? "").trim().toLowerCase();
  return bereinigt === "" ? null : bereinigt;
}

export function teileEin(
  mitglieder: MitgliedOhneLogin[],
  konten: AuthKonto[],
  verknuepfungen: Verknuepfung[],
): Massnahme[] {
  const kontoNachEmail = new Map<string, string>();
  for (const konto of konten) {
    const email = normalisiereEmail(konto.email);
    if (email) kontoNachEmail.set(email, konto.id);
  }

  const besitzer = new Map(verknuepfungen.map((v) => [v.authUserId, v.name]));

  return mitglieder.map((mitglied): Massnahme => {
    const email = normalisiereEmail(mitglied.email);
    if (!email) return { art: "ohne_email", mitglied };

    const authUserId = kontoNachEmail.get(email);
    if (authUserId) {
      const anderesMitglied = besitzer.get(authUserId);
      return anderesMitglied
        ? { art: "vergeben", mitglied, email, anderesMitglied }
        : { art: "verknuepfen", mitglied, email, authUserId };
    }

    return mitglied.istTestadresse
      ? { art: "still_anlegen", mitglied, email }
      : { art: "einladen", mitglied, email };
  });
}

export const REIHENFOLGE: Art[] = [
  "einladen",
  "still_anlegen",
  "verknuepfen",
  "vergeben",
  "ohne_email",
];

export const BESCHRIFTUNG: Record<Art, string> = {
  einladen: "Einladung per Mail",
  still_anlegen: "Testadresse, Konto still anlegen",
  verknuepfen: "Konto schon vorhanden, nur verknüpfen",
  vergeben: "Adresse gehört schon zu anderem Mitglied",
  ohne_email: "ohne E-Mail, von Hand nachpflegen",
};

export function gruppiere(massnahmen: Massnahme[]): Record<Art, Massnahme[]> {
  const gruppen = Object.fromEntries(REIHENFOLGE.map((a) => [a, [] as Massnahme[]])) as Record<
    Art,
    Massnahme[]
  >;
  for (const m of massnahmen) gruppen[m.art].push(m);
  return gruppen;
}

/** Wird bei dieser Massnahme ein Konto angelegt oder verknuepft? */
export function schreibt(art: Art): boolean {
  return art === "einladen" || art === "still_anlegen" || art === "verknuepfen";
}
