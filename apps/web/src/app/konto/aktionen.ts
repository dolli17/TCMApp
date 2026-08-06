"use server";

import { revalidatePath } from "next/cache";
import { memberProfileSchema, translateDbError } from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Eigene Stammdaten speichern.
 *
 * Anders als in der Adminansicht läuft das hier ohne RPC: die Policy
 * `members_update_own` und der Spalten-Grant auf `public.members` erlauben
 * genau diese Felder, und der Trigger `guard_member_self_update` weist alles
 * ab, was nicht auf seiner Erlaubnisliste steht. Die Regel steht also weiterhin
 * in der Datenbank – nur eben als Rechteentscheid statt als Funktion.
 *
 * Hier wird `memberProfileSchema` aus @tcm/core zum ersten Mal wirklich
 * benutzt. Es beschreibt genau die Felder, die der Spalten-Grant abdeckt.
 */
export async function eigeneDatenSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;
  if (!meineId) return { ok: false, meldung: "Nicht angemeldet." };

  const wert = (feld: string) => String(formData.get(`wert:${feld}`) ?? "");
  const alt = (feld: string) => String(formData.get(`alt:${feld}`) ?? "");

  const felder = [
    "first_name",
    "last_name",
    "title",
    "phone",
    "mobile",
    "street",
    "postcode",
    "city",
  ] as const;

  const geaendert = felder.filter((f) => wert(f) !== alt(f));
  if (geaendert.length === 0) return { ok: false, meldung: "Nichts geändert." };

  // Erst prüfen, dann schicken: eine vierstellige Postleitzahl soll nicht als
  // Datenbankfehler zurückkommen, sondern als Satz, der das Feld nennt.
  const geprueft = memberProfileSchema.safeParse({
    firstName: wert("first_name"),
    lastName: wert("last_name"),
    title: wert("title"),
    phone: wert("phone"),
    mobile: wert("mobile"),
    street: wert("street"),
    postcode: wert("postcode"),
    city: wert("city"),
  });

  if (!geprueft.success) {
    const erster = geprueft.error.issues[0];
    return { ok: false, meldung: erster?.message ?? "Bitte die Eingaben prüfen." };
  }

  const d = geprueft.data;

  // Nur die geänderten Spalten schicken. Vor- und Nachname sind in der
  // Datenbank NOT NULL – sie dürfen deshalb nicht als null im Patch landen,
  // und der Typ hier sagt das auch.
  const patch: {
    first_name?: string;
    last_name?: string;
    title?: string | null;
    phone?: string | null;
    mobile?: string | null;
    street?: string | null;
    postcode?: string | null;
    city?: string | null;
  } = {};

  const dabei = (f: (typeof felder)[number]) => geaendert.includes(f);

  if (dabei("first_name")) patch.first_name = d.firstName;
  if (dabei("last_name")) patch.last_name = d.lastName;
  if (dabei("title")) patch.title = d.title || null;
  if (dabei("phone")) patch.phone = d.phone || null;
  if (dabei("mobile")) patch.mobile = d.mobile || null;
  if (dabei("street")) patch.street = d.street || null;
  if (dabei("postcode")) patch.postcode = d.postcode || null;
  if (dabei("city")) patch.city = d.city || null;

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("members").update(patch).eq("id", meineId);

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/konto");
  return { ok: true, meldung: "Gespeichert." };
}

/**
 * Notfallkontakt speichern.
 *
 * Eigene Aktion, weil die Felder nicht zu `memberProfileSchema` gehören – und
 * weil es ein eigener Gedanke ist: wen rufen wir an, wenn etwas passiert.
 */
export async function notfallkontaktSpeichern(formData: FormData): Promise<AktionsErgebnis> {
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;
  if (!meineId) return { ok: false, meldung: "Nicht angemeldet." };

  const wert = (feld: string) => String(formData.get(`wert:${feld}`) ?? "").trim();

  const name = wert("emergency_contact_name");
  const telefon = wert("emergency_contact_phone");

  // Der Constraint in der Datenbank verlangt dasselbe; hier steht es nur früher
  // und in einem Satz, der erklärt warum.
  if (telefon && !name) {
    return { ok: false, meldung: "Zur Notfallnummer gehört auch ein Name." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("members")
    .update({
      emergency_contact_name: name || null,
      emergency_contact_phone: telefon || null,
      emergency_contact_relation: wert("emergency_contact_relation") || null,
    })
    .eq("id", meineId);

  if (error) return { ok: false, meldung: translateDbError(error) };

  revalidatePath("/konto");
  return { ok: true, meldung: "Notfallkontakt gespeichert." };
}
