/**
 * Alte Adresse /plaetze/meine
 *
 * "Meine Buchungen" und "Offene Spiele" sind in einem Bildschirm
 * zusammengelegt (plaetze/spiele.tsx). Die Route bleibt, damit Links aus
 * Push-Nachrichten und von Home weiter ankommen.
 */

import { Redirect } from "expo-router";

export default function Weiterleitung() {
  return <Redirect href="/plaetze/spiele" />;
}
