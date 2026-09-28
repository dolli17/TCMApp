"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  berlinTime, canStartAt, courtStatusAt, localMinutes, minutesOf, minutesToTime, nextSlotMinute,
  occupancyKind, timeToMinutes, timelinePosition, timelineSegments,
  type CourtStatus, type TimelineKind,
} from "@tcm/core";
import {
  buchen, mitspielen, mitspielerAendern, mitspielerSuchen, serienterminAbsagen,
  stornieren, stundeSperren,
} from "@/app/plan/aktionen";
import { BuchungsFenster } from "@/components/BuchungsFenster";
import { MiniZeitleiste } from "@/components/MiniZeitleiste";

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

interface Props {
  datum: string;
  /** Jetzt, vom Server - damit Server und Browser beim ersten Zeichnen dasselbe rechnen. */
  jetzt: string;
  plaetze: Platz[];
  belegungen: Belegung[];
  arten: Buchungsart[];
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
  /** null bedeutet unbegrenzt (Kontingent auf 0 gestellt). */
  kontingentFrei: number | null;
  /** Gastgebuehr je Gast in Cent. */
  gastgebuehrCents: number;
  istAdmin: boolean;
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
 * Zwei Darstellungen derselben Daten, die CSS entscheidet: unter 768 px die
 * Zeit-zuerst-Liste wie in der App, darueber das Raster mit Bloecken ueber
 * die ganze Dauer einer Belegung. Beides aus einer Komponente, damit die
 * Zustaende nicht auseinanderlaufen.
 *
 * Gebucht wird zur vollen oder halben Stunde, immer 60 Minuten. Ob eine Zeit
 * frei ist, entscheidet canStartAt (@tcm/core), durchgesetzt wird es nur in
 * create_booking.
 */
export function Belegungsplan(props: Props) {
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
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

  /**
   * Die waehlbaren Startzeiten (Liste am Telefon). Heute ab der naechsten
   * Startzeit im Raster; ist der Tag vorbei, bleibt die letzte, damit eigene
   * Buchungen erreichbar bleiben.
   */
  const zeiten = useMemo(() => {
    const ab = istHeute
      ? nextSlotMinute({ openingMinutes: oeffnungMin, slotMinutes: props.rasterMinuten, now: jetzt })
      : oeffnungMin;
    const out: number[] = [];
    for (let m = ab; m + props.dauerMinuten <= schlussMin; m += props.rasterMinuten) out.push(m);
    if (out.length === 0) {
      out.push(
        oeffnungMin +
          Math.floor((schlussMin - props.dauerMinuten - oeffnungMin) / props.rasterMinuten) * props.rasterMinuten,
      );
    }
    return out;
  }, [istHeute, oeffnungMin, schlussMin, props.rasterMinuten, props.dauerMinuten, jetzt]);

  // Vorauswahl: die erste Zeit, zu der irgendein Platz frei ist.
  const [zeit, setZeit] = useState<number | null>(null);
  const vorschlag =
    zeiten.find((m) => props.plaetze.some((p) => startMoeglich(p.id, m))) ?? zeiten[0] ?? oeffnungMin;
  const gewaehlt = zeit !== null && zeiten.includes(zeit) ? zeit : vorschlag;

  // Die Server Actions rufen bereits revalidatePath auf; ein zusaetzliches
  // router.refresh() wuerde die Rueckmeldung sofort wieder verschlucken.
  //
  // Klappt es, schliesst das Blatt und die Meldung steht ueber dem Plan.
  // Scheitert es, bleibt das Blatt offen und der Grund steht ueber dem Knopf.
  function ergebnis(e: { ok: boolean; meldung: string }) {
    if (e.ok) {
      setMeldung({ ok: true, text: e.meldung });
      setFensterFehler(null);
      setFenster(null);
    } else {
      setFensterFehler(e.meldung);
    }
  }

  function abschicken(fd: FormData) {
    starte(async () => ergebnis(await buchen(fd)));
  }

  function speichern(bookingId: string, mitgliedIds: string[], gaeste: string[]) {
    starte(async () => ergebnis(await mitspielerAendern(bookingId, mitgliedIds, gaeste)));
  }

  function abbrechen(bookingId: string, grund?: string) {
    starte(async () => ergebnis(await stornieren(bookingId, grund)));
  }

  function terminAbsagen(bookingId: string, grund?: string) {
    starte(async () => ergebnis(await serienterminAbsagen(bookingId, grund)));
  }

  /**
   * Einen Anzeigeblock sperren, ohne den Plan zu verlassen.
   *
   * Gibt die Zahl der Kollisionen zurueck, damit das Blatt nachfragen kann,
   * statt still zu verdraengen.
   */
  async function sperren(
    courtId: string, minute: number, grund: string, verdraengen: boolean,
  ): Promise<number | null> {
    const e = await stundeSperren({
      platzId: courtId,
      von: zeitpunkt(minute).toISOString(),
      bis: zeitpunkt(minute + props.anzeigeMinuten).toISOString(),
      grund,
      verdraengen,
    });
    ergebnis(e);
    return e.kollisionen ?? null;
  }

  function ausschreiben(bookingId: string, gesucht: boolean) {
    starte(async () => ergebnis(await mitspielerSuchen(bookingId, gesucht)));
  }

  function beitreten(bookingId: string) {
    starte(async () => ergebnis(await mitspielen(bookingId)));
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
   * Neben Bucher und Admin auch jeder, dem sie offensteht: eine
   * ausgeschriebene Buchung ist eine Einladung, und die muss anklickbar sein.
   * Fremde Buchungen bleiben fuer Mitglieder reine Anzeige.
   */
  function verwaltbar(b: Belegung): boolean {
    if (props.istAdmin) return true;
    if (vergangen(lokaleMinuten(b.starts_at)) || b.kind !== "booking") return false;
    return b.is_own || (b.partner_wanted && b.frei > 0 && !b.bin_dabei);
  }

  /** Wer oder was steht im Block. */
  function wer(b: Belegung): string {
    if (b.kind === "blocking") return b.title ?? b.type_name;
    return b.owner_name ?? "belegt";
  }

  const legende = <Legende />;

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {/* --- Telefon: Zeit zuerst, eine Liste aller Plaetze ------------------ */}
      <div className="plan-listen">
        <p className="kicker" id="zeitwahl-titel">Wann willst du spielen?</p>
        <div className="zeit-chips" role="group" aria-labelledby="zeitwahl-titel">
          {zeiten.map((m) => (
            <button
              key={m}
              type="button"
              className="zeit-chip tnum"
              aria-pressed={m === gewaehlt}
              onClick={() => setZeit(m)}
            >
              {alsUhrzeit(m)}
            </button>
          ))}
        </div>

        <div className="platzliste">
          <div className="platzliste-skala" aria-hidden="true">
            {skala(oeffnungMin, schlussMin).map((s, i) => (
              <span key={s.text} style={{ left: `${s.links}%`, transform: i === 0 ? undefined : "translateX(-7px)" }}>
                {s.text}
              </span>
            ))}
          </div>
          {props.plaetze.map((platz) => {
            const st = courtStatusAt({
              day: props.datum, courtId: platz.id, minute: gewaehlt, durationMinutes: props.dauerMinuten,
              closingMinutes: schlussMin, occupied: props.belegungen, now: jetzt,
            });
            return (
              <Platzzeile
                key={platz.id}
                platz={platz}
                status={st}
                buchbar={st.art === "frei" && !kontingentAus}
                verwaltbar={Boolean(st.belegung && verwaltbar(st.belegung))}
                segmente={timelineSegments(
                  props.belegungen.filter((b) => b.court_id === platz.id), oeffnungMin, schlussMin,
                )}
                markierung={timelinePosition(gewaehlt, oeffnungMin, schlussMin)}
                onBuchen={() => oeffneBuchen(platz.id, gewaehlt)}
                onVerwalten={() => st.belegung && oeffneVerwalten(st.belegung)}
              />
            );
          })}
        </div>
        {legende}
      </div>

      {/* --- Ab Tablet: Raster mit Bloecken ueber die ganze Dauer ------------ */}
      <div className="plan-raster">
        <div className="raster-oben">
          {legende}
          <span className="raster-hinweis">
            Freie Zeit anklicken zum Buchen · {props.dauerMinuten} Minuten, Start zur vollen oder halben Stunde
          </span>
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
                          <span className="vorschau" style={{ height: px(props.dauerMinuten) - 4 }}>
                            + {alsUhrzeit(e.minute)} buchen
                          </span>
                        </button>
                      );
                    }

