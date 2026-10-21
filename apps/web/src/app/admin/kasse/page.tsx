import Link from "next/link";
import {
  CHARGE_KINDS, CHARGE_KIND_LABEL, einzugGruppeSchluessel, formatCents, kasseTodos, translateDbError,
  type ChargeKind, type DebitBatchStatus,
} from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import { Fehlerzustand } from "@/components/Fehlerzustand";
import { FensterKnopf } from "@/components/FensterKnopf";
import { KassenKennzahlen } from "@/components/KassenKennzahlen";
import { LaufListe, type LaufZeile } from "@/components/LaufListe";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";
import { BereichSegmente } from "@/components/BereichSegmente";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { ForderungAnlegen } from "@/components/ForderungAnlegen";
import { BeitragslaufKarte } from "@/components/BeitragslaufKarte";
import { BeitragsartenPflege, type BeitragsartZeile } from "@/components/BeitragsartenPflege";
import { ForderungsListe, type ForderungZeile } from "@/components/ForderungsListe";
import { GetraenkemonatKarte, type MonatZeile } from "@/components/GetraenkemonatKarte";

export const dynamic = "force-dynamic";

const ABSCHNITTE = [
  { wert: "start", label: "Start" },
  { wert: "einzuege", label: "Einzüge" },
  { wert: "forderungen", label: "Forderungen" },
  { wert: "abrechnen", label: "Abrechnen" },
  { wert: "einstellungen", label: "Einstellungen" },
  { wert: "beitraege", label: "Jahresbeiträge" },
  { wert: "arten", label: "Beitragsarten" },
  { wert: "regeln", label: "Regeln" },
] as const;

/**
 * Die Teile des Segment-Schalters; der Rest sind Unterseiten.
 *
 * Neu gegliedert nach dem Entwurf „Kasse neu“: Start sagt, was zu tun ist.
 * Unter „Abrechnen“ entstehen Forderungen, ein Einzug kündigt sie an und
 * zieht sie ein. Früher waren Ankündigung und Lastschriftlauf zwei Vorgänge
 * mit je einem eigenen Datum, und ein Lauf entstand leer.
 */
const SEGMENTE = ["start", "einzuege", "forderungen", "abrechnen", "einstellungen"];

/** Alte Adressen aus Lesezeichen und Links. */
const ALIAS: Record<string, string> = { lauf: "beitraege", getraenke: "abrechnen", lastschrift: "einzuege" };

/** Unterseiten führen dorthin zurück, wo sie verlinkt sind. */
const ZURUECK: Record<string, string> = { beitraege: "abrechnen", arten: "einstellungen", regeln: "einstellungen" };

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

const KEINE = Promise.resolve({ data: null, error: null });

/**
 * Alles, was Geld betrifft, an einem Ort: Start (zu tun), Einzüge,
 * Forderungen (nachschlagen), Abrechnen (Forderungen entstehen) und
 * Einstellungen.
 */
