"use server";

import { headers } from "next/headers";
import { translateDbError } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";

export interface AntragsErgebnis {
  ok: boolean;
  meldung: string;
}

/**
 * Ein Aufnahmeantrag von außen.
 *
 * Der einzige Weg, auf dem jemand ohne Anmeldung etwas in diese Datenbank
 * schreibt. Zwei Schutzschichten liegen hier, zwei weitere in der Datenbank:
 *
 *   * Hier: ein Honigtopf-Feld, das kein Mensch ausfüllt, und eine
 *     Mindestverweildauer. Beides wird serverseitig geprüft – im Browser wäre
 *     es wirkungslos.
 *   * Dort: Sperren gegen Massenzusendungen und eine Antwort, die in jedem
 *     Fall gleich lautet.
 *
 * Die Herkunft wird aus dem Anfragekopf gelesen und der Datenbank übergeben,
 * die sie mit einem geheimen Zusatz hasht. Käme sie aus dem Browser, wäre sie
 * fälschbar und die Sperre wertlos.
 */
export async function antragEinreichen(formData: FormData): Promise<AntragsErgebnis> {
  const text = (name: string) => String(formData.get(name) ?? "").trim();

  // Honigtopf: per CSS versteckt, für Menschen unsichtbar. Was ihn ausfüllt,
  // ist ein Programm. Die Antwort bleibt trotzdem freundlich – wer es merkt,
  // baut den nächsten Versuch drumherum.
  if (text("website")) {
    return { ok: true, meldung: "Danke! Wir melden uns." };
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
  // Was bleibt, wirkt tatsächlich: der Honigtopf darüber, die drei Sperren in
  // der Datenbank, und der Spam-Knopf für den Rest.

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

  const kopf = await headers();
  // Der erste Eintrag ist die ursprüngliche Adresse; alles dahinter sind die
  // Zwischenstationen.
  const ip = (kopf.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || null;

  // Die Datenbank liest die Herkunft aus x-forwarded-for (S6). Ohne diesen
  // Kopf sähe sie für jeden Antrag aus dem Formular nur diesen Server, und die
  // Sperre je Herkunft träfe alle Antragsteller gemeinsam.
  const supabase = await createServerSupabase(ip ? { "x-forwarded-for": ip } : undefined);
  const { error } = await supabase.rpc("submit_membership_application", {
    p_data: {
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
    p_user_agent: kopf.get("user-agent") ?? undefined,
  });

  if (error) return { ok: false, meldung: translateDbError(error) };

  return { ok: true, meldung: "Danke! Wir melden uns." };
}
