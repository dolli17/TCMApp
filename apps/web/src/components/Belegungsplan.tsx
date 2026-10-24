"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  berlinTime, blockingLabel, canStartAt, courtStatusAt, localMinutes, minutesOf, minutesToTime,
  nextSlotMinute, occupancyKind, timeToMinutes, type TimelineKind,
} from "@tcm/core";
import {
  belegungAm, buchen, mitspielen, mitspielerAendern, mitspielerSuchen, serienterminAbsagen,
  sperreAendern, sperreAufheben, stornieren, stundeSperren, umsetzen,
} from "@/app/plan/aktionen";
import { BuchungsFenster } from "@/components/BuchungsFenster";
import { PlanTelefon } from "@/components/PlanTelefon";
import { Toast, type Meldung } from "@/components/Toast";

export interface Platz { id: string; name: string; short_name: string }

export interface Belegung {
  booking_id: string;
  court_id: string;
  starts_at: string;
  ends_at: string;
  kind: "booking" | "blocking";
  type_code: string;
  type_name: string;
  title: string | null;
  owner_name: string | null;
  owner_member_id: string | null;
  is_own: boolean;
  players: string[];
  player_member_ids: string[];
  guest_names: string[];
  /** Der Bucher sucht Mitspieler - die Buchung steht bei den offenen Spielen. */
  partner_wanted: boolean;
  /** Wie viele Plaetze diese Buchung noch frei hat. */
  frei: number;
  /** Steht das angemeldete Mitglied als Mitspieler drin? */
  bin_dabei: boolean;
  /** Gesetzt, wenn die Belegung ein Termin einer Serie ist. */
  series_id: string | null;
}

export interface Buchungsart {
  code: string;
  name: string;
  duration_minutes: number;
  requires_partner: boolean;
  min_players: number;
  max_players: number;
}

export interface Mitglied { id: string; first_name: string; last_name: string }

/** Kategorie einer Sperrung: Buchungsart mit applies_to = 'blocking'. */
export interface Blockungsart { code: string; name: string }

interface Props {
  datum: string;
  /** Jetzt, vom Server - damit Server und Browser beim ersten Zeichnen dasselbe rechnen. */
  jetzt: string;
  plaetze: Platz[];
  belegungen: Belegung[];
  arten: Buchungsart[];
  /** Kategorien einer Sperrung, nach sort_order. */
  blockungsarten: Blockungsart[];
  verzeichnis: Mitglied[];
  /** Eigene Mitglieds-Id - wer bucht, kann sich nicht selbst als Mitspieler waehlen. */
  meineId: string | null;
  oeffnung: string;
  schluss: string;
  /** Buchungsraster in Minuten - 30, also :00 und :30. */
  rasterMinuten: number;
  /** Anzeigeraster in Minuten - 60; daraus nimmt das Blatt seine :00/:30. */
  anzeigeMinuten: number;
  /** Immer 60: die Dauer, die eine neue Buchung belegt. */
  dauerMinuten: number;
  /** Buchungsvorlauf in Tagen (lead_days) - am letzten Tag ist nur bis zur jetzigen Uhrzeit frei. */
  vorlaufTage: number;
  /** null bedeutet unbegrenzt (Kontingent auf 0 gestellt). */
  kontingentFrei: number | null;
  /** Gastgebuehr je Gast in Cent. */
  gastgebuehrCents: number;
  /** Vorstand, App Admin oder Platzwart: sperren und fremde Buchungen verwalten. */
  darfPlaetze: boolean;
}

// Die Zeitrechnung kommt aus @tcm/core: dieselben Funktionen benutzt die
// mobile App, und sie rechnen in Europe/Berlin statt in der Zeitzone des
// Geraets. Vorher stand das hier und dort je einmal - mit dem Ergebnis, dass
// ein Telefon auf Reisen die falsche Startzeit an die Datenbank schickte.
export const lokaleMinuten = minutesOf;
const zuMinuten = timeToMinutes;

export const alsUhrzeit = minutesToTime;

