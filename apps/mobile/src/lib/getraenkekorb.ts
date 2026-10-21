/**
 * Der Getraenke-Korb der App (U17)
 *
 * Mit "+" ist noch nichts gebucht. Lag der Korb im Zustand des Bildschirms,
 * war er beim Wechsel zu den Veranstaltungen still weg - und wer glaubte, es
 * sei schon eingetragen, hat nie bezahlt. Deshalb liegt er hier, ausserhalb
 * des Bildschirms: er uebersteht Reiter- und Tab-Wechsel, bis eingetragen,
 * verworfen oder abgemeldet wird.
 *
 * Bewusst nur im Speicher, nicht in AsyncStorage: ein Korb von gestern auf
 * einem geteilten Geraet soll niemandem am naechsten Tag untergeschoben werden.
 */

import { useSyncExternalStore } from "react";
import type { DrinkBasket } from "@tcm/core";

let korb: DrinkBasket = {};
const hoerer = new Set<() => void>();

export function aktuellerKorb(): DrinkBasket {
  return korb;
}

export function setzeKorb(aenderung: DrinkBasket | ((k: DrinkBasket) => DrinkBasket)): void {
  korb = typeof aenderung === "function" ? aenderung(korb) : aenderung;
  for (const h of hoerer) h();
}

/** Beim Abmelden: der naechste auf diesem Geraet erbt keinen Korb. */
export function leereKorb(): void {
  setzeKorb({});
}

function abonniere(h: () => void): () => void {
  hoerer.add(h);
  return () => hoerer.delete(h);
}

export function useKorb(): DrinkBasket {
  return useSyncExternalStore(abonniere, aktuellerKorb, aktuellerKorb);
}
