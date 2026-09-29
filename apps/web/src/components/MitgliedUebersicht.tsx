import Link from "next/link";
import { formatCents } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";

/** Die Unterseiten eines Mitglieds (?teil=…) */
export type MitgliedTeil =
  | "stammdaten" | "mitgliedschaft" | "beitraege" | "forderungen" | "bank"
  | "merkmale" | "zugang" | "protokoll" | "austritt";

const OFFEN = ["open", "notified", "returned"] as const;

/**
 * Ein Mitglied, aufgebaut wie das eigene Konto
 * (docs/design/clubhaus/verwaltung, Regel 6, Entwürfe VwMitglied und
 * VwDeskMitglieder).
 *
 * Kopf mit Avatar, Name, Nummer und Marken, drei Schnellaktionen, darunter
 * gruppierte Abschnitte. Jede Zeile führt auf eine Unterseite (?teil=…), dort
 * stehen die Formulare wie bisher. Am Ende Protokoll, Zugang und Austritt.
 *
 * `kompakt` ist die rechte Spalte am Desktop (Liste + Detail).
 */
export async function MitgliedUebersicht({ id, kompakt = false }: { id: string; kompakt?: boolean }) {
  const supabase = await createServerSupabase();
  const jahr = Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date()));

  const [mitgliedRes, mitgliedschaftRes, beitraegeRes, forderungenRes, finanzenRes, merkmaleRes, dienstRes, letzterRes] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, first_name, last_name, email, phone, mobile, status, auth_user_id, login_disabled_at, emergency_contact_name, billing_payer_id, teams(name)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("number, started_on, ended_on")
        .eq("member_id", id)
        .order("started_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("member_fees").select("fee_types(name)").eq("member_id", id).eq("year", jahr),
      supabase
        .from("charges")
        .select("amount_cents, status")
        .or(`member_id.eq.${id},payer_id.eq.${id}`)
        .in("status", OFFEN),
      supabase.rpc("member_finances", { p_member_id: id }),
      supabase.rpc("member_attributes", { p_member_id: id }),
      supabase.rpc("work_duty_overview", { p_year: jahr }),
      supabase
        .from("work_duty_entries")
        .select("worked_on")
        .eq("member_id", id)
        .order("worked_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const m = mitgliedRes.data;
  if (!m) return <div className="hinweis fehler">Dieses Mitglied gibt es nicht.</div>;

  // Das Mandat haengt am Zahler; wer fremdgezahlt wird, sieht das des Zahlers.
  const zahlerId = m.billing_payer_id ?? m.id;
  const { data: zahlerMandate } = m.billing_payer_id
    ? await supabase.from("sepa_mandates").select("id").eq("member_id", zahlerId).eq("status", "active")
    : { data: null };

  const s = mitgliedschaftRes.data;
  const arten = (beitraegeRes.data ?? []).map((b) => b.fee_types?.name).filter(Boolean) as string[];
  const offen = forderungenRes.data ?? [];
  const offenSumme = offen.reduce((x, f) => x + f.amount_cents, 0);
  const finanzen = finanzenRes.data ?? [];
  const konto = finanzen.find((f) => f.konto_aktiv) ?? null;
  const mandatDa = m.billing_payer_id
    ? (zahlerMandate ?? []).length > 0
    : finanzen.some((f) => f.mandat_status === "active");
  const merkmale = merkmaleRes.data ?? [];
  const einwilligungen = merkmale.filter((x) => x.value_kind === "boolean");
  const erteilt = einwilligungen.filter((x) => x.set_at && x.option_value !== "false").length;
  const sonstigeMerkmale = merkmale.filter((x) => x.value_kind !== "boolean" && x.set_at).length;
  const dienst = (dienstRes.data ?? []).find((d) => d.member_id === id) ?? null;
  const zugang = Boolean(m.auth_user_id) && !m.login_disabled_at;
  const telefon = m.mobile ?? m.phone;
  const name = `${m.first_name} ${m.last_name}`;
  const kurz = (m.first_name[0] ?? "") + (m.last_name[0] ?? "");
  const teil = (t: MitgliedTeil) => `/admin/mitglieder/${id}?teil=${t}`;
  const datum = (iso: string) => new Intl.DateTimeFormat("de-DE").format(new Date(iso));

  const schnell = [
    { name: "Anrufen", href: telefon ? `tel:${telefon.replace(/\s/g, "")}` : null, d: TELEFON },
    { name: kompakt ? "E-Mail schreiben" : "E-Mail", href: m.email ? `mailto:${m.email}` : null, d: POST },
    { name: kompakt ? "Einladung senden" : "Einladen", href: zugang ? null : teil("zugang"), d: SENDEN },
  ];

  return (
    <div className={`mitglied-uebersicht${kompakt ? " kompakt" : ""}`}>
      <header className="mitglied-profil">
        <span className="avatar gross" aria-hidden="true">{kurz}</span>
        <div className="text">
          {kompakt ? <h2 id="detail-name">{name}</h2> : <h1>{name}</h1>}
          <div className="meta">
            {[s?.number ? `Nr. ${s.number}` : null, s?.started_on ? `Mitglied seit ${s.started_on.slice(0, 4)}` : null, kompakt ? m.email : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="marken-reihe">
            {m.status !== "active" && (
              <span className="statusmarke rot">{m.status === "archived" ? "archiviert" : "inaktiv"}</span>
            )}
            {arten[0] && <span className="statusmarke">{arten[0]}</span>}
            {m.teams?.name && <span className="statusmarke">{m.teams.name}</span>}
            <span className={`statusmarke ${zugang ? "gruen" : ""}`}>{zugang ? "App-Zugang aktiv" : "kein Zugang"}</span>
          </div>
        </div>
        <div className="schnell">
          {schnell.map((x) =>
            x.href ? (
              <a key={x.name} href={x.href} className="schnellaktion" aria-label={kompakt ? x.name : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d={x.d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{x.name}</span>
              </a>
            ) : (
              <span key={x.name} className="schnellaktion aus" aria-disabled="true" aria-label={kompakt ? x.name : undefined}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d={x.d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{x.name}</span>
              </span>
            ),
          )}
          {kompakt && (
            <Link href={teil("stammdaten")} className="knopf leise">
              Bearbeiten
            </Link>
          )}
        </div>
      </header>

      <div className="mitglied-gruppen">
        <section className="liste-abschnitt" aria-labelledby={`h-ms-${id}`}>
          <Gruppenkopf titel="Mitgliedschaft" id={`h-ms-${id}`} />
          <nav className="liste-gruppe" aria-label="Mitgliedschaft">
            <Listenzeile href={teil("beitraege")} titel="Art" hinweis={arten.join(" + ") || "keine"} />
            <Listenzeile href={teil("mitgliedschaft")} titel="Mannschaft" hinweis={m.teams?.name ?? "keine"} />
            <Listenzeile href={teil("merkmale")} titel="Merkmale" hinweis={String(sonstigeMerkmale)} />
          </nav>
        </section>

        <section className="liste-abschnitt" aria-labelledby={`h-geld-${id}`}>
          <Gruppenkopf
            titel="Geld"
            id={`h-geld-${id}`}
            neben={offenSumme > 0 ? <span className="gold-ink">{formatCents(offenSumme)} offen</span> : undefined}
          />
          <nav className="liste-gruppe" aria-label="Geld">
            <Listenzeile
              href={teil("forderungen")}
              titel="Forderungen"
              hinweis={offen.length > 0 ? `${offen.length} offen` : "keine offen"}
              hinweisTon={offen.length > 0 ? "gold" : "leise"}
            />
            <Listenzeile
              href={teil("bank")}
              titel="SEPA-Mandat"
              hinweis={mandatDa ? (m.billing_payer_id ? "beim Zahler" : "liegt vor") : "fehlt"}
              hinweisTon={mandatDa ? "gruen" : "rot"}
            />
            <Listenzeile href={teil("bank")} titel="Konto" hinweis={konto ? `•• ${konto.iban_last4}` : "keins"} />
            <Listenzeile href={teil("beitraege")} titel="Beitragsarten" hinweis={String(arten.length)} />
          </nav>
        </section>

        <section className="liste-abschnitt" aria-labelledby={`h-daten-${id}`}>
          <Gruppenkopf titel="Kontakt & Daten" id={`h-daten-${id}`} />
          <nav className="liste-gruppe" aria-label="Kontakt und Daten">
            <Listenzeile href={teil("stammdaten")} titel="Stammdaten" />
            <Listenzeile
              href={teil("stammdaten")}
              titel="Notfallkontakt"
              hinweis={m.emergency_contact_name ? "hinterlegt" : "fehlt"}
            />
            <Listenzeile
              href={teil("merkmale")}
              titel="Einwilligungen"
              hinweis={`${erteilt} von ${einwilligungen.length}`}
            />
          </nav>
        </section>

        <section className="liste-abschnitt" aria-labelledby={`h-dienst-${id}`}>
          <Gruppenkopf titel={`Arbeitsdienst ${jahr}`} id={`h-dienst-${id}`} />
          <Link href="/admin/arbeitsdienst" className="karte dienst-karte">
            {dienst ? (
              <>
                <span className="zeile">
                  <span>Geleistet</span>
                  <b className="dpl tnum">
                    {Number(dienst.completed_hours)} / {Number(dienst.required_hours)} h
                  </b>
                </span>
                <span className="balken" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.min(100, (Number(dienst.completed_hours) / Math.max(1, Number(dienst.required_hours))) * 100)}%`,
                    }}
                  />
                </span>
                <span className="zeile klein">
                  <span>{letzterRes.data ? `Letzter Eintrag ${datum(letzterRes.data.worked_on)}` : "Noch kein Eintrag"}</span>
                  <span className="link">Stunden eintragen</span>
                </span>
              </>
            ) : (
              <span className="zeile klein">
                <span>Für die Beitragsart ist kein Arbeitsdienst vorgesehen.</span>
              </span>
            )}
          </Link>
        </section>
      </div>

      <nav className="liste-gruppe mitglied-ende" aria-label="Weiteres">
        <Listenzeile href={teil("protokoll")} titel="Änderungsprotokoll" pfeil={false} />
        <Listenzeile href={teil("zugang")} titel={zugang ? "Zugang sperren" : "Zugang"} pfeil={false} />
        <Listenzeile href={teil("austritt")} titel="Austritt eintragen" gefahr pfeil={false} />
      </nav>
    </div>
  );
}

const TELEFON =
  "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z";
const POST = "M3 5h18v14H3zM3 6l9 7 9-7";
const SENDEN = "M22 2 11 13M22 2l-7 20-4-9-9-4z";
