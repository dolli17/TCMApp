import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { MitgliederBereiche } from "@/components/MitgliederBereiche";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import {
  ArbeitsdienstListe, type DienstZeile, type SollZeile,
} from "@/components/ArbeitsdienstListe";

export const dynamic = "force-dynamic";

/**
 * Der Arbeitsdienst.
 *
 * Unter „Mitglieder", nicht unter „Kasse": die tägliche Arbeit ist „wer war da,
 * wie viele Stunden" — eine Personenliste. Erst der Jahresausgleich macht
 * daraus Geld, und die Forderung taucht dann in der Kasse auf.
 *
 * Bis hierher gab es drei Tabellen, eine getestete Rechenlogik und genau eine
 * lesende Funktion. Niemand konnte je eine Stunde eintragen; der Stand jedes
 * Mitglieds stand dauerhaft auf null.
 */
export default async function ArbeitsdienstSeite({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrParam } = await searchParams;
  const aktuell = new Date().getFullYear();
  const jahr = Number(jahrParam) || aktuell;

  const supabase = await createServerSupabase();

  const [standRes, artenRes, satzRes] = await Promise.all([
    supabase.rpc("work_duty_overview", { p_year: jahr }),
    supabase.rpc("fee_type_overview", { p_year: jahr }),
    supabase.from("settings").select("value").eq("key", "work_duty.hourly_rate_cents").maybeSingle(),
  ]);

  const satz = Number(satzRes.data?.value ?? 1500);

  return (
    <div className="verwaltung">
      <VerwaltungsKopf
        kicker="Verwaltung · Mitglieder"
        titel="Arbeitsdienst"
        unterzeile="Wer wie viele Stunden schuldet, was geleistet wurde und was am Jahresende offen bleibt."
      />
      <MitgliederBereiche aktiv="/admin/mitglieder/arbeitsdienst" />

      <nav className="filterchips" aria-label="Jahr">
        <Link href={`/admin/mitglieder/arbeitsdienst?jahr=${jahr - 1}`}>‹ {jahr - 1}</Link>
        <Link href={`/admin/mitglieder/arbeitsdienst?jahr=${jahr}`} aria-current="true">
          {jahr}
        </Link>
        <Link href={`/admin/mitglieder/arbeitsdienst?jahr=${jahr + 1}`}>{jahr + 1} ›</Link>
        {jahr !== aktuell && <Link href="/admin/mitglieder/arbeitsdienst">Dieses Jahr</Link>}
      </nav>

      <ArbeitsdienstListe
        jahr={jahr}
        zeilen={(standRes.data ?? []) as unknown as DienstZeile[]}
        arten={((artenRes.data ?? []) as unknown as SollZeile[]).filter((a) => a.id)}
        stundensatzCents={satz}
        abrechenbar={jahr < aktuell}
      />
    </div>
  );
}
