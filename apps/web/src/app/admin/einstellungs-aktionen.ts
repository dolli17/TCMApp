"use server";

import { revalidatePath } from "next/cache";
import {
  einstellungsEingabeFehler, einstellungsText, euroEingabeAlsCents, listeAusWert, translateDbError,
} from "@tcm/core";
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

function auffrischen() {
  // Die Werte stehen seit dem Umbau bei ihrem Gegenstand, also auf fuenf
  // Seiten statt auf einer. /admin frischt den ganzen Zweig auf; /plan und
  // /verein/getraenke, weil dort die Zeiten und Preise unmittelbar wirken.
  revalidatePath("/admin", "layout");
  revalidatePath("/plan");
  revalidatePath("/verein/getraenke");
}

/**
 * Speichert alle geänderten Werte einer Gruppe.
 *
 * Die Felder kommen in drei Formen (EinstellungsGruppe): `wert:` wie
 * gespeichert (mit `typ:` für die Prüfung), `euro:` als Eurobetrag für einen
 * Wert in Cent, und `liste:` als Marke für eine Kommaliste, deren angehakte
 * Arten als `art:` kommen - ein leeres Häkchenfeld schickt sonst gar nichts.
 *
 * Erst wird alles geprüft, dann gespeichert: ein unsinniger Wert hält die
 * ganze Gruppe auf, bevor etwas in der Datenbank steht. Scheitert trotzdem
 * einer erst in set_setting, nennt die Meldung, was schon gespeichert ist,
 * und die Seiten werden aufgefrischt.
 */
export async function einstellungenSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const eintraege: [string, string][] = [];
  for (const [feld, roh] of formData.entries()) {
    const wert = String(roh);
    if (feld.startsWith("wert:")) {
      const schluessel = feld.slice("wert:".length);
      eintraege.push([schluessel, wert]);
    } else if (feld.startsWith("euro:")) {
      const schluessel = feld.slice("euro:".length);
      const cents = euroEingabeAlsCents(wert);
      if (cents === null) {
        return {
          ok: false,
          meldung: `${name(schluessel)}: Bitte einen Betrag in Euro eingeben, z. B. 15,00. Nichts wurde gespeichert.`,
        };
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

  const geaendert = eintraege.filter(([schluessel, wert]) => {
    const alt = String(formData.get(`alt:${schluessel}`) ?? "");
    return !(wert === alt || (formData.has(`liste:${schluessel}`) && gleicheListe(wert, alt)));
  });

  for (const [schluessel, wert] of geaendert) {
    const fehler = einstellungsEingabeFehler(String(formData.get(`typ:${schluessel}`) ?? "text"), wert);
    if (fehler) {
      return { ok: false, meldung: `${name(schluessel)}: ${fehler} Nichts wurde gespeichert.` };
    }
  }

  if (geaendert.length === 0) {
    return { ok: true, meldung: "Keine Änderungen." };
  }

  const supabase = await createServerSupabase();
  const gespeichert: string[] = [];
  for (const [schluessel, wert] of geaendert) {
    const { error } = await supabase.rpc("set_setting", {
      p_key: schluessel,
      p_value: wert,
    });

    if (error) {
      if (gespeichert.length > 0) auffrischen();
      const stand = gespeichert.length > 0
        ? `Schon gespeichert: ${gespeichert.join(", ")}. Die übrigen Änderungen sind nicht gespeichert.`
        : "Nichts wurde gespeichert.";
      return { ok: false, meldung: `${name(schluessel)}: ${translateDbError(error)} ${stand}` };
    }
    gespeichert.push(name(schluessel));
  }

  auffrischen();
  return { ok: true, meldung: "Einstellungen gespeichert." };
}
