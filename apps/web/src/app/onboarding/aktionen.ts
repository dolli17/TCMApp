"use server";

import { revalidatePath } from "next/cache";
import { translateDbError } from "@tcm/core";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";

export interface AktionsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Die Schritte des Onboardings, je eine Aktion.
 *
 * Geprüft wird in den RPCs (Migration onboarding_grundlagen): Pflichtfelder,
 * Minderjährigkeit, IBAN, Gläubigerdaten. Hier wird nur weitergereicht und
 * der Fehler in einen Satz übersetzt.
 */

function fertig(meldung = "Gespeichert."): AktionsErgebnis {
  revalidatePath("/onboarding");
  return { ok: true, meldung };
}

function leer(wert: string | null | undefined): string | undefined {
  const t = (wert ?? "").trim();
  return t ? t : undefined;
}

export async function stammdatenSpeichern(d: {
  first_name: string;
  last_name: string;
  birthday: string;
  gender: string;
  phone: string;
  mobile: string;
  street: string;
  postcode: string;
  city: string;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("onboarding_save_stammdaten", {
    p_first_name: d.first_name,
    p_last_name: d.last_name,
    // Leer schickt die RPC als "Geburtsdatum fehlt" zurück, nicht als Formatfehler.
    p_birthday: leer(d.birthday) as string,
    p_gender: (leer(d.gender) ?? null) as "female" | "male" | "diverse",
    p_street: d.street,
    p_postcode: d.postcode,
    p_city: d.city,
    p_phone: leer(d.phone),
    p_mobile: leer(d.mobile),
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return fertig();
}

export async function dokumenteAkzeptieren(codes: string[]): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("onboarding_accept_documents", { p_codes: codes });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return fertig();
}

export async function erziehungsberechtigteSpeichern(d: {
  name: string;
  email: string;
  phone: string;
  zustimmung: boolean;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("onboarding_save_guardian", {
    p_name: d.name,
    p_email: leer(d.email),
    p_phone: leer(d.phone),
    p_consent: d.zustimmung,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return fertig();
}

export async function notfallkontaktSpeichern(d: {
  name: string;
  phone: string;
  relation: string;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("onboarding_save_notfallkontakt", {
    p_name: d.name,
    p_phone: d.phone,
    p_relation: leer(d.relation),
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return fertig();
}

/**
 * Das Konto freischalten. complete_onboarding prüft alle Pflichtschritte
 * noch einmal selbst; fehlt etwas, nennt die Meldung, was.
 */
export async function onboardingAbschliessen(): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("complete_onboarding");
  if (error) return { ok: false, meldung: translateDbError(error) };
  // Ab jetzt gilt der volle Rahmen mit Menü, auch auf den übrigen Seiten.
  revalidatePath("/", "layout");
  return fertig("Dein Konto ist freigeschaltet.");
}

/** Mandat erteilen und gleich abschließen: mit dem Mandat ist das Konto frei. */
export async function mandatErteilen(d: {
  iban: string;
  kontoinhaber: string;
  bestaetigt: boolean;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("create_my_sepa_mandate", {
    p_iban: d.iban,
    p_holder: leer(d.kontoinhaber),
    p_accept: d.bestaetigt,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  revalidatePath("/konto/bank");
  return onboardingAbschliessen();
}

export async function einwilligungenSpeichern(
  gewaehlt: string[],
  angeboten: string[],
): Promise<AktionsErgebnis> {
  const ich = (await getCurrentMember())?.member?.id;
  if (!ich) return { ok: false, meldung: "Nicht angemeldet." };
  const supabase = await createServerSupabase();

  for (const code of angeboten) {
    const { error } = gewaehlt.includes(code)
      ? await supabase.rpc("set_member_attribute", { p_member_id: ich, p_type_code: code })
      : await supabase.rpc("remove_member_attribute", { p_member_id: ich, p_type_code: code });
    if (error) return { ok: false, meldung: translateDbError(error) };
  }
  revalidatePath("/konto/einwilligungen");
  return fertig();
}

export async function tennisSpeichern(d: {
  tennis_lk: string;
  nuliga_id: string;
  mannschaft_interesse: boolean;
}): Promise<AktionsErgebnis> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("save_my_tennis", {
    p_tennis_lk: leer(d.tennis_lk),
    p_nuliga_id: leer(d.nuliga_id),
    p_mannschaft_interesse: d.mannschaft_interesse,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  return fertig();
}

/** E-Mails zu Buchungen: das Merkmal booking_mail lässt genau einen Wert zu. */
export async function buchungsmailsSpeichern(
  wert: string,
  bisher: string | null,
): Promise<AktionsErgebnis> {
  const ich = (await getCurrentMember())?.member?.id;
  if (!ich) return { ok: false, meldung: "Nicht angemeldet." };
  if (wert === bisher) return fertig();
  const supabase = await createServerSupabase();

  if (bisher) {
    const { error } = await supabase.rpc("remove_member_attribute", {
      p_member_id: ich,
      p_type_code: "booking_mail",
      p_option_value: bisher,
    });
    if (error) return { ok: false, meldung: translateDbError(error) };
  }
  const { error } = await supabase.rpc("set_member_attribute", {
    p_member_id: ich,
    p_type_code: "booking_mail",
    p_option_value: wert,
  });
  if (error) return { ok: false, meldung: translateDbError(error) };
  revalidatePath("/konto/einwilligungen");
  return fertig();
}
