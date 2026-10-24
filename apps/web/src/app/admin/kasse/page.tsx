import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CHARGE_KINDS, CHARGE_KIND_LABEL, einzugGruppeSchluessel, formatCents, kasseTodos, translateDbError,
  type ChargeKind, type DebitBatchStatus, type KasseTodo,
} from "@tcm/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { AuswahlSofort } from "@/components/AuswahlSofort";
import { EinstellungsGruppe } from "@/components/EinstellungsGruppe";
import { Fehlerzustand } from "@/components/Fehlerzustand";
import { KassenKennzahlen } from "@/components/KassenKennzahlen";
import { LaufListe, type LaufZeile } from "@/components/LaufListe";
import { Gruppenkopf, Listenzeile } from "@/components/Listenzeile";
import { BereichSegmente } from "@/components/BereichSegmente";
import { VerwaltungsKopf } from "@/components/VerwaltungsKopf";
import { ForderungVonHand } from "@/components/ForderungVonHand";
import { BeitragslaufKarte } from "@/components/BeitragslaufKarte";
import { BeitragsartenPflege, type BeitragsartZeile } from "@/components/BeitragsartenPflege";
import { ForderungsListe, type ForderungZeile } from "@/components/ForderungsListe";
import { GetraenkemonatKarte, type MonatZeile } from "@/components/GetraenkemonatKarte";
import { Leerzustand } from "@/components/Leerzustand";

export const dynamic = "force-dynamic";

const ABSCHNITTE = [
  { wert: "forderungen", label: "Forderungen" },
  { wert: "lastschriften", label: "Lastschriften" },
  { wert: "getraenkemonate", label: "Getränkemonate" },
  { wert: "beitraege", label: "Jahresbeiträge" },
  { wert: "arten", label: "Beitragsarten" },
  { wert: "regeln", label: "Regeln" },
] as const;

/**
 * Die drei Teile des Segment-Schalters (docs/design/clubhaus/verwaltung,
 * Regel 1); der Rest sind Unterseiten.
 *
 * Was früher „Start“ war – was zu tun ist und die Kennzahlen – steht jetzt
 * über dem Schalter, auf jedem Teil (U50). Unter „Forderungen“ stehen auch
 * die Quellen, aus denen sie entstehen (früher „Abrechnen“); ein Einzug
 * kündigt sie an und zieht sie ein.
 */
const SEGMENTE: readonly string[] = ["forderungen", "lastschriften", "getraenkemonate"];

/**
 * Alte Adressen aus Lesezeichen und Links leiten um. "" ist die Kasse ohne
 * Abschnitt; die Einstellungen sind kein Teil mehr, sondern Zeilen am Ende.
 */
const ALIAS: Record<string, string> = {
  start: "",
  einzuege: "lastschriften",
  lastschrift: "lastschriften",
  abrechnen: "forderungen",
  getraenke: "getraenkemonate",
  lauf: "beitraege",
  einstellungen: "",
};

/** Unterseiten führen dorthin zurück, wo sie verlinkt sind. */
const ZURUECK: Record<string, string> = {
  beitraege: "/admin/kasse?abschnitt=forderungen",
  arten: "/admin/kasse#einstellungen",
  regeln: "/admin/kasse#einstellungen",
};

/** Die fehlende Angabe und das Feld unter Regeln, das sie aufnimmt. */
const PFLICHT = [
  { key: "sepa.creditor_id", text: "die Gläubiger-Identifikationsnummer", anker: "glaeubiger-id" },
  { key: "sepa.creditor_iban", text: "die IBAN des Vereinskontos", anker: "iban" },
] as const;

/**
 * Die Lastschriftfelder kommen nach Schlüssel sortiert, die BIC also vor der
 * IBAN. Gelesen wird andersherum: erst das Konto, dann das Freiwillige.
 */
const LASTSCHRIFT_ZUERST = ["sepa.creditor_iban", "sepa.creditor_bic"];
function lastschriftRang(key: string): number {
  const i = LASTSCHRIFT_ZUERST.indexOf(key);
  return i === -1 ? LASTSCHRIFT_ZUERST.length : i;
}

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

