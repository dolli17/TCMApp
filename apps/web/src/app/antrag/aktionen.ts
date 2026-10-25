"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { VERBINDUNGSFEHLER_TEXT, translateDbError } from "@tcm/core";
import { funktionsAdresse } from "@/lib/supabase/member-login";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AntragsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Ein Aufnahmeantrag von außen.
 *
 * Der einzige Weg, auf dem jemand ohne Anmeldung etwas in diese Datenbank
 * schreibt. Zwei Schutzschichten liegen hier, die übrigen dahinter:
 *
 *   * Hier: ein Honigtopf-Feld, das kein Mensch ausfüllt, serverseitig
 *     geprüft – im Browser wäre es wirkungslos.
 *   * Dahinter: die Edge Function mitgliedsantrag legt den Antrag unbestätigt
 *     an und schickt den Bestätigungslink (S22). Sperren gegen
 *     Massenzusendungen und eine Antwort, die in jedem Fall gleich lautet,
 *     stehen in der Datenbank.
 *
 * Die Herkunft wird aus dem Anfragekopf gelesen und weitergereicht; die
 * Datenbank hasht sie mit einem geheimen Zusatz. Käme sie aus dem Browser,
 * wäre sie fälschbar und die Sperre wertlos.
 */
export async function antragEinreichen(formData: FormData): Promise<AntragsErgebnis> {
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  // Honigtopf: per CSS versteckt, für Menschen unsichtbar. Was ihn ausfüllt,
  // ist ein Programm. Die Antwort bleibt trotzdem freundlich – wer es merkt,
  // baut den nächsten Versuch drumherum.
  if (text("website")) {
    return { ok: true, meldung: "Bitte bestätige deine E-Mail-Adresse." };
  }

  // Hier stand einmal eine Mindestverweildauer: alles unter drei Sekunden galt
  // als maschinell und wurde stumm verworfen. Sie ist wieder raus, und das ist
  // eine bewusste Entscheidung.
  //
  // Sie hat echte Anträge gekostet. Wer seine Anschrift per Autofill einsetzt,
  // ist in unter einer Sekunde fertig – sein Antrag verschwand, ohne dass
  // irgendjemand es merkte, weder er noch der Vorstand. Gegen einen
  // ernsthaften Absender half sie ohnedies nichts: warten kann ein Programm
  // besser als ein Mensch.
  //
  // Was bleibt, wirkt tatsächlich: der Honigtopf darüber, die Bestätigungsmail
  // und die Sperren in der Datenbank, und der Spam-Knopf für den Rest.

  if (!text("first_name") || !text("last_name")) {
    return { ok: false, meldung: "Bitte Vor- und Nachnamen angeben." };
  }
  if (!text("email")) {
    return { ok: false, meldung: "Ohne E-Mail-Adresse können wir nicht antworten." };
  }
  if (!text("birthday")) {
    return { ok: false, meldung: "Bitte das Geburtsdatum angeben." };
  }
  // Die übrigen Pflichtfelder prüft die Datenbank. Hier nur eine schnelle
  // Rückmeldung, falls das Formular ohne Browserprüfung abgeschickt wurde.
  if (["gender", "mobile", "street", "postcode", "city"].some((f) => !text(f))) {
    return { ok: false, meldung: "Bitte alle Pflichtfelder ausfüllen." };
  }

  const adresse = funktionsAdresse();
  if (!adresse) {
    return { ok: false, meldung: "Anträge können gerade nicht angenommen werden. Bitte versuch es später noch einmal." };
  }

  const kopf = await headers();
  // Der erste Eintrag ist die ursprüngliche Adresse; alles dahinter sind die
  // Zwischenstationen. Ohne diesen Kopf sähe die Datenbank für jeden Antrag
  // nur diesen Server, und die Sperre je Herkunft träfe alle gemeinsam (S6).
  const ip = (kopf.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;

  let antwort: Response;
  try {
    antwort = await fetch(`${adresse}/mitgliedsantrag`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        ...(ip ? { "x-forwarded-for": ip } : {}),
      },
      body: JSON.stringify({
        daten: {
          first_name: text("first_name"),
          last_name: text("last_name"),
          birthday: text("birthday"),
          gender: text("gender"),
          email: text("email"),
          mobile: text("mobile"),
          street: text("street"),
          postcode: text("postcode"),
          city: text("city"),
          desired_fee_type_id: text("desired_fee_type_id") || null,
          message: text("message") || null,
        },
        userAgent: kopf.get("user-agent") ?? null,
      }),
      cache: "no-store",
    });
  } catch (fehler) {
    console.error("mitgliedsantrag nicht erreichbar:", fehler);
    return { ok: false, meldung: VERBINDUNGSFEHLER_TEXT };
  }

  let ergebnis: { ok?: boolean; meldung?: string; code?: string; details?: string };
  try {
    ergebnis = await antwort.json();
  } catch {
    return { ok: false, meldung: `Unerwartete Antwort (${antwort.status}).` };
  }

  if (!ergebnis.ok) {
    const meldung = ergebnis.meldung ?? "Das hat nicht geklappt.";
    // Fehler aus der RPC tragen code/details und gehen durch die übliche
    // Übersetzung; die eigenen Sätze der Function sind schon für Menschen.
    return {
      ok: false,
      meldung:
        ergebnis.code !== undefined || ergebnis.details !== undefined
          ? translateDbError({ message: meldung, code: ergebnis.code, details: ergebnis.details })
          : meldung,
    };
  }

  return { ok: true, meldung: "Bitte bestätige deine E-Mail-Adresse." };
}

/**
 * Den Antrag zum Link aus der Mail bestätigen.
 *
 * Auf Knopfdruck und nicht schon beim Öffnen der Seite: Linkprüfer in
 * Postfächern rufen jeden Link einmal ab. Danach zurück auf dieselbe Seite,
 * die jetzt „bestätigt“ zeigt – auch beim Neuladen, ohne erneut zu senden.
 */
export async function antragBestaetigen(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const supabase = await createServerSupabase();
  // Das Ergebnis liest die Seite danach selbst am Token ab.
  const { error } = await supabase.rpc("confirm_membership_application", { p_token: token });
  redirect(`/antrag/bestaetigen?token=${encodeURIComponent(token)}${error ? "&fehler=1" : ""}`);
}