/**
 * Was im Blatt gerade bearbeitet wird. stunde ist der Anzeigeblock, aus dem
 * "Beginn" seine :00/:30 nimmt; start die vorgewaehlte Zeit.
 */
export type Fenster =
  | { modus: "buchen"; courtId: string; stunde: number; start: number }
  | { modus: "verwalten"; belegung: Belegung };

/**
 * Wohin nach einer Aktion der Blick soll: eine bestehende Buchung oder - bei
 * einer neuen, deren ID der Server nicht zurueckgibt - Platz und Beginn.
 */
type Markierung = { bookingId: string } | { courtId: string; startsAt: number };
const MARKIERT_MS = 5000;

/** 44 Pixel je Stunde im Raster - wie im Entwurf WebPlan. */
const STUNDE_PX = 44;
const px = (minuten: number) => (minuten / 60) * STUNDE_PX;

/** Klassen der Bloecke nach der Statustabelle - dieselbe Einordnung wie die Zeitleiste. */
const ART_KLASSE: Record<TimelineKind, string> = {
  belegt: "belegt", eigen: "eigen", sucht: "sucht", serie: "serie", gesperrt: "gesperrt",
};

/**
 * Der Belegungsplan (Entwurf WebPlan, docs/design/clubhaus).
 *
 * Zwei Darstellungen derselben Daten, die CSS entscheidet: unter 768 px
 * Übersicht und Freie Zeiten wie in der App (PlanTelefon), darueber das
 * Raster mit Bloecken ueber die ganze Dauer einer Belegung. Beides aus einer Komponente, damit die
 * Zustaende nicht auseinanderlaufen.
 *
 * Gebucht wird zur vollen oder halben Stunde, immer 60 Minuten. Ob eine Zeit
 * frei ist, entscheidet canStartAt (@tcm/core), durchgesetzt wird es nur in
 * create_booking.
 */
