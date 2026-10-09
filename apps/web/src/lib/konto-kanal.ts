/**
 * Ein Konto pro Browser.
 *
 * Die Anmeldung steckt in Cookies, und die teilen sich alle Tabs. Meldet sich
 * in einem Tab ein anderes Konto an (oder ab), zeigten die anderen Tabs sonst
 * weiter die Seite des alten Kontos - bis zum naechsten Klick, der dann
 * ploetzlich als das neue Konto laeuft. Der KontoWaechter in jedem Tab prueft
 * deshalb, ob noch dasselbe Konto angemeldet ist; ueber diesen Kanal erfaehrt
 * er es sofort statt erst beim naechsten Pruefen.
 */
const KANAL = "tcm-konto";

/**
 * Meldet sich dieser Tab selbst ab (Abmelden-Knopf, Inaktivitaet), soll sein
 * eigener Waechter nicht dazwischenfahren - sonst stuende auf der
 * Anmeldeseite der falsche Grund.
 */
let eigeneAbmeldung = false;
export function abmeldungInDiesemTab() {
  eigeneAbmeldung = true;
}
export function meldetSichSelbstAb() {
  return eigeneAbmeldung;
}

/** Den anderen Tabs sagen: hier hat sich die Anmeldung geaendert. */
export function kontoGewechselt() {
  if (typeof BroadcastChannel === "undefined") return;
  const kanal = new BroadcastChannel(KANAL);
  kanal.postMessage("gewechselt");
  kanal.close();
}

/** Auf Wechsel in anderen Tabs hoeren. Gibt eine Abmeldefunktion zurueck. */
export function aufKontowechselHoeren(aufruf: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const kanal = new BroadcastChannel(KANAL);
  kanal.onmessage = () => aufruf();
  return () => kanal.close();
}
