import Link from "next/link";
import { CHARGE_KINDS, CHARGE_KIND_LABEL, formatCents, type ChargeKind } from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import { FensterKnopf } from "@/components/FensterKnopf";
import { KassenKennzahlen } from "@/components/KassenKennzahlen";
import { LaufAnlegen } from "@/components/LaufAnlegen";
import { LaufListe, type LaufZeile } from "@/components/LaufListe";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";
import { BereichSegmente } from "@/components/BereichSegmente";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { AnkuendigungsKarte } from "@/components/AnkuendigungsKarte";
import { AnkuendigungNachArt, type AnkuendbarZeile } from "@/components/AnkuendigungNachArt";
import { ForderungAnlegen } from "@/components/ForderungAnlegen";
import { BeitragslaufKarte } from "@/components/BeitragslaufKarte";
import { BeitragsartenPflege, type BeitragsartZeile } from "@/components/BeitragsartenPflege";
import { ForderungsListe, type ForderungZeile } from "@/components/ForderungsListe";
import { GetraenkemonatKarte, type MonatZeile } from "@/components/GetraenkemonatKarte";

export const dynamic = "force-dynamic";

const ABSCHNITTE = [
  { wert: "forderungen", label: "Forderungen" },
  { wert: "abrechnen", label: "Abrechnen" },
  { wert: "lastschrift", label: "Lastschriften" },
  { wert: "beitraege", label: "Jahresbeiträge" },
  { wert: "arten", label: "Beitragsarten" },
  { wert: "regeln", label: "Regeln" },
] as const;

/**
 * Die drei Teile des Segment-Schalters (Regel 1); der Rest sind Unterseiten.
 *
 * Sie folgen dem Weg des Geldes: abrechnen (Forderungen entstehen), in den
 * Forderungen ankündigen, mit einem Lastschriftlauf einziehen. Das Wort
 * „Lauf“ steht nur noch für den Lastschriftlauf - früher hieß auch das
 * Erzeugen der Beitragsforderungen „Beitragslauf“, und niemand wusste, was
 * ein Lauf eigentlich einzieht.
 */
const SEGMENTE = ["forderungen", "abrechnen", "lastschrift"];

/** Alte Adressen aus Lesezeichen und Links. */
const ALIAS: Record<string, string> = { lauf: "beitraege", getraenke: "abrechnen" };

/** Unterseiten führen dorthin zurück, wo sie verlinkt sind. */
const ZURUECK: Record<string, string> = { beitraege: "abrechnen", arten: "abrechnen", regeln: "abrechnen" };

/**
 * Alles, was Geld betrifft, an einem Ort.
 *
 * Vorher hieß der Bereich „Beiträge" und konnte nur eine Vorschau zeigen. Der
 * Getränkemonat wurde nirgends geschlossen, Forderungen entstanden gar nicht,
 * und die Beitragspreise ließen sich nur direkt in der Datenbank ändern.
 *
 * Die Abschnitte folgen dem Weg des Geldes: unter „Abrechnen“ entstehen die
 * Forderungen (Jahresbeiträge, Getränkemonate, Arbeitsdienst, von Hand), unter
 * „Forderungen“ werden sie angekündigt und beantworten „wer schuldet uns noch
 * was“, unter „Lastschriften“ werden sie eingezogen.
 */
