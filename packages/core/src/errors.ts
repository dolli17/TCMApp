/**
 * Datenbankfehler in verstaendliche Saetze uebersetzen
 *
 * Die RPCs werfen bereits deutsche Meldungen. Was durchkommt, sind die Faelle,
 * die direkt von Postgres stammen - Constraint-Verletzungen, die kein
 * PL/pgSQL-Code abgefangen hat. "duplicate key value violates unique
 * constraint bookings_no_overlap" hilft niemandem an der Theke weiter.
 */

export interface PostgresLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const CONSTRAINT_TEXTE: Record<string, string> = {
  bookings_no_overlap: "Dieser Platz ist zu der Zeit bereits belegt.",
  bookings_slot_half_open: "Der Zeitraum der Buchung ist ungueltig.",
  bookings_owner_present: "Der Buchung fehlt ein Mitglied oder ein Titel.",
  booking_players_member_xor_guest:
    "Ein Mitspieler ist entweder Mitglied oder Gast, nicht beides.",
  booking_players_unique_member:
    "Dieses Mitglied ist bereits als Mitspieler eingetragen.",
  charges_one_per_member_kind_period:
    "Fuer diesen Zeitraum gibt es bereits eine Forderung.",
  debit_items_one_active_per_charge:
    "Diese Forderung ist bereits in einem Lastschriftlauf enthalten.",
  members_email_key: "Diese E-Mail-Adresse wird bereits verwendet.",
  memberships_number_key: "Diese Mitgliedsnummer ist bereits vergeben.",
  memberships_one_open_per_member:
    "Dieses Mitglied hat bereits eine laufende Mitgliedschaft.",
  members_no_self_payer: "Ein Mitglied kann nicht sein eigener Zahler sein.",
  drink_items_name_unique: "Ein Artikel mit diesem Namen existiert bereits.",
  sepa_mandates_used_after_signed:
    "Ein Mandat kann nicht vor seiner Unterschrift benutzt worden sein.",
  sepa_mandates_reference_unique_for_app:
    "Diese Mandatsreferenz ist bereits vergeben.",
};

const CODE_TEXTE: Record<string, string> = {
  "23P01": "Dieser Platz ist zu der Zeit bereits belegt.",
  "23505": "Dieser Eintrag existiert bereits.",
  "23503": "Ein verknuepfter Datensatz fehlt oder wird noch verwendet.",
  "23514": "Die Eingabe verletzt eine Regel.",
  "42501": "Dafuer fehlt dir die Berechtigung.",
  "22023": "Die Eingabe ist ungueltig.",
  P0002: "Der gesuchte Datensatz wurde nicht gefunden.",
};

export function translateDbError(error: PostgresLikeError | null | undefined): string {
  if (!error) return "Unbekannter Fehler.";

  const haystack = `${error.message ?? ""} ${error.details ?? ""}`;

  for (const [constraint, text] of Object.entries(CONSTRAINT_TEXTE)) {
    if (haystack.includes(constraint)) return text;
  }

  // Meldungen aus den RPCs sind bereits fuer Menschen geschrieben und enden
  // auf einen Punkt. Die werden unveraendert durchgereicht.
  const message = error.message?.trim();
  if (message && /[.!?]$/.test(message) && !message.includes("violates")) {
    return message;
  }

  if (error.code && CODE_TEXTE[error.code]) return CODE_TEXTE[error.code]!;

  return message || "Unbekannter Fehler.";
}

/** War es ein Konflikt mit einer bestehenden Buchung? */
export function isSlotConflict(error: PostgresLikeError | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "23P01" ||
    (error.message?.includes("bereits belegt") ?? false)
  );
}