export default async function KasseSeite({
  searchParams,
}: {
  searchParams: Promise<{ abschnitt?: string; jahr?: string; stand?: string; art?: string }>;
}) {
  const { abschnitt: roh, jahr: jahrParam, stand, art: artParam } = await searchParams;
  const abschnitt = roh ? (ALIAS[roh] ?? roh) : undefined;
  const gewaehlt = ABSCHNITTE.some((a) => a.wert === abschnitt) ? abschnitt! : "start";
  const art = CHARGE_KINDS.includes(artParam as ChargeKind) ? (artParam as ChargeKind) : null;
  const unterseite = SEGMENTE.includes(gewaehlt) ? null : ABSCHNITTE.find((a) => a.wert === gewaehlt)!;
  const jahr = Number(jahrParam) || new Date().getFullYear();
  const heute = heuteInBerlin();

  const supabase = await createServerSupabase();

  const [
    vorschauRes, einstellungRes, monateRes, forderungenRes, artenRes, laeufeRes,
    mitgliederRes, gastRes, gruppenRes, getraenkeRes,
  ] = await Promise.all([
    gewaehlt === "beitraege" ? supabase.rpc("fee_run_preview", { p_year: jahr }) : KEINE,
    supabase
      .from("settings")
      .select("key, value, value_type, label, description, updated_at")
      .or("key.like.sepa.%,key.like.fees.%")
      .order("key"),
    gewaehlt === "abrechnen" ? supabase.rpc("billing_period_overview", { p_limit: 18 }) : KEINE,
    gewaehlt === "forderungen"
      ? supabase.rpc("charge_overview", {
          p_status: (stand ?? undefined) as never,
          p_kind: art ?? undefined,
          p_limit: 500,
        })
      : KEINE,
    gewaehlt === "arten" ? supabase.rpc("fee_type_overview", { p_year: jahr }) : KEINE,
    gewaehlt === "einzuege" || gewaehlt === "start"
      ? supabase.rpc("debit_batch_overview", { p_limit: 24 })
      : KEINE,
    gewaehlt === "abrechnen"
      ? supabase
          .from("members")
          .select("id, first_name, last_name")
          .eq("status", "active")
          .order("last_name")
          .order("first_name")
      : KEINE,
    gewaehlt === "abrechnen" ? supabase.rpc("announceable_charges", { p_kind: "guest" }) : KEINE,
    gewaehlt === "start" || gewaehlt === "beitraege" ? supabase.rpc("einzug_gruppen") : KEINE,
    gewaehlt === "start"
      ? supabase.from("billing_periods").select("year, month, status").in("status", ["open", "closed"])
      : KEINE,
  ]);

  // Eine gescheiterte Abfrage darf nicht wie "alles erledigt" oder "kein
  // Einzug" aussehen (B14). Die Abfragen eines Abschnitts sind alle nötig;
  // scheitert eine, steht statt des Abschnitts der Fehler.
  const ladefehler =
    vorschauRes.error ?? einstellungRes.error ?? monateRes.error ?? forderungenRes.error ??
    artenRes.error ?? laeufeRes.error ?? mitgliederRes.error ?? gastRes.error ??
    gruppenRes.error ?? getraenkeRes.error;

  const einstellungen = einstellungRes.data ?? [];
  const glaeubigerId = String(
    einstellungen.find((s) => s.key === "sepa.creditor_id")?.value ?? "",
  ).replace(/"/g, "");
  const wert = (k: string) => String(einstellungen.find((e) => e.key === k)?.value ?? "").replace(/"/g, "");
  const fehlend = [
    wert("sepa.creditor_id") === "" ? "die Gläubiger-Identifikationsnummer" : null,
    wert("sepa.creditor_iban") === "" ? "die IBAN des Vereinskontos" : null,
  ].filter(Boolean);
  const fehltHinweis = fehlend.length > 0 && (
    <div className="hinweis fehler">
      Es fehlt noch {fehlend.join(" und ")}. Ohne diese Angaben lässt sich keine
      Lastschriftdatei erzeugen – sie stehen unter{" "}
      <Link href="/admin/kasse?abschnitt=regeln">Kasse → Einstellungen → Regeln</Link>.
    </div>
  );

  const laeufe = (laeufeRes.data ?? []) as LaufZeile[];
  const gruppen = gruppenRes.data ?? [];
  const gast = (gastRes.data as { anzahl: number; summe_cents: number }[] | null)?.[0];
  const einzugKnopf = (
    <Link className="knopf gold" href="/admin/kasse/einzug">
      Einzug vorbereiten
    </Link>
  );

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
            {(gewaehlt === "start" || gewaehlt === "einzuege") && einzugKnopf}
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
          </VerwaltungsKopf>

          <BereichSegmente
            label="Kasse"
            viele
            aktiv={`/admin/kasse?abschnitt=${gewaehlt}`}
            eintraege={SEGMENTE.map((wert) => ({
              href: `/admin/kasse?abschnitt=${wert}`,
              label: ABSCHNITTE.find((a) => a.wert === wert)!.label,
            }))}
          />
        </>
      )}

      {ladefehler && (
        <Fehlerzustand titel="Die Kasse ließ sich nicht laden." text={translateDbError(ladefehler)} />
      )}

      {!ladefehler && gewaehlt === "start" && (
        <>
          <ZuTun
            heute={heute}
            gruppen={gruppen}
            laeufe={laeufe}
            getraenkemonate={(getraenkeRes.data ?? []) as { year: number; month: number; status: "open" | "closed" }[]}
          />
          <KassenKennzahlen />
          <GeldErklaerung />
        </>
      )}

      {!ladefehler && gewaehlt === "einzuege" && (
        <>
          {fehltHinweis}
          <p className="unterzeile">
            Ein Einzug fasst angekündigte Forderungen zu einer Datei für die Bank zusammen. Jeder
            Einzug hat einen Abbuchungstag und läuft durch vier Stände: angekündigt → Datei erzeugt →
            eingereicht → abgeschlossen.
          </p>
          <section className="liste-abschnitt" aria-labelledby="h-laufend">
            <Gruppenkopf titel="Laufend" id="h-laufend" />
            <LaufListe
              laeufe={laeufe.filter((l) => l.status !== "completed")}
              heute={heute}
              leer="Gerade läuft kein Einzug."
            />
          </section>
          <section className="liste-abschnitt" aria-labelledby="h-abgeschlossen">
            <Gruppenkopf titel="Abgeschlossen" id="h-abgeschlossen" />
            <LaufListe
              laeufe={laeufe.filter((l) => l.status === "completed")}
              heute={heute}
              leer="Noch kein Einzug abgeschlossen."
            />
          </section>
        </>
      )}

      {!ladefehler && gewaehlt === "beitraege" && (
        <Jahresbeitraege
          jahr={jahr}
          zeilen={(vorschauRes.data ?? []) as VorschauZeile[]}
          glaeubigerId={glaeubigerId}
          einstellungen={einstellungen}
          offen={
            gruppen.find((g) => g.kind === "fee" && g.period_label === String(jahr) && !g.ruecklaeufer) ?? null
          }
        />
      )}

      {!ladefehler && gewaehlt === "abrechnen" && (
        <>
          <p className="unterzeile">
            Hier entstehen Forderungen. Abgebucht wird hier noch nichts – das geschieht danach über
            einen Einzug.
          </p>
          <section className="liste-abschnitt" aria-labelledby="h-quellen">
            <Gruppenkopf titel="Woraus Forderungen entstehen" id="h-quellen" />
            <ul className="liste-gruppe" aria-label="Abrechnungen">
              <li>
                <Listenzeile
                  href="/admin/kasse?abschnitt=beitraege"
                  titel={`Jahresbeiträge ${jahr}`}
                  kontext="Einmal im Jahr · Vorschau prüfen, Forderungen erzeugen"
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
                  kontext={
                    gast && gast.anzahl > 0
                      ? `Entstehen beim Buchen mit Gast · ${gast.anzahl} offen über ${formatCents(gast.summe_cents)}`
                      : "Entstehen beim Buchen mit Gast · nichts offen"
                  }
                />
              </li>
            </ul>
          </section>

          <GetraenkemonatKarte monate={(monateRes.data ?? []) as unknown as MonatZeile[]} />
        </>
      )}

      {!ladefehler && gewaehlt === "forderungen" && (
        <>
          <p className="unterzeile">
            Wer schuldet dem Verein was? Hier wird nur nachgeschlagen – eingezogen wird über{" "}
            <Link href="/admin/kasse/einzug">Einzug vorbereiten</Link>.
          </p>
          <ArtFilter aktiv={art} stand={stand ?? ""} />
          <StandFilter aktiv={stand ?? ""} art={art} />
          <ForderungsListe
            forderungen={(forderungenRes.data ?? []) as unknown as ForderungZeile[]}
          />
        </>
      )}

      {!ladefehler && gewaehlt === "einstellungen" && (
        <>
          {fehltHinweis}
          <nav className="gruppe" aria-label="Einrichtung der Kasse">
            {(["arten", "regeln"] as const).map((w) => (
              <Link key={w} href={`/admin/kasse?abschnitt=${w}`} className="gruppen-zeile">
                <span className="titel">{ABSCHNITTE.find((a) => a.wert === w)!.label}</span>
                <span className="pfeil" aria-hidden="true">›</span>
              </Link>
            ))}
          </nav>
        </>
      )}

      {!ladefehler && gewaehlt === "arten" && (
        <BeitragsartenPflege
          arten={(artenRes.data ?? []) as unknown as BeitragsartZeile[]}
          jahr={jahr}
        />
      )}

      {!ladefehler && gewaehlt === "regeln" && (
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

/** Was gerade auf den Vorstand wartet, über alle Arten (kasseTodos). */
function ZuTun({
  heute, gruppen, laeufe, getraenkemonate,
}: {
  heute: string;
  gruppen: {
    kind: string; period_label: string | null; ruecklaeufer: boolean; anzahl: number; mitglieder: number;
    summe_cents: number; event_id: string | null; titel: string | null;
  }[];
  laeufe: LaufZeile[];
  getraenkemonate: { year: number; month: number; status: "open" | "closed" }[];
}) {
  const todos = kasseTodos({
    today: heute,
    gruppen: gruppen.map((g) => ({ ...g, kind: g.kind as ChargeKind })),
    einzuege: laeufe
      .filter((l) => l.status !== "completed")
      .map((l) => ({ ...l, status: l.status as DebitBatchStatus })),
    getraenkemonate,
  });

  return (
    <section className="liste-abschnitt" aria-labelledby="h-zutun">
      <Gruppenkopf titel="Zu tun" id="h-zutun" neben="Alles, was gerade wartet – über alle Arten" />
      {todos.length === 0 ? (
        <p className="leer-klein">Alles erledigt. Gerade wartet nichts in der Kasse.</p>
      ) : (
        <ul className="liste-gruppe zu-tun" aria-label="Zu tun">
          {todos.map((t) => (
            <li key={t.key}>
              <Listenzeile
                href={t.href}
                punkt={t.urgent ? "dringend" : "info"}
                titel={
                  <>
                    <span className={`marke-klein ${t.marke.ton}`}>{t.marke.text}</span> {t.title}
                  </>
                }
                kontext={t.text}
                hinweis={t.action}
                hinweisTon={t.urgent ? "gold" : "leise"}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Die vier Schritte als Erklärung für alle, die die Kasse nicht kennen. */
function GeldErklaerung() {
  return (
    <section className="karte gross geld-erklaerung" aria-labelledby="h-geld">
      <h2 className="dpl" id="h-geld">So läuft das Geld</h2>
      <ol>
        <li><b>1 · Forderung</b><span>Entsteht beim Abrechnen: Beitrag, Getränke, Arbeitsdienst, Gast oder von Hand.</span></li>
        <li><b>2 · Einzug vorbereiten</b><span>Forderungen wählen, Abbuchungstag festlegen. Die Mitglieder bekommen die Ankündigung.</span></li>
        <li><b>3 · Datei einreichen</b><span>Sofort möglich. Die Bank bucht erst am festgelegten Tag ab.</span></li>
        <li><b>4 · Rückläufer</b><span>Bis zu acht Wochen danach. Dann ist der Einzug abgeschlossen.</span></li>
      </ol>
    </section>
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
  jahr, zeilen, glaeubigerId, einstellungen, offen,
}: {
  jahr: number;
  zeilen: VorschauZeile[];
  glaeubigerId: string;
  einstellungen: { key: string; value: unknown }[];
  /** Was von diesem Jahr noch eingezogen werden kann (einzug_gruppen) */
  offen: { kind: string; period_label: string | null; ruecklaeufer: boolean; anzahl: number; summe_cents: number } | null;
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
          <span className="info">gehen nicht in den Einzug</span>
        </div>
        <div className="kennzahl">
          <span className="label">Bereits berechnet</span>
          <span className="wert dpl tnum">{schonBerechnet.length}</span>
          <span className="info">Forderung erzeugt</span>
        </div>
      </div>

      {ohneMandat.length > 0 && (
        <div className="hinweis fehler">
          <strong>{ohneMandat.length} Mitglieder haben kein gültiges SEPA-Mandat.</strong> Es fehlt,
          ist widerrufen oder seit 36 Monaten ungenutzt und damit erloschen. Ohne neues Mandat
          gehen sie nicht in den Einzug:{" "}
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

      {/* Der naechste Schritt steht direkt darunter: wer gerade Forderungen
          erzeugt hat, zieht sie als Naechstes ein - mit Ankuendigung. */}
      {offen && offen.anzahl > 0 && (
        <section className="naechster-schritt quer" aria-label="Einziehen">
          <div>
            <b className="titel">
              {offen.anzahl} {offen.anzahl === 1 ? "Forderung" : "Forderungen"} über{" "}
              {formatCents(offen.summe_cents)} noch nicht eingezogen
            </b>
            <p>Als Nächstes: Einzug vorbereiten. Dort legst du den Abbuchungstag fest, und die Mitglieder bekommen ihre Ankündigung.</p>
          </div>
          <Link
            className="knopf gold"
            href={`/admin/kasse/einzug?gruppe=${encodeURIComponent(
              einzugGruppeSchluessel({ kind: "fee", period_label: String(jahr), ruecklaeufer: false }),
            )}`}
          >
            Einzug vorbereiten
          </Link>
        </section>
      )}

      <section className="liste-abschnitt" aria-labelledby="h-positionen">
        <Gruppenkopf titel="Positionen" id="h-positionen" neben={`${zeilen.length} · ${formatCents(summe)}`} />
        <ul className="liste-gruppe" aria-label="Positionen">
          {zeilen.map((z) => (
            <li key={z.member_id}>
              <Listenzeile
                titel={z.member_name}
                kontext={`${z.fee_types} · ${
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
        Nach dem Erzeugen der Forderungen folgt der Einzug: Er schickt jedem Mitglied die
        Vorabankündigung mit Betrag und Abbuchungstag und legt die Lastschriftdatei an.
      </p>
    </>
  );
}

const STAENDE = [
  { wert: "", label: "Alle" },
  { wert: "open", label: "Offen" },
  { wert: "notified", label: "Angekündigt" },
  { wert: "submitted", label: "Im Einzug" },
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