export function Belegungsplan(props: Props) {
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [markiert, setMarkiert] = useState<Markierung | null>(null);
  const [fensterFehler, setFensterFehler] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  // Jetzt kommt beim ersten Zeichnen vom Server; danach laeuft die Uhr mit,
  // damit die rote Linie und die freien Zeiten mitwandern.
  const [jetztMs, setJetztMs] = useState(() => Date.parse(props.jetzt));
  useEffect(() => {
    const uhr = setInterval(() => setJetztMs(Date.now()), 60_000);
    return () => clearInterval(uhr);
  }, []);
  const jetzt = useMemo(() => new Date(jetztMs), [jetztMs]);

  const oeffnungMin = zuMinuten(props.oeffnung);
  const schlussMin = zuMinuten(props.schluss);
  const heute = useMemo(
    () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt),
    [jetzt],
  );
  const istHeute = props.datum === heute;

  // Bis wohin der Tag schon vorbei ist: an frueheren Tagen ganz, heute bis
  // jetzt. Die Flaeche darueber sieht sonst aus wie freie Zeit.
  const vorbeiBis =
    props.datum < heute ? schlussMin
    : istHeute ? Math.min(Math.max(lokaleJetzt(jetzt), oeffnungMin), schlussMin)
    : oeffnungMin;

  const zeitpunkt = (minute: number) => berlinTime(props.datum, minute);
  const vergangen = (minute: number) => zeitpunkt(minute).getTime() < jetzt.getTime();

  /**
   * Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? Die
   * Regel steht in @tcm/core und gilt in der App und auf der Startseite gleich.
   */
  function startMoeglich(courtId: string, minute: number): boolean {
    return canStartAt({
      day: props.datum,
      courtId,
      minute,
      durationMinutes: props.dauerMinuten,
      closingMinutes: schlussMin,
      occupied: props.belegungen,
      leadDays: props.vorlaufTage,
      now: jetzt,
    });
  }

  /** Die :00- und :30-Startzeiten, die in diesem Anzeigeblock noch frei sind. */
  function startzeitenIn(courtId: string, stunde: number): number[] {
    const out: number[] = [];
    for (let m = stunde; m < stunde + props.anzeigeMinuten; m += props.rasterMinuten) {
      if (startMoeglich(courtId, m)) out.push(m);
    }
    return out;
  }

  const blockVon = (minute: number) =>
    oeffnungMin + Math.floor((minute - oeffnungMin) / props.anzeigeMinuten) * props.anzeigeMinuten;

  const kontingentAus = props.kontingentFrei !== null && props.kontingentFrei <= 0;

  // Die Server Actions rufen bereits revalidatePath auf; ein zusaetzliches
  // router.refresh() wuerde die Rueckmeldung sofort wieder verschlucken.
  //
  // Klappt es, schliesst das Blatt, die Meldung kommt unten als Toast und
  // der betroffene Block ist kurz hervorgehoben (U16). Scheitert es, bleibt
  // das Blatt offen und der Grund steht ueber dem Knopf.
  function ergebnis(e: { ok: boolean; meldung: string }, ziel?: Markierung) {
    if (e.ok) {
      setMeldung({ ok: true, text: e.meldung });
      setMarkiert(ziel ?? null);
      setFensterFehler(null);
      setFenster(null);
    } else {
      setFensterFehler(e.meldung);
    }
  }

  function abschicken(fd: FormData) {
    const ziel = {
      courtId: String(fd.get("courtId") ?? ""),
      startsAt: Date.parse(String(fd.get("startsAt") ?? "")),
    };
    starte(async () => ergebnis(await buchen(fd), ziel));
  }

  function speichern(bookingId: string, mitgliedIds: string[], gaeste: string[]) {
    starte(async () => ergebnis(await mitspielerAendern(bookingId, mitgliedIds, gaeste), { bookingId }));
  }

  function abbrechen(bookingId: string, grund?: string) {
    starte(async () => ergebnis(await stornieren(bookingId, grund)));
  }

  function terminAbsagen(bookingId: string, grund?: string) {
    starte(async () => ergebnis(await serienterminAbsagen(bookingId, grund)));
  }

  function setzeUm(bookingId: string, courtId: string, startsAt: string, grund?: string) {
    starte(async () => ergebnis(await umsetzen(bookingId, courtId, startsAt, grund), { bookingId }));
  }

  /**
   * Einen Anzeigeblock sperren, ohne den Plan zu verlassen.
   *
   * Gibt die Zahl der Kollisionen zurueck, damit das Blatt nachfragen kann,
   * statt still zu verdraengen.
   */
  async function sperren(
    courtId: string, minute: number, typCode: string, grund: string, verdraengen: boolean,
  ): Promise<number | null> {
    const e = await stundeSperren({
      platzId: courtId,
      von: zeitpunkt(minute).toISOString(),
      bis: zeitpunkt(minute + props.anzeigeMinuten).toISOString(),
      typCode,
      grund,
      verdraengen,
    });
    return kollisionOderErgebnis(e, { courtId, startsAt: zeitpunkt(minute).getTime() });
  }

  /** Eine Sperrung aendern - Minuten am Tag des Plans, zweistufig wie sperren. */
  async function sperreBearbeiten(
    bookingId: string, platzIds: string[], von: number, bis: number, typCode: string, grund: string,
    verdraengen: boolean,
  ): Promise<number | null> {
    const e = await sperreAendern({
      bookingId,
      platzIds,
      von: zeitpunkt(von).toISOString(),
      bis: zeitpunkt(bis).toISOString(),
      typCode,
      grund,
      verdraengen,
    });
    return kollisionOderErgebnis(e, { bookingId });
  }

  /**
   * Liegen Buchungen im Weg, fragt das Blatt selbst nach ("1 Buchung
   * verdraengen"). Die Meldung der Datenbank dazu waere doppelt.
   */
  function kollisionOderErgebnis(
    e: { ok: boolean; meldung: string; kollisionen?: number }, ziel?: Markierung,
  ) {
    if (e.kollisionen !== undefined) {
      setFensterFehler(null);
      return e.kollisionen;
    }
    ergebnis(e, ziel);
    return null;
  }

  function aufheben(bookingId: string) {
    starte(async () => ergebnis(await sperreAufheben(bookingId)));
  }

  function ausschreiben(bookingId: string, gesucht: boolean) {
    starte(async () => ergebnis(await mitspielerSuchen(bookingId, gesucht), { bookingId }));
  }

  function beitreten(bookingId: string) {
    starte(async () => ergebnis(await mitspielen(bookingId), { bookingId }));
  }

  function oeffneBuchen(courtId: string, minute: number) {
    setFensterFehler(null);
    setFenster({ modus: "buchen", courtId, stunde: blockVon(minute), start: minute });
  }

  function oeffneVerwalten(b: Belegung) {
    setFensterFehler(null);
    setFenster({ modus: "verwalten", belegung: b });
  }

  /**
   * Wer darf eine bestehende Buchung anfassen?
   *
   * Neben Bucher und Platzrechten auch jeder, dem sie offensteht: eine
   * ausgeschriebene Buchung ist eine Einladung, und die muss anklickbar sein.
   * Fremde Buchungen bleiben fuer Mitglieder reine Anzeige.
   */
  function verwaltbar(b: Belegung): boolean {
    if (props.darfPlaetze) return true;
    if (vergangen(lokaleMinuten(b.starts_at)) || b.kind !== "booking") return false;
    return b.is_own || (b.partner_wanted && b.frei > 0 && !b.bin_dabei);
  }

  /** Wer oder was steht im Block. */
  function wer(b: Belegung): string {
    if (b.series_id) return b.title ?? b.type_name;
    // Sperrung: oben die Kategorie, der Grund steht darunter (siehe unten).
    if (b.kind === "blocking") return blockingLabel(b).kategorie;
    return b.owner_name ?? "belegt";
  }

  /** Gehoert diese Belegung zur letzten erfolgreichen Aktion? */
  function istMarkiert(b: Belegung): boolean {
    if (!markiert) return false;
    if ("bookingId" in markiert) return b.booking_id === markiert.bookingId;
    return b.court_id === markiert.courtId && Date.parse(b.starts_at) === markiert.startsAt;
  }

  // Die Markierung verblasst nach ein paar Sekunden. Sobald der Block nach
  // dem Neuladen da ist, rollt er ins Bild, falls er ausserhalb liegt.
  useEffect(() => {
    if (!markiert) return;
    const uhr = setTimeout(() => setMarkiert(null), MARKIERT_MS);
    return () => clearTimeout(uhr);
  }, [markiert]);
  useEffect(() => {
    if (!markiert) return;
    const el = [...document.querySelectorAll<HTMLElement>(".markiert")].find((e) => e.offsetParent !== null);
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [markiert, props.belegungen]);

  const legende = <Legende />;

  return (
    <>
      <Toast meldung={meldung} onSchliessen={() => setMeldung(null)} />

      {/* --- Telefon: Übersicht und Freie Zeiten ----------------------------- */}
      <PlanTelefon
        datum={props.datum}
        jetzt={jetzt}
        istHeute={istHeute}
        plaetze={props.plaetze}
        belegungen={props.belegungen}
        oeffnung={oeffnungMin}
        schluss={schlussMin}
        raster={props.rasterMinuten}
        dauer={props.dauerMinuten}
        vorlaufTage={props.vorlaufTage}
        verwaltbar={verwaltbar}
        markiert={istMarkiert}
        onBuchen={(courtId, minute) => {
          if (kontingentAus) {
            setMeldung({ ok: false, text: "Dein Kontingent ist ausgeschöpft." });
            return;
          }
          oeffneBuchen(courtId, minute);
        }}
        onVerwalten={oeffneVerwalten}
      />

      {/* --- Ab Tablet: Raster mit Bloecken ueber die ganze Dauer ------------ */}
      <div className="plan-raster">
        <div className="raster-oben">
          {legende}
          <ul className="legende raster-legende" aria-hidden="true">
            <li><i className="frei"><Plus /></i>Frei</li>
            <li><i className="vorbei" />Vorbei</li>
          </ul>
        </div>

        <div className="raster" role="region" aria-label="Belegung nach Plätzen">
          <div className="raster-kopf" style={{ gridTemplateColumns: `64px repeat(${props.plaetze.length}, minmax(0, 1fr))` }}>
            <div />
            {props.plaetze.map((platz) => {
              const st = courtStatusAt({
                day: props.datum,
                courtId: platz.id,
                minute: istHeute
                  ? nextSlotMinute({ openingMinutes: oeffnungMin, slotMinutes: props.rasterMinuten, now: jetzt })
                  : oeffnungMin,
                durationMinutes: props.dauerMinuten,
                closingMinutes: schlussMin,
                occupied: props.belegungen,
                leadDays: props.vorlaufTage,
                now: jetzt,
              });
              return (
                <div key={platz.id} className="spalten-kopf">
                  <b className="dpl">{platz.name}</b>
                  <small className={`status-${st.art}`}>{st.text}</small>
                </div>
              );
            })}
          </div>

          <div
            className="raster-koerper"
            style={{
              gridTemplateColumns: `64px repeat(${props.plaetze.length}, minmax(0, 1fr))`,
              height: px(schlussMin - oeffnungMin),
            }}
          >
            {vorbeiBis > oeffnungMin && (
              <div className="vorbei-flaeche" style={{ height: px(vorbeiBis - oeffnungMin) }} aria-hidden="true" />
            )}

            <div className="raster-zeiten" aria-hidden="true">
              {stundenmarken(oeffnungMin, schlussMin).map((m) => (
                <span key={m} className="stunde tnum" style={{ top: px(m - oeffnungMin) }}>
                  {alsUhrzeit(m)}
                </span>
              ))}
            </div>

            {props.plaetze.map((platz) => {
              const belegt = props.belegungen
                .filter((b) => b.court_id === platz.id)
                .map((b) => ({ art: "block" as const, minute: lokaleMinuten(b.starts_at), b }));
              const frei: { art: "frei"; minute: number }[] = [];
              if (!kontingentAus) {
                for (let m = oeffnungMin; m + props.dauerMinuten <= schlussMin; m += props.rasterMinuten) {
                  if (startMoeglich(platz.id, m)) frei.push({ art: "frei", minute: m });
                }
              }
              // Nach der Zeit sortiert, damit die Tabulatortaste von oben nach unten laeuft.
              const eintraege = [...belegt, ...frei].sort((a, b) => a.minute - b.minute);

              return (
                <div key={platz.id} className="spalte" role="group" aria-label={platz.name}>
                  {eintraege.map((e) => {
                    if (e.art === "frei") {
                      return (
                        <button
                          key={`f${e.minute}`}
                          type="button"
                          className="frei-slot"
                          style={{ top: px(e.minute - oeffnungMin), height: px(props.rasterMinuten) }}
                          onClick={() => oeffneBuchen(platz.id, e.minute)}
                          aria-label={`${platz.name} um ${alsUhrzeit(e.minute)} buchen`}
                        >
                          <Plus />
                          <span className="vorschau" style={{ height: px(props.dauerMinuten) - 4 }}>
                            + {alsUhrzeit(e.minute)} buchen
                          </span>
                        </button>
                      );
                    }

                    const b = e.b;
                    const von = Math.max(oeffnungMin, lokaleMinuten(b.starts_at));
                    const bis = Math.min(schlussMin, lokaleMinuten(b.ends_at));
                    const klasse = `beleg ${ART_KLASSE[occupancyKind(b)]}${istMarkiert(b) ? " markiert" : ""}`;
                    const stil = { top: px(von - oeffnungMin) + 2, height: Math.max(px(bis - von) - 4, 18) };
                    const inhalt = (
                      <>
                        <span className="zeit tnum">
                          {alsUhrzeit(lokaleMinuten(b.starts_at))}–{alsUhrzeit(lokaleMinuten(b.ends_at))}
                        </span>
                        <span className="wer">
                          {wer(b)}
                          {b.partner_wanted && b.frei > 0 && <span className="sucht-marke">sucht {b.frei}</span>}
                        </span>
                        {b.players.length > 0 && <span className="mit">{b.players.join(", ")}</span>}
                        {b.kind === "blocking" && !b.series_id && blockingLabel(b).grund && (
                          <span className="mit">{blockingLabel(b).grund}</span>
                        )}
                      </>
                    );

                    return verwaltbar(b) ? (
                      <button
                        key={b.booking_id}
                        type="button"
                        className={klasse}
                        style={stil}
                        onClick={() => oeffneVerwalten(b)}
                        aria-label={`Buchung ${alsUhrzeit(lokaleMinuten(b.starts_at))} auf ${platz.name} verwalten`}
                      >
                        {inhalt}
                      </button>
                    ) : (
                      <div key={b.booking_id} className={klasse} style={stil}>
                        {inhalt}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {istHeute && lokaleJetzt(jetzt) >= oeffnungMin && lokaleJetzt(jetzt) <= schlussMin && (
              <div className="jetzt-linie" style={{ top: px(lokaleJetzt(jetzt) - oeffnungMin) }} aria-hidden="true">
                <span className="tnum">{alsUhrzeit(lokaleJetzt(jetzt))}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {fenster && (
        <BuchungsFenster
          fenster={fenster}
          datum={props.datum}
          plaetze={props.plaetze}
          belegungen={props.belegungen}
          arten={props.arten}
          blockungsarten={props.blockungsarten}
          verzeichnis={props.verzeichnis}
          meineId={props.meineId}
          jetzt={jetzt}
          oeffnungMinuten={oeffnungMin}
          schlussMinuten={schlussMin}
          startzeiten={
            fenster.modus === "buchen"
              ? startzeitenIn(fenster.courtId, fenster.stunde)
              : []
          }
          rasterMinuten={props.rasterMinuten}
          anzeigeMinuten={props.anzeigeMinuten}
          gastgebuehrCents={props.gastgebuehrCents}
          darfPlaetze={props.darfPlaetze}
          laeuft={laeuft}
          fehler={fensterFehler}
          onBuchen={abschicken}
          onSpeichern={speichern}
          onStornieren={abbrechen}
          onTerminAbsagen={terminAbsagen}
          onUmsetzen={setzeUm}
          onTagLaden={belegungAm}
          onSperren={sperren}
          onSperreAendern={sperreBearbeiten}
          onSperreAufheben={aufheben}
          onAusschreiben={ausschreiben}
          onBeitreten={beitreten}
          onSchliessen={() => {
            setFenster(null);
            setFensterFehler(null);
          }}
        />
      )}
    </>
  );
}

const lokaleJetzt = (d: Date) => localMinutes(d);

/** Volle Stunden von der Oeffnung bis vor den Schluss: 08:00 bis 20:00. */
function stundenmarken(oeffnung: number, schluss: number): number[] {
  const out: number[] = [];
  for (let m = Math.ceil(oeffnung / 60) * 60; m < schluss; m += 60) out.push(m);
  return out;
}

/* --- Legende --------------------------------------------------------------- */

/** Feines Plus fuer freie, buchbare Startzeiten im Raster. */
function Plus() {
  return (
    <svg className="plus" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M6 1.5v9M1.5 6h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Legende() {
  const eintraege: { name: string; art: TimelineKind }[] = [
    { name: "Deine", art: "eigen" },
    { name: "Belegt", art: "belegt" },
    { name: "Sucht Mitspieler", art: "sucht" },
    { name: "Training", art: "serie" },
    { name: "Gesperrt", art: "gesperrt" },
  ];
  return (
    <ul className="legende" aria-label="Legende">
      {eintraege.map((e) => (
        <li key={e.art}>
          <i className={e.art} aria-hidden="true" />
          {e.name}
        </li>
      ))}
    </ul>
  );
}
