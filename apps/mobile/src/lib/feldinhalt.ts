/**
 * Was in einem Feld steht - und was das Telefon daraus macht
 *
 * Ohne textContentType (iOS) und autoComplete (Android, Browser) schlaegt das
 * System weder den eigenen Namen noch die Adresse vor, und bei Passwoertern
 * bietet es keinen Schluesselbund an (U22). Ein Feld nennt deshalb nur seinen
 * Inhalt; Autofill, Tastatur und Grossschreibung folgen daraus an einer
 * Stelle, statt an jedem Feld von Hand.
 */

import type { KeyboardTypeOptions, TextInputProps } from "react-native";

export type Feldinhalt =
  | "vorname"
  | "nachname"
  | "name"
  | "titel"
  | "strasse"
  | "plz"
  | "ort"
  | "telefon"
  | "email"
  | "passwort"
  | "passwort-neu"
  | "iban";

export type FeldEigenschaften = Pick<
  TextInputProps,
  "textContentType" | "autoComplete" | "keyboardType" | "autoCapitalize" | "autoCorrect"
>;

const TABELLE: Record<Feldinhalt, FeldEigenschaften> = {
  vorname: { textContentType: "givenName", autoComplete: "given-name", autoCapitalize: "words" },
  nachname: { textContentType: "familyName", autoComplete: "family-name", autoCapitalize: "words" },
  name: { textContentType: "name", autoComplete: "name", autoCapitalize: "words" },
  titel: { textContentType: "namePrefix", autoComplete: "honorific-prefix", autoCapitalize: "words" },
  strasse: { textContentType: "fullStreetAddress", autoComplete: "street-address", autoCapitalize: "words" },
  plz: { textContentType: "postalCode", autoComplete: "postal-code", keyboardType: "number-pad" },
  ort: { textContentType: "addressCity", autoComplete: "postal-address-locality", autoCapitalize: "words" },
  telefon: { textContentType: "telephoneNumber", autoComplete: "tel", keyboardType: "phone-pad" },
  email: {
    textContentType: "emailAddress", autoComplete: "email", keyboardType: "email-address", autoCapitalize: "none",
  },
  passwort: { textContentType: "password", autoComplete: "current-password", autoCapitalize: "none" },
  "passwort-neu": { textContentType: "newPassword", autoComplete: "new-password", autoCapitalize: "none" },
  // Kein Autofill fuer Kontodaten - aber Grossbuchstaben und keine Korrektur.
  iban: { textContentType: "none", autoComplete: "off", autoCapitalize: "characters" },
};

/** Die Eigenschaften fuer ein TextInput; autoCorrect ist bei Daten immer aus. */
export function feldEigenschaften(inhalt: Feldinhalt | undefined): FeldEigenschaften {
  if (!inhalt) return { autoCorrect: false };
  return { autoCorrect: false, ...TABELLE[inhalt] };
}

/** Die Tastatur, wenn ein Feld keine eigene nennt. */
export function tastaturFuer(inhalt: Feldinhalt | undefined): KeyboardTypeOptions | undefined {
  return inhalt ? TABELLE[inhalt].keyboardType : undefined;
}
