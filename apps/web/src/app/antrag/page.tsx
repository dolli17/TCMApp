import Image from "next/image";
import Link from "next/link";
import logo from "@tcm/ui/logo.png";
import { createServerSupabase } from "@/lib/supabase/server";
import { Antragsformular, type FormularOption } from "@/components/Antragsformular";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mitglied werden – TC Muckensturm",
  description: "Aufnahmeantrag beim TC Muckensturm",
};

/**
 * Aufnahmeantrag, ohne Anmeldung erreichbar.
 *
 * Die Auswahllisten kommen über eine eigene Funktion, die `anon` aufrufen
 * darf – Beitragsarten und die Einwilligungen, die im Antrag abgefragt werden
 * sollen. Auf die Tabellen selbst hat ein nicht angemeldeter Besucher keinen
 * Zugriff.
 */
export default async function AntragSeite() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.rpc("application_form_options");

  return (
    <div className="auth antragsseite">
      <div className="crown">
        <Image src={logo} alt="TC Muckensturm" height={34} priority />
        <h1>Mitglied werden.</h1>
        <p>Acht Sandplätze, rund 300 Mitglieder und ein Platz für dich.</p>
      </div>

      <div className="sheet">
        <p className="unterzeile">
          Fülle den Antrag aus – der Vorstand meldet sich bei dir. Es ist noch nichts verbindlich.
        </p>

        <Antragsformular optionen={(data ?? []) as FormularOption[]} />

        <p className="beschreibung" style={{ marginTop: 20 }}>
          Schon Mitglied? <Link href="/login">Hier geht es zur Anmeldung.</Link>
        </p>
      </div>
    </div>
  );
}
