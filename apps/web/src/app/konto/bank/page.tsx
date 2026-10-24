import Link from "next/link";
import { createServerSupabase, getCurrentMember } from "@/lib/supabase/server";
import { KontoUnterseite } from "@/components/KontoUnterseite";

export const dynamic = "force-dynamic";

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

/**
 * Bankverbindung & Mandat - nur lesen. Die IBAN steht ausschliesslich mit
 * ihren letzten vier Stellen da; geaendert wird sie ueber den Vorstand.
 */
export default async function BankSeite() {
  const supabase = await createServerSupabase();
  const angemeldet = await getCurrentMember();
  const meineId = angemeldet?.member?.id;

  const { data: mandat } = meineId
    ? await supabase
        .from("sepa_mandates")
        .select("reference, signed_on, status, granted_online_at, bank_accounts(holder, bank_name, iban_last4)")
        .eq("member_id", meineId)
        .eq("status", "active")
        .order("signed_on", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const konto = mandat ? (Array.isArray(mandat.bank_accounts) ? mandat.bank_accounts[0] : mandat.bank_accounts) : null;

  return (
    <KontoUnterseite titel="Bankverbindung & Mandat">
      {!mandat ? (
        // Kein Mandat ist kein Fehler, aber das Mitglied braucht einen Weg
        // dorthin (U56). Eine Vereinsadresse kennt die App nicht; sie steht im
        // Impressum, das der Vorstand pflegt.
        <div className="karte bank-ohne-mandat">
          <p>Es liegt noch kein SEPA-Mandat vor. Das Mandat legt der Vorstand mit dir an – schreib ihm oder sprich ihn im Verein an.</p>
          <p><Link href="/impressum#kontakt">So erreichst du den Vorstand</Link></p>
        </div>
      ) : (
        <dl className="gruppe angaben">
          <div><dt>Kontoinhaber</dt><dd>{konto?.holder ?? "–"}</dd></div>
          <div><dt>IBAN</dt><dd className="tnum">{konto?.iban_last4 ? `•••• ${konto.iban_last4}` : "–"}</dd></div>
          <div><dt>Bank</dt><dd>{konto?.bank_name ?? "–"}</dd></div>
          <div><dt>Mandatsreferenz</dt><dd className="tnum">{mandat.reference}</dd></div>
          <div>
            <dt>{mandat.granted_online_at ? "Online erteilt am" : "Unterschrieben am"}</dt>
            <dd className="tnum">{DATUM.format(new Date(mandat.signed_on))}</dd>
          </div>
        </dl>
      )}
      {mandat && (
        <p className="beschreibung">
          Die Bankverbindung ändert der Vorstand – <Link href="/impressum#kontakt">schreib ihm</Link>, wenn sich
          etwas geändert hat.
        </p>
      )}
    </KontoUnterseite>
  );
}
