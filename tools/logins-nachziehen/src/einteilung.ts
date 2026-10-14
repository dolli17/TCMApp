/**
 * Einteilung der Mitglieder ohne Login
 *
 * Reine Logik ohne Netz und Datenbank, damit sie sich testen laesst. Die RPC
 * members_ohne_login liefert die Mitglieder ohne Login schon samt Urteil von
 * public.ist_testadresse und Abgleich mit auth.users (gibt es zur Adresse ein
 * Konto, und gehoert es schon einem anderen Mitglied?). Hier wird daraus fuer
 * jedes Mitglied genau eine Massnahme.
 */

/** Ein nicht archiviertes Mitglied ohne Login, so wie es members_ohne_login liefert. */
export interface MitgliedOhneLogin {
  id: string;
  name: string;
  email: string | null;
  /** Urteil von public.ist_testadresse – dieselbe Regel wie in member-login. */
  istTestadresse: boolean;
  /** Konto in auth.users mit derselben Adresse (ohne Gross/klein), sonst null. */
  kontoId: string | null;
  /** Name des Mitglieds, dem dieses Konto schon gehoert, sonst null. */
  kontoMitglied: string | null;
}

/** Ein Konto aus auth.users. */
export interface AuthKonto {
  id: string;
  email: string | null;
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

export function teileEin(mitglieder: MitgliedOhneLogin[]): Massnahme[] {
  return mitglieder.map((mitglied): Massnahme => {
    const email = normalisiereEmail(mitglied.email);
    if (!email) return { art: "ohne_email", mitglied };

    if (mitglied.kontoId) {
      return mitglied.kontoMitglied
        ? { art: "vergeben", mitglied, email, anderesMitglied: mitglied.kontoMitglied }
        : { art: "verknuepfen", mitglied, email, authUserId: mitglied.kontoId };
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
