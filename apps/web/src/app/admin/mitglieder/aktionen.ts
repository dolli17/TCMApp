"use server";

import { revalidatePath } from "next/cache";
import { memberLogin } from "@/lib/supabase/member-login";

export interface AnlegeErgebnis {
  ok: boolean;
  meldung: string;
  /** Bei Erfolg die Id des neuen Mitglieds, damit die Oberfläche dorthin führen kann. */
  id?: string;
}

/**
 * Neues Mitglied anlegen.
 *
 * Person, Mitgliedschaft und Grundrolle entstehen in einem Aufruf – die
 * Datenbank legt sie in einer Transaktion an, damit kein halbes Mitglied
 * zurückbleibt, wenn ein Schritt scheitert.
 *
 * Dazu gehört der Login: Es gibt keine Mitglieder ohne Login. Deshalb läuft
 * das Anlegen über die Edge Function `member-login`. Sie ruft create_member
 * mit dem Token des Admins auf und lädt danach sofort ein. Scheitert die
 * Einladung, nimmt sie das Mitglied wieder zurück.
 */
export async function mitgliedAnlegen(formData: FormData): Promise<AnlegeErgebnis> {
  const text = (name: string): string | undefined => {
    const wert = String(formData.get(name) ?? "").trim();
    return wert.length > 0 ? wert : undefined;
  };

  const vorname = text("first_name");
  const nachname = text("last_name");
  const email = text("email");

  // Billige Vorprüfung ohne Datenbankrunde. Die eigentliche Regel steht
  // trotzdem in create_member – hier geht es nur um schnelle Rückmeldung.
  if (!vorname || !nachname) {
    return { ok: false, meldung: "Vor- und Nachname sind Pflicht." };
  }
  if (!email) {
    return { ok: false, meldung: "Ohne E-Mail-Adresse kann kein Mitglied angelegt werden." };
  }

  const e = await memberLogin({
    aktion: "anlegen",
    daten: {
      p_first_name: vorname,
      p_last_name: nachname,
      p_email: email,
      p_birthday: text("birthday"),
      p_gender: text("gender"),
      p_salutation: text("salutation"),
      p_phone: text("phone"),
      p_mobile: text("mobile"),
      p_street: text("street"),
      p_postcode: text("postcode"),
      p_city: text("city"),
      p_number: text("number"),
      p_started_on: text("started_on"),
    },
  });

  if (!e.ok) return { ok: false, meldung: e.meldung };

  revalidatePath("/admin/mitglieder");
  return { ok: true, meldung: `${vorname} ${nachname} wurde angelegt. ${e.meldung}`, id: e.id };
}