export default async function KasseSeite({
  searchParams,
}: {
  searchParams: Promise<{ abschnitt?: string; jahr?: string; stand?: string; art?: string }>;
}) {
  const { abschnitt: roh, jahr: jahrParam, stand, art: artParam } = await searchParams;
  const abschnitt = roh ? (ALIAS[roh] ?? roh) : undefined;
  const gewaehlt = ABSCHNITTE.some((a) => a.wert === abschnitt) ? abschnitt! : "forderungen";
  const art = CHARGE_KINDS.includes(artParam as ChargeKind) ? (artParam as ChargeKind) : null;
  const unterseite = SEGMENTE.includes(gewaehlt) ? null : ABSCHNITTE.find((a) => a.wert === gewaehlt)!;
  const jahr = Number(jahrParam) || new Date().getFullYear();

  const supabase = await createServerSupabase();

  const [
    vorschauRes, einstellungRes, monateRes, forderungenRes, artenRes, offenRes, laeufeRes,
    mitgliederRes, ...ankuendbarRes
  ] = await Promise.all([
    gewaehlt === "beitraege"
      ? supabase.rpc("fee_run_preview", { p_year: jahr })
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("settings")
      .select("key, value, value_type, label, description, updated_at")
      .or("key.like.sepa.%,key.like.fees.%")
      .order("key"),
    gewaehlt === "abrechnen"
      ? supabase.rpc("billing_period_overview", { p_limit: 18 })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "forderungen"
      ? supabase.rpc("charge_overview", {
          p_status: (stand ?? undefined) as never,
          p_kind: art ?? undefined,
          p_limit: 500,
        })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "arten"
      ? supabase.rpc("fee_type_overview", { p_year: jahr })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "beitraege"
      ? supabase.rpc("announceable_charges", { p_kind: "fee", p_period_label: String(jahr) })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "lastschrift"
      ? supabase.rpc("debit_batch_overview", { p_limit: 24 })
      : Promise.resolve({ data: null, error: null }),
    gewaehlt === "abrechnen"
      ? supabase
          .from("members")
          .select("id, first_name, last_name")
          .eq("status", "active")
          .order("last_name")
          .order("first_name")
      : Promise.resolve({ data: null, error: null }),
    // Was je Art noch angekündigt werden muss - in den Forderungen für die
    // Karte, beim Abrechnen für den Stand der Gastgebühren.
    ...CHARGE_KINDS.map((k) =>
      gewaehlt === "forderungen" || gewaehlt === "abrechnen"
        ? supabase.rpc("announceable_charges", { p_kind: k })
        : Promise.resolve({ data: null, error: null }),
    ),
  ]);

  const ankuendbar: AnkuendbarZeile[] = CHARGE_KINDS.map((k, i) => {
    const z = (ankuendbarRes[i]?.data as { anzahl: number; summe_cents: number; zahler: number }[] | null)?.[0];
    return { art: k, anzahl: z?.anzahl ?? 0, summe_cents: z?.summe_cents ?? 0, zahler: z?.zahler ?? 0 };
  });

  const einstellungen = einstellungRes.data ?? [];
  const glaeubigerId = String(
    einstellungen.find((s) => s.key === "sepa.creditor_id")?.value ?? "",
  ).replace(/"/g, "");
  const frist = Number(
    einstellungen.find((s) => s.key === "sepa.prenotification_days")?.value ?? 14,
  );
  const wert = (k: string) => String(einstellungen.find((e) => e.key === k)?.value ?? "").replace(/"/g, "");
  const fehlend = [
    wert("sepa.creditor_id") === "" ? "die Gläubiger-Identifikationsnummer" : null,
    wert("sepa.creditor_iban") === "" ? "die IBAN des Vereinskontos" : null,
  ].filter(Boolean);

  return (
    <div className="verwaltung">
      {unterseite ? (
        <VerwaltungsKopf
          kicker="Verwaltung · Kasse"
          titel={unterseite.label}
          zurueck={{
            href: ZURUECK[gewaehlt] ? `/admin/kasse?abschnitt=${ZURUECK[gewaehlt]}` : "/admin/kasse",
            text: "Kasse",
          }}
        />
      ) : (
        <>
          <VerwaltungsKopf
            titel="Kasse"
            unterzeile="Abrechnen, ankündigen, einziehen – Beiträge, Getränke, Arbeitsdienst und Gastgebühren."
          >
            {/* Ein gelber Knopf je Seite (Regel 4), passend zum Segment */}
            {gewaehlt === "abrechnen" && (
              <FensterKnopf titel="Forderung von Hand" knopf="Forderung anlegen" knopfKurz="Forderung">
                <ForderungAnlegen
                  mitglieder={(mitgliederRes.data ?? []).map((m) => ({
                    id: m.id,
                    name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
                  }))}
                />
              </FensterKnopf>
            )}
            {gewaehlt === "lastschrift" && (
              <FensterKnopf titel="Neuer Lastschriftlauf" knopf="Lauf anlegen" knopfKurz="Lauf">
                <LaufAnlegen fristTage={frist} />
              </FensterKnopf>
            )}
          </VerwaltungsKopf>

          <KassenKennzahlen />

          <BereichSegmente
            label="Kasse"
            aktiv={`/admin/kasse?abschnitt=${gewaehlt}`}
            eintraege={SEGMENTE.map((wert) => ({
              href: `/admin/kasse?abschnitt=${wert}`,
              label: ABSCHNITTE.find((a) => a.wert === wert)!.label,
            }))}
          />
        </>
      )}

      {gewaehlt === "beitraege" && (
        <Jahresbeitraege
          jahr={jahr}
          zeilen={(vorschauRes.data ?? []) as VorschauZeile[]}
          glaeubigerId={glaeubigerId}
          einstellungen={einstellungen}
          frist={frist}
          anzukuendigen={
            (offenRes.data ?? [])[0] ?? { anzahl: 0, summe_cents: 0, zahler: 0 }
          }
        />
      )}

      {gewaehlt === "abrechnen" && (
        <>
          <section className="liste-abschnitt" aria-labelledby="h-quellen">
            <Gruppenkopf titel="Woraus Forderungen entstehen" id="h-quellen" />
            <ul className="liste-gruppe" aria-label="Abrechnungen">
              <li>
                <Listenzeile
                  href="/admin/kasse?abschnitt=beitraege"
                  titel={`Jahresbeiträge ${jahr}`}
                  kontext="Einmal im Jahr · Vorschau, Forderungen erzeugen, ankündigen"
                />
              </li>
              <li>
                <Listenzeile
                  href="/admin/arbeitsdienst"
                  titel={`Arbeitsdienst ${jahr}`}
                  kontext="Nach Saisonende · nicht geleistete Stunden abrechnen"
                />
              </li>
              <li>
                <Listenzeile
                  href="/admin/kasse?abschnitt=forderungen&art=guest"
                  titel="Gastgebühren"
                  kontext={(() => {
                    const g = ankuendbar.find((z) => z.art === "guest");
                    return g && g.anzahl > 0
                      ? `Entstehen beim Buchen mit Gast · ${g.anzahl} offen über ${formatCents(g.summe_cents)}`
                      : "Entstehen beim Buchen mit Gast · nichts offen";
                  })()}
                />
              </li>
            </ul>
          </section>

          <GetraenkemonatKarte
            monate={(monateRes.data ?? []) as unknown as MonatZeile[]}
            fristTage={frist}
          />

          {/* Was man seltener braucht, steht als Unterseite darunter */}
          <nav className="gruppe" aria-label="Einrichtung der Kasse">
            {(["arten", "regeln"] as const).map((wert) => (
              <Link key={wert} href={`/admin/kasse?abschnitt=${wert}`} className="gruppen-zeile">
                <span className="titel">{ABSCHNITTE.find((a) => a.wert === wert)!.label}</span>
                <span className="pfeil" aria-hidden="true">›</span>
              </Link>
            ))}
          </nav>
        </>
      )}

      {gewaehlt === "forderungen" && (
        <>
          <AnkuendigungNachArt zeilen={ankuendbar} fristTage={frist} />
          <ArtFilter aktiv={art} stand={stand ?? ""} />
          <StandFilter aktiv={stand ?? ""} art={art} />
          <ForderungsListe
            forderungen={(forderungenRes.data ?? []) as unknown as ForderungZeile[]}
          />
        </>
      )}

      {gewaehlt === "lastschrift" && (
        <>
          {/* Ohne Gläubiger-ID und Vereins-IBAN lässt sich keine Datei bauen.
              Das steht hier, nicht erst beim Klick auf "erzeugen". */}
          {fehlend.length > 0 && (
            <div className="hinweis fehler">
              Es fehlt noch {fehlend.join(" und ")}. Ohne diese Angaben lässt sich keine
              Lastschriftdatei erzeugen – sie stehen unter{" "}
              <Link href="/admin/kasse?abschnitt=regeln">Kasse → Regeln</Link>.
            </div>
          )}
          <Lastschriftband laeufe={laeufeRes.data ?? []} />
        </>
      )}

      {gewaehlt === "arten" && (
        <BeitragsartenPflege
          arten={(artenRes.data ?? []) as unknown as BeitragsartZeile[]}
          jahr={jahr}
        />
      )}

      {gewaehlt === "regeln" && (
        <>
          <EinstellungsGruppe
            titel="Fälligkeit"
            text="Wann der Jahresbeitrag eingezogen wird."
            eintraege={einstellungen.filter((e) => e.key.startsWith("fees."))}
          />
          <EinstellungsGruppe
            titel="Lastschrift"
            text="Gläubiger-ID, Format und Vorabankündigung."
            eintraege={einstellungen.filter((e) => e.key.startsWith("sepa."))}
          />
        </>
      )}
    </div>
  );
}

interface VorschauZeile {
  member_id: string;
  member_name: string;
  payer_name: string;
  fee_types: string;
  amount_cents: number;
  has_mandate: boolean;
  already_charged: boolean;
}

function Jahresbeitraege({
  jahr, zeilen, glaeubigerId, einstellungen, frist, anzukuendigen,
}: {
  jahr: number;
  zeilen: VorschauZeile[];
  glaeubigerId: string;
  einstellungen: { key: string; value: unknown }[];
  frist: number;
  anzukuendigen: { anzahl: number; summe_cents: number; zahler: number };
}) {
  const summe = zeilen.reduce((s, z) => s + (z.amount_cents ?? 0), 0);
  const ohneMandat = zeilen.filter((z) => !z.has_mandate);
  const schonBerechnet = zeilen.filter((z) => z.already_charged);

  const zahl = (schluessel: string, ersatz: number) =>
    Number(einstellungen.find((e) => e.key === schluessel)?.value ?? ersatz);

  // Der Vorschlag kommt aus den Einstellungen; ändern lässt er sich trotzdem.
  const faellig = `${jahr}-${String(zahl("fees.annual_run_month", 1)).padStart(2, "0")}-${String(
    zahl("fees.annual_run_day", 15),
  ).padStart(2, "0")}`;

  return (
    <>
      <div className="abschnittskopf">
        <h2 className="dpl">Jahresbeiträge {jahr}</h2>
        <nav className="filterchips" aria-label="Jahr">
          <Link href={`/admin/kasse?abschnitt=beitraege&jahr=${jahr - 1}`}>‹ {jahr - 1}</Link>
          <Link href={`/admin/kasse?abschnitt=beitraege&jahr=${jahr}`} aria-current="true">
            {jahr}
          </Link>
          <Link href={`/admin/kasse?abschnitt=beitraege&jahr=${jahr + 1}`}>{jahr + 1} ›</Link>
          {jahr !== new Date().getFullYear() && <Link href="/admin/kasse?abschnitt=beitraege">Dieses Jahr</Link>}
        </nav>
      </div>

      {!glaeubigerId && (
        <div className="hinweis fehler">
          Die Gläubiger-Identifikationsnummer fehlt noch. Sie steht im eBuSy-Backend und muss
          unverändert übernommen werden – nur dann bleiben die Bestandsmandate gültig. Ohne sie
          lässt sich keine Lastschriftdatei erzeugen.
        </div>
      )}

      <div className="kennzahlen">
        <div className="kennzahl">
          <span className="label">Mitglieder</span>
          <span className="wert dpl tnum">{zeilen.length}</span>
          <span className="info">mit Beitrag {jahr}</span>
        </div>
        <div className="kennzahl">
          <span className="label">Summe</span>
          <span className="wert dpl tnum">{formatCents(summe)}</span>
          <span className="info">alle Beitragsarten</span>
        </div>
        <div className="kennzahl">
          <span className="label">Ohne Mandat</span>
          <span className="wert dpl tnum">{ohneMandat.length}</span>
          <span className="info">zahlen per Überweisung</span>
        </div>
        <div className="kennzahl">
          <span className="label">Bereits berechnet</span>
          <span className="wert dpl tnum">{schonBerechnet.length}</span>
          <span className="info">Forderung erzeugt</span>
        </div>
      </div>

      {ohneMandat.length > 0 && (
        <div className="hinweis fehler">
          <strong>{ohneMandat.length} Mitglieder haben kein gültiges SEPA-Mandat.</strong> Sie
          erscheinen nicht in der Lastschriftdatei und müssen separat angeschrieben werden –
          sonst rutschen sie unbemerkt durch:{" "}
          {ohneMandat.slice(0, 8).map((z) => z.member_name).join(", ")}
          {ohneMandat.length > 8 && ` und ${ohneMandat.length - 8} weitere`}.
        </div>
      )}

      {/* Gezählt wird nur, was eine Forderung ergibt: beitragsbefreite
          Mitglieder stehen mit 0,00 € in der Vorschau, bekommen nie eine
          Forderung und würden den Knopf sonst für immer stehen lassen. */}
      <BeitragslaufKarte
        jahr={jahr}
        mitglieder={zeilen.filter((z) => z.amount_cents > 0).length}
        summeCents={zeilen.filter((z) => !z.already_charged).reduce((s, z) => s + z.amount_cents, 0)}
        schonBerechnet={schonBerechnet.length}
        faelligAm={faellig}
      />

      {/* Der zweite Schritt steht direkt darunter, nicht auf einer eigenen
          Seite: wer gerade Forderungen erzeugt hat, muss als Nächstes
          ankündigen — sonst darf gar nicht eingezogen werden. */}
      <AnkuendigungsKarte
        art="fee"
        zeitraum={String(jahr)}
        offen={anzukuendigen.anzahl}
        summeCents={anzukuendigen.summe_cents}
        fristTage={frist}
        faelligVorschlag={faellig}
      />

      <section className="liste-abschnitt" aria-labelledby="h-positionen">
        <Gruppenkopf titel="Positionen" id="h-positionen" neben={`${zeilen.length} · ${formatCents(summe)}`} />
        <ul className="liste-gruppe" aria-label="Positionen">
          {zeilen.map((z) => (
            <li key={z.member_id}>
              <Listenzeile
                titel={z.member_name}
                kontext={`${z.fee_types} · ${z.payer_name ? `Zahler ${z.payer_name}` : "zahlt selbst"} · ${
                  z.has_mandate ? "Mandat" : "kein Mandat"
                }`}
                neben={
                  <span className="neben">
                    <span className="betrag tnum">{formatCents(z.amount_cents ?? 0)}</span>
                    {!z.has_mandate ? (
                      <span className="statusmarke rot">kein Mandat</span>
                    ) : (
                      <span className={`statusmarke${z.already_charged ? " gruen" : ""}`}>
                        {z.already_charged ? "berechnet" : "offen"}
                      </span>
                    )}
                  </span>
                }
              />
            </li>
          ))}
        </ul>
      </section>

      <p className="mit">
        Nach dem Erzeugen der Forderungen geht zuerst die Vorabankündigung mit Betrag und
        Fälligkeit an die Mitglieder; erst nach Ablauf der Frist darf eingezogen werden.
      </p>
    </>
  );
}

/**
 * Der Einstieg in die Lastschriftläufe.
 *
 * Bewusst nur ein Ausschnitt mit Weg dorthin: ein Lauf ist ein Vorgang über
 * mehrere Tage und braucht eine eigene Adresse, die man verlinken kann.
 */
function Lastschriftband({ laeufe }: { laeufe: LaufZeile[] }) {
  return (
    <section className="liste-abschnitt" aria-labelledby="h-lastschrift">
      <Gruppenkopf titel="Lastschriftläufe" id="h-lastschrift" />
      <p className="unterzeile">Aus angekündigten Forderungen wird eine Datei fürs Onlinebanking.</p>
      <LaufListe laeufe={laeufe} />
    </section>
  );
}

const STAENDE = [
  { wert: "", label: "Alle" },
  { wert: "open", label: "Offen" },
  { wert: "notified", label: "Angekündigt" },
  { wert: "submitted", label: "Eingereicht" },
  { wert: "settled", label: "Bezahlt" },
  { wert: "returned", label: "Zurückgebucht" },
] as const;

function forderungsLink(stand: string, art: string | null) {
  return `/admin/kasse?abschnitt=forderungen${stand ? `&stand=${stand}` : ""}${art ? `&art=${art}` : ""}`;
}

/**
 * Die Art als eigener Filter: die Frage „welche Getränke sind noch offen?“
 * ließ sich vorher nur über die Beschreibung beantworten.
 */
function ArtFilter({ aktiv, stand }: { aktiv: ChargeKind | null; stand: string }) {
  return (
    <nav className="filterchips" aria-label="Art">
      <Link href={forderungsLink(stand, null)} aria-current={aktiv === null ? "true" : undefined}>
        Alle Arten
      </Link>
      {CHARGE_KINDS.map((k) => (
        <Link key={k} href={forderungsLink(stand, k)} aria-current={k === aktiv ? "true" : undefined}>
          {CHARGE_KIND_LABEL[k]}
        </Link>
      ))}
    </nav>
  );
}

function StandFilter({ aktiv, art }: { aktiv: string; art: ChargeKind | null }) {
  return (
    <nav className="filterchips" aria-label="Stand">
      {STAENDE.map((s) => (
        <Link
          key={s.wert || "alle"}
          href={forderungsLink(s.wert, art)}
          aria-current={s.wert === aktiv ? "true" : undefined}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