const KEINE = Promise.resolve({ data: null, error: null });

/**
 * Alles, was Geld betrifft, an einem Ort. Oben, was zu tun ist; darunter
 * Forderungen (nachschlagen und entstehen lassen), Lastschriften (die
 * Einzüge) und Getränkemonate. Die Einstellungen stehen am Ende.
 */
export default async function KasseSeite({
  searchParams,
}: {
  searchParams: Promise<{ abschnitt?: string; jahr?: string; stand?: string; art?: string; monat?: string }>;
}) {
  const parameter = await searchParams;
  const { abschnitt, jahr: jahrParam, stand: standParam, art: artParam, monat } = parameter;

  if (abschnitt !== undefined && abschnitt in ALIAS) {
    const ziel = new URLSearchParams();
    if (ALIAS[abschnitt]) ziel.set("abschnitt", ALIAS[abschnitt]);
    for (const [k, v] of Object.entries(parameter)) {
      if (k !== "abschnitt" && typeof v === "string") ziel.set(k, v);
    }
    const suche = ziel.toString();
    redirect(`/admin/kasse${suche ? `?${suche}` : ""}${abschnitt === "einstellungen" ? "#einstellungen" : ""}`);
  }

  const gewaehlt = ABSCHNITTE.some((a) => a.wert === abschnitt) ? abschnitt! : "forderungen";
  const art = CHARGE_KINDS.includes(artParam as ChargeKind) ? (artParam as ChargeKind) : null;
  const stand = STAENDE.some((s) => s.wert === standParam) ? standParam! : "";
  const segment = SEGMENTE.includes(gewaehlt);
  const unterseite = segment ? null : ABSCHNITTE.find((a) => a.wert === gewaehlt)!;
  const heute = heuteInBerlin();
  const jahr = Number(jahrParam) || Number(heute.slice(0, 4));

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
    gewaehlt === "getraenkemonate" ? supabase.rpc("billing_period_overview", { p_limit: 18 }) : KEINE,
    gewaehlt === "forderungen"
      ? supabase.rpc("charge_overview", {
          p_status: (stand || undefined) as never,
          p_kind: art ?? undefined,
          p_limit: 500,
        })
      : KEINE,
    gewaehlt === "arten" ? supabase.rpc("fee_type_overview", { p_year: jahr }) : KEINE,
    segment ? supabase.rpc("debit_batch_overview", { p_limit: 24 }) : KEINE,
    gewaehlt === "forderungen"
      ? supabase
          .from("members")
          .select("id, first_name, last_name")
          .eq("status", "active")
          .order("last_name")
          .order("first_name")
      : KEINE,
    gewaehlt === "forderungen" ? supabase.rpc("announceable_charges", { p_kind: "guest" }) : KEINE,
    segment || gewaehlt === "beitraege" ? supabase.rpc("einzug_gruppen") : KEINE,
    segment
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
  const fehlend = PFLICHT.filter((p) => wert(p.key) === "");

  const laeufe = (laeufeRes.data ?? []) as LaufZeile[];
  const gruppen = gruppenRes.data ?? [];
  const gast = (gastRes.data as { anzahl: number; summe_cents: number }[] | null)?.[0];
  const todos = segment && !ladefehler
    ? kasseTodos({
        today: heute,
        gruppen: gruppen.map((g) => ({ ...g, kind: g.kind as ChargeKind })),
        einzuege: laeufe
          .filter((l) => l.status !== "completed")
          .map((l) => ({ ...l, status: l.status as DebitBatchStatus })),
        getraenkemonate: (getraenkeRes.data ?? []) as { year: number; month: number; status: "open" | "closed" }[],
      })
    : [];

  // Ein gelber Knopf je Seite (Regel 4), und zwar für das, was wirklich als
  // Nächstes dran ist: „Einzug vorbereiten“ nur, wenn es etwas einzuziehen
  // gibt, sonst die erste Aufgabe – etwa einen Getränkemonat schließen (U50).
  const naechste = todos[0];
  const einziehbar = gruppen.some((g) => g.anzahl > 0);
  const hauptaktion = einziehbar ? (
    <Link className="knopf gold" href="/admin/kasse/einzug">Einzug vorbereiten</Link>
  ) : naechste ? (
    <Link className="knopf gold" href={naechste.href}>{naechste.action}</Link>
  ) : null;

  return (
    <div className="verwaltung">
      {unterseite ? (
        <VerwaltungsKopf
          // Das Jahr steht im Titel statt in einer zweiten Überschrift darunter (U63)
          titel={gewaehlt === "beitraege" ? `${unterseite.label} ${jahr}` : unterseite.label}
          zurueck={{ href: ZURUECK[gewaehlt] ?? "/admin/kasse", text: "Kasse" }}
        />
      ) : (
        <>
          <VerwaltungsKopf
            titel="Kasse"
            unterzeile="Abrechnen, ankündigen, einziehen – Beiträge, Getränke, Arbeitsdienst und Gastgebühren."
          >
            {hauptaktion}
          </VerwaltungsKopf>

          {/* Einmal, über allem, und mit dem Weg direkt ins Feld (U50) */}
          {fehlend.length > 0 && (
            <div className="hinweis gold">
              Es fehlt noch {fehlend.map((f) => f.text).join(" und ")}. Ohne diese Angabe lässt sich
              keine Bankdatei erzeugen.{" "}
              <Link href={`/admin/kasse?abschnitt=regeln#${fehlend[0]!.anker}`}>Jetzt eintragen</Link>
            </div>
          )}

          {!ladefehler && (
            <>
              <ZuTun todos={todos} imKopf={einziehbar ? undefined : naechste?.key} />
              <KassenKennzahlen />
            </>
          )}

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

      {ladefehler && (
        <Fehlerzustand titel="Die Kasse ließ sich nicht laden." text={translateDbError(ladefehler)} />
      )}

      {!ladefehler && gewaehlt === "forderungen" && (
        <>
          <section className="liste-abschnitt" aria-labelledby="h-quellen">
            <Gruppenkopf titel="Woraus Forderungen entstehen" id="h-quellen" />
            <p className="unterzeile">
              Abgebucht wird hier noch nichts – das geschieht danach über einen Einzug.
            </p>
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
              <li>
                <ForderungVonHand
                  mitglieder={(mitgliederRes.data ?? []).map((m) => ({
                    id: m.id,
                    name: `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
                  }))}
                />
              </li>
            </ul>
          </section>

          <section className="liste-abschnitt" aria-labelledby="h-forderungen">
            <Gruppenkopf titel="Wer schuldet was" id="h-forderungen" />
            <ForderungsFilter art={art} stand={stand} />
            <ForderungsListe
              forderungen={(forderungenRes.data ?? []) as unknown as ForderungZeile[]}
              gefiltert={Boolean(art || stand)}
            />
          </section>
        </>
      )}

      {!ladefehler && gewaehlt === "lastschriften" && (
        <>
          <p className="unterzeile">
            Ein Einzug fasst angekündigte Forderungen zu einer Bankdatei zusammen. Jeder
            Einzug hat einen Abbuchungstag und läuft durch vier Stände: angekündigt → Bankdatei erzeugt →
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
          <GeldErklaerung />
        </>
      )}

      {!ladefehler && gewaehlt === "getraenkemonate" && (
        <GetraenkemonatKarte
          monate={(monateRes.data ?? []) as unknown as MonatZeile[]}
          vorgewaehlt={monat}
        />
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
            eintraege={einstellungen
              .filter((e) => e.key.startsWith("sepa."))
              .sort((a, b) => lastschriftRang(a.key) - lastschriftRang(b.key))}
          />
        </>
      )}

      {/* Die Einrichtung braucht man selten: Zeilen am Ende statt eines Teils im Schalter */}
      {segment && (
        <section className="liste-abschnitt" id="einstellungen" aria-labelledby="h-einstellungen">
          <Gruppenkopf titel="Einstellungen" id="h-einstellungen" />
          <ul className="liste-gruppe" aria-label="Einrichtung der Kasse">
            <li>
              <Listenzeile
                href="/admin/kasse?abschnitt=arten"
                titel="Beitragsarten"
                kontext="Was ein Mitglied im Jahr zahlt"
              />
            </li>
            <li>
              <Listenzeile
                href="/admin/kasse?abschnitt=regeln"
                titel="Regeln"
                kontext="Fälligkeit, Gläubiger-ID, IBAN und Bankdatei"
              />
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}

/** Was gerade auf den Vorstand wartet, über alle Arten (kasseTodos). */
function ZuTun({ todos, imKopf }: { todos: KasseTodo[]; imKopf?: string }) {
  return (
    <section className="liste-abschnitt" aria-labelledby="h-zutun">
      <Gruppenkopf titel="Zu tun" id="h-zutun" neben="Alles, was gerade wartet – über alle Arten" />
      {todos.length === 0 ? (
        <Leerzustand text="Alles erledigt. Gerade wartet nichts in der Kasse." />
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
                // Steht die Aufgabe schon als gelber Knopf im Kopf, nennt die
                // Zeile sie nicht ein zweites Mal (U63).
                hinweis={t.key === imKopf ? undefined : t.action}
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
        <nav className="filterchips" aria-label="Jahr">
          <Link href={`/admin/kasse?abschnitt=beitraege&jahr=${jahr - 1}`}>‹ {jahr - 1}</Link>
          <Link href={`/admin/kasse?abschnitt=beitraege&jahr=${jahr}`} aria-current="true">
            {jahr}
          </Link>
          <Link href={`/admin/kasse?abschnitt=beitraege&jahr=${jahr + 1}`}>{jahr + 1} ›</Link>
          {jahr !== Number(heuteInBerlin().slice(0, 4)) && <Link href="/admin/kasse?abschnitt=beitraege">Dieses Jahr</Link>}
        </nav>
      </div>

      {!glaeubigerId && (
        <div className="hinweis fehler">
          Die Gläubiger-Identifikationsnummer fehlt noch. Sie steht im bisherigen Vereinsprogramm eBuSy
          und muss unverändert übernommen werden – nur dann bleiben die bestehenden Mandate gültig.
          Ohne sie lässt sich keine Bankdatei erzeugen.
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
        Vorabankündigung mit Betrag und Abbuchungstag und legt die Bankdatei an.
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
 * Eine Chipreihe für die Art, der Stand als Auswahlfeld daneben (U51, wie
 * U32 bei den Mitgliedern). Zwei Chipreihen mit vierzehn Chips waren am
 * Telefon ein halber Bildschirm. Die Frage „welche Getränke sind noch
 * offen?“ beantworten beide zusammen.
 */
function ForderungsFilter({ art, stand }: { art: ChargeKind | null; stand: string }) {
  return (
    <div className="forderungs-filter">
      <nav className="filterchips" aria-label="Art">
        <Link href={forderungsLink(stand, null)} aria-current={art === null ? "true" : undefined}>
          Alle Arten
        </Link>
        {CHARGE_KINDS.map((k) => (
          <Link key={k} href={forderungsLink(stand, k)} aria-current={k === art ? "true" : undefined}>
            {CHARGE_KIND_LABEL[k]}
          </Link>
        ))}
      </nav>
      <form>
        <input type="hidden" name="abschnitt" value="forderungen" />
        {art && <input type="hidden" name="art" value={art} />}
        <label className="bestand-wahl">
          <span>Stand</span>
          <AuswahlSofort name="stand" defaultValue={stand}>
            {STAENDE.map((s) => (
              <option key={s.wert || "alle"} value={s.wert}>{s.label}</option>
            ))}
          </AuswahlSofort>
        </label>
      </form>
    </div>
  );
}
