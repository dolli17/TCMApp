"use server";

import { revalidatePath } from "next/cache";
import { einstellungsText, euroEingabeAlsCents, listeAusWert, translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/** Für Meldungen: der deutsche Name statt des Schlüssels. */
function name(schluessel: string): string {
  return einstellungsText({ key: schluessel, label: null, description: null }).label;
}

/** Zwei Kommalisten mit denselben Arten gelten als gleich, egal in welcher Reihenfolge. */
function gleicheListe(a: string, b: string): boolean {
  return listeAusWert(a).sort().join(",") === listeAusWert(b).sort().join(",");
}

/**
 * Speichert alle geänderten Werte einer Gruppe.
 *
 * Die Felder kommen in drei Formen (EinstellungsGruppe): `wert:` wie
 * gespeichert, `euro:` als Eurobetrag für einen Wert in Cent, und `liste:`
 * als Marke für eine Kommaliste, deren angehakte Arten als `art:` kommen -
 * ein leeres Häkchenfeld schickt sonst gar nichts.
 *
 * Bewusst nacheinander und nicht in einem Rutsch: die Prüfung sitzt in
 * set_setting, und wenn ein Wert unsinnig ist, soll die Meldung sagen welcher.
 * Es sind höchstens eine Handvoll Felder je Gruppe.
 */
export async function einstellungenSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();

  const eintraege: [string, string][] = [];
  for (const [feld, roh] of formData.entries()) {
    const wert = String(roh);
    if (feld.startsWith("wert:")) {
      eintraege.push([feld.slice("wert:".length), wert]);
    } else if (feld.startsWith("euro:")) {
      const schluessel = feld.slice("euro:".length);
      const cents = euroEingabeAlsCents(wert);
      if (cents === null) {
        return { ok: false, meldung: `${name(schluessel)}: Bitte einen Betrag in Euro eingeben, z. B. 15,00.` };
      }
      eintraege.push([schluessel, cents]);
    } else if (feld.startsWith("liste:")) {
      const schluessel = feld.slice("liste:".length);
      eintraege.push([schluessel, formData.getAll(`art:${schluessel}`).map(String).join(",")]);
    }
  }

  if (eintraege.length === 0) {
    return { ok: false, meldung: "Nichts zu speichern." };
  }

  let geaendert = 0;
  for (const [schluessel, wert] of eintraege) {
    const alt = String(formData.get(`alt:${schluessel}`) ?? "");
    if (wert === alt || (formData.has(`liste:${schluessel}`) && gleicheListe(wert, alt))) continue;

    const { error } = await supabase.rpc("set_setting", {
      p_key: schluessel,
      p_value: wert,
    });

    if (error) {
      return { ok: false, meldung: `${name(schluessel)}: ${translateDbError(error)}` };
    }
    geaendert++;
  }

  if (geaendert === 0) {
    return { ok: true, meldung: "Keine Änderungen." };
  }

  // Die Werte stehen seit dem Umbau bei ihrem Gegenstand, also auf fuenf
  // Seiten statt auf einer. /admin frischt den ganzen Zweig auf; /plan und
  // /verein/getraenke, weil dort die Zeiten und Preise unmittelbar wirken.
  revalidatePath("/admin", "layout");
  revalidatePath("/plan");
  revalidatePath("/verein/getraenke");
  return { ok: true, meldung: "Einstellungen gespeichert." };
}