                    const b = e.b;
                    const von = Math.max(oeffnungMin, lokaleMinuten(b.starts_at));
                    const bis = Math.min(schlussMin, lokaleMinuten(b.ends_at));
                    const klasse = `beleg ${ART_KLASSE[occupancyKind(b)]}`;
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
          arten={props.arten}
          verzeichnis={props.verzeichnis}
          meineId={props.meineId}
          startzeiten={
            fenster.modus === "buchen"
              ? startzeitenIn(fenster.courtId, fenster.stunde)
              : []
          }
          rasterMinuten={props.rasterMinuten}
          anzeigeMinuten={props.anzeigeMinuten}
          gastgebuehrCents={props.gastgebuehrCents}
          istAdmin={props.istAdmin}
          laeuft={laeuft}
          fehler={fensterFehler}
          onBuchen={abschicken}
          onSpeichern={speichern}
          onStornieren={abbrechen}
          onTerminAbsagen={terminAbsagen}
          onSperren={sperren}
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

/** Beschriftung der Zeitleiste in der Liste: alle drei Stunden. */
function skala(oeffnung: number, schluss: number): { text: string; links: number }[] {
  const out: { text: string; links: number }[] = [];
  for (let m = Math.ceil(oeffnung / 60) * 60; m < schluss; m += 180) {
    out.push({ text: alsUhrzeit(m).slice(0, 2), links: timelinePosition(m, oeffnung, schluss) });
  }
  return out;
}

/* --- Eine Zeile der Liste am Telefon ------------------------------------- */

function Platzzeile({
  platz, status, buchbar, verwaltbar, segmente, markierung, onBuchen, onVerwalten,
}: {
  platz: Platz;
  status: CourtStatus<Belegung>;
  buchbar: boolean;
  verwaltbar: boolean;
  segmente: ReturnType<typeof timelineSegments>;
  markierung: number;
  onBuchen: () => void;
  onVerwalten: () => void;
}) {
  const b = status.belegung;
  const mitspielbar = status.art === "sucht" && verwaltbar && b !== undefined && !b.is_own && !b.bin_dabei;
  const klickbar = buchbar || verwaltbar;

  const aktion = buchbar ? (
    <span className="zeilen-aktion gelb">Buchen</span>
  ) : mitspielbar ? (
    <span className="zeilen-aktion umrandet">Mitspielen</span>
  ) : status.art === "gesperrt" ? (
    <Pfad d="M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3" />
  ) : verwaltbar ? (
    <Pfad d="M9 6l6 6-6 6" />
  ) : null;

  const inhalt = (
    <>
      <span className="zeilen-kopf">
        <span className="zeilen-text">
          <b className="dpl">{platz.name}</b>
          <small className={`status-${status.art}`}>{status.text}</small>
        </span>
        {aktion}
      </span>
      <MiniZeitleiste segmente={segmente} markierung={markierung} gross />
    </>
  );

  return klickbar ? (
    <button
      type="button"
      className="platzzeile"
      onClick={buchbar ? onBuchen : onVerwalten}
      aria-label={`${platz.name}, ${status.text}`}
    >
      {inhalt}
    </button>
  ) : (
    <div className="platzzeile" aria-label={`${platz.name}, ${status.text}`} role="group">
      {inhalt}
    </div>
  );
}

function Pfad({ d }: { d: string }) {
  return (
    <svg className="zeilen-symbol" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* --- Legende --------------------------------------------------------------- */

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
