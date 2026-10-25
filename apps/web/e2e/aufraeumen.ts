import { createClient } from "@supabase/supabase-js";
import { istLokalerStack, sqlLokal } from "./lokale-db";

/**
 * Testanträge wegräumen – vor und nach dem Lauf.
 *
 * Eingegangene Anträge zählen auf die Sperren des öffentlichen Formulars:
 * zehn je Herkunft und Stunde. Vom Testrechner kommen sie alle von derselben
 * Adresse, und ohne Aufräumen sperrt sich der Testlauf nach ein paar
 * Durchgängen selbst aus – die Sperre tut dann genau das, wofür sie gebaut
 * ist, nur eben gegen uns.
 *
 * Deshalb läuft das hier als globalSetup UND als globalTeardown: vorher, damit
 * jeder Lauf mit einem definierten Zustand beginnt, nachher, damit er nichts
 * hinterlässt.
 *
 * Fehler dürfen den Lauf nie kippen – auch nicht beim Setup.
 */
export default async function aufraeumen() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.DEV_USER_ADMIN;
  const passwort = process.env.DEV_PASSWORD;

  // Unbestätigte Anträge (S22) sieht die Verwaltung nicht und kann sie
  // deshalb auch nicht löschen. Lokal gehen sie direkt in der Datenbank weg,
  // sonst nach einem Tag mit dem Aufräumjob.
  if (istLokalerStack()) {
    try {
      sqlLokal(
        "delete from public.membership_applications where confirmed_at is null and last_name like 'ZZTest%';",
        "Unbestätigte Testanträge ließen sich nicht löschen",
      );
    } catch {
      // Still, wie unten.
    }
  }

  if (!url || !key || !email || !passwort) return;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { error: anmeldeFehler } = await supabase.auth.signInWithPassword({
      email,
      password: passwort,
    });
    if (anmeldeFehler) return;

    // Alle Testdatensätze tragen dieses Präfix, siehe hilfen.ts.
    const { error, count } = await supabase
      .from("membership_applications")
      .delete({ count: "exact" })
      .like("last_name", "ZZTest%");

    if (!error && count) {
      // eslint-disable-next-line no-console
      console.log(`Aufgeräumt: ${count} Testanträge entfernt.`);
    }
  } catch {
    // Still: der Testlauf ist längst bewertet.
  }
}
