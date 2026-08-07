"use client";

import { useMemo, useState, useTransition } from "react";
import { berlinTime, minutesOf, minutesToTime, timeToMinutes } from "@tcm/core";
import {
  buchen, mitspielen, mitspielerAendern, mitspielerSuchen, serienterminAbsagen,
  stornieren, stundeSperren,
} from "@/app/plan/aktionen";
import { BuchungsFenster } from "@/components/BuchungsFenster";

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
  /** Anzeigeraster in Minuten - 60, eine Zeile je Stunde. */
  anzeigeMinuten: number;
  /** Immer 60: die Dauer, die eine neue Buchung belegt. */
  dauerMinuten: number;
  /** null bedeutet unbegrenzt (Kontingent auf 0 gestellt). */
  kontingentFrei: number | null;
  /** Gastgebuehr je Gast in Cent. 0 schaltet den Gast-Knopf ab. */
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

/** Was im Fenster gerade bearbeitet wird. */
export type Fenster =
  | { modus: "buchen"; courtId: string; stunde: number }
  | { modus: "verwalten"; belegung: Belegung };

/**
 * Zwei Darstellungen derselben Daten: am Telefon eine Liste je Platz, ab
 * Tablet das volle Raster. Ein Raster mit acht Spalten ist auf 390 Pixel
 * unbedienbar - beides aus einer Komponente, damit die Zustaende nicht
 * auseinanderlaufen.
 *
 * Die Tabelle zeigt volle Stunden. Gebucht wird zur vollen oder halben Stunde,
 * immer 60 Minuten lang - die Feinwahl passiert im Fenster. Eine Belegung
 * sperrt jede Stunde, die sie beruehrt: das Dienstagstraining von 18:30 bis
 * 20:00 waere sonst in einem Stundenraster unsichtbar, und der 18-Uhr-Platz
 * saehe frei aus, obwohl er es nicht ist.
 */
export function Belegungsplan(props: Props) {
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  const oeffnungMin = zuMinuten(props.oeffnung);
  const schlussMin = zuMinuten(props.schluss);

  /** Eine Zeile je Anzeigeintervall, also je volle Stunde. */
  const stunden = useMemo(() => {
    const out: number[] = [];
    for (let m = oeffnungMin; m + props.anzeigeMinuten <= schlussMin; m += props.anzeigeMinuten) {
      out.push(m);
    }
    return out;
  }, [oeffnungMin, schlussMin, props.anzeigeMinuten]);

  /** Alle Belegungen, die diese Stunde beruehren - nicht nur die, die darin beginnt. */
  const belegungenIn = useMemo(() => {
    const karte = new Map<string, Belegung[]>();
    for (const b of props.belegungen) {
      const von = lokaleMinuten(b.starts_at);
      const bis = lokaleMinuten(b.ends_at);
      for (const s of stunden) {
        if (von < s + props.anzeigeMinuten && bis > s) {
          const schluessel = `${b.court_id}|${s}`;
          const liste = karte.get(schluessel);
          if (liste) liste.push(b);
          else karte.set(schluessel, [b]);
        }
      }
    }
    return karte;
  }, [props.belegungen, props.anzeigeMinuten, stunden]);

  /**
   * Alle Belegungen dieser Zelle, nach Startzeit sortiert.
   *
   * Vorher wurde nur die erste zurueckgegeben - zwei Buchungen, die dieselbe
   * Anzeigestunde beruehren (17:30-18:30 und 18:30-19:30), erschienen als eine,
   * und die zweite fehlte im Plan vollstaendig.
   */
  const belegungenFuer = (courtId: string, stunde: number): Belegung[] =>
    (belegungenIn.get(`${courtId}|${stunde}`) ?? [])
      .slice()
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  const zeitpunkt = (minute: number) => berlinTime(props.datum, minute);

  const vergangen = (minute: number) => zeitpunkt(minute).getTime() < Date.now();

  /**
   * Kann auf diesem Platz um genau diese Minute eine Buchung beginnen?
   * Geprueft wird gegen die volle Dauer, nicht nur gegen die Startminute -
   * sonst laesst sich 18:00 anklicken, obwohl 18:30 schon belegt ist.
   */
  function startMoeglich(courtId: string, minute: number): boolean {
    if (vergangen(minute)) return false;
    if (minute + props.dauerMinuten > schlussMin) return false;
    return !props.belegungen.some(
      (b) =>
        b.court_id === courtId &&
        lokaleMinuten(b.starts_at) < minute + props.dauerMinuten &&
        lokaleMinuten(b.ends_at) > minute,
    );
  }

  /** Die :00- und :30-Startzeiten, die in dieser Stunde noch frei sind. */
  function startzeitenIn(courtId: string, stunde: number): number[] {
    const out: number[] = [];
    for (let m = stunde; m < stunde + props.anzeigeMinuten; m += props.rasterMinuten) {
      if (startMoeglich(courtId, m)) out.push(m);
    }
    return out;
  }

  const kontingentAus = props.kontingentFrei !== null && props.kontingentFrei <= 0;

  // Die Server Actions rufen bereits revalidatePath auf; ein zusaetzliches
  // router.refresh() wuerde die Rueckmeldung sofort wieder verschlucken.
  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await buchen(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setFenster(null);
    });
  }

  function speichern(bookingId: string, mitgliedIds: string[], gaeste: string[]) {
    starte(async () => {
      const e = await mitspielerAendern(bookingId, mitgliedIds, gaeste);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setFenster(null);
    });
  }

  function abbrechen(bookingId: string, grund?: string) {
    starte(async () => {
      const e = await stornieren(bookingId, grund);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setFenster(null);
    });
  }

  function terminAbsagen(bookingId: string, grund?: string) {
    starte(async () => {
      const e = await serienterminAbsagen(bookingId, grund);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setFenster(null);
    });
  }

  /**
   * Eine Stunde sperren, ohne den Plan zu verlassen.
   *
   * Gibt die Zahl der Kollisionen zurueck, damit das Fenster nachfragen kann,
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
    setMeldung({ ok: e.ok, text: e.meldung });
    if (e.ok) setFenster(null);
    return e.kollisionen ?? null;
  }

  function ausschreiben(bookingId: string, gesucht: boolean) {
    starte(async () => {
      const e = await mitspielerSuchen(bookingId, gesucht);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setFenster(null);
    });
  }

  function beitreten(bookingId: string) {
    starte(async () => {
      const e = await mitspielen(bookingId);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setFenster(null);
    });
  }

  /**
   * Wer darf eine bestehende Buchung anfassen?
   *
   * Neben Bucher und Admin jetzt auch jeder, dem sie offensteht: eine
   * ausgeschriebene Buchung ist eine Einladung, und die muss anklickbar sein.
   */
  function verwaltbar(b: Belegung): boolean {
    if (props.istAdmin) return true;
    if (vergangen(lokaleMinuten(b.starts_at)) || b.kind !== "booking") return false;
    return b.is_own || (b.partner_wanted && b.frei > 0 && !b.bin_dabei);
  }

  function beschriftung(b: Belegung, stunde: number): string {
    const von = lokaleMinuten(b.starts_at);
    const bis = lokaleMinuten(b.ends_at);
    const wer = b.kind === "blocking" ? (b.title ?? b.type_name) : (b.owner_name ?? "belegt");
    // Nur anschreiben, wenn die Belegung die Stunde nicht ausfuellt - sonst
    // steht in jeder Zelle noch einmal, was schon in der Zeitspalte steht.
    const teilweise = von > stunde || bis < stunde + props.anzeigeMinuten;
    return teilweise ? `${alsUhrzeit(von)}–${alsUhrzeit(bis)} ${wer}` : wer;
  }

  /** Eine Buchung, die noch Mitspieler sucht und Platz hat. */
  const offen = (b: Belegung) => b.partner_wanted && b.frei > 0;

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">
          {meldung.text}
        </div>
      )}

      {/* --- Telefon: eine Karte je Platz ---------------------------------- */}
      <div className="plan-listen">
        {props.plaetze.map((platz) => {
          const eigene = props.belegungen
            .filter((b) => b.court_id === platz.id)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          // Eine Stunde taugt, sobald darin ueberhaupt eine Startzeit frei ist.
          // Vorher wurde zusaetzlich verlangt, dass die Stunde vollstaendig
          // leer ist - dadurch liess sich :30 am Telefon nicht buchen, wenn :00
          // belegt war, obwohl der Platz frei stand.
          const freieStunden = stunden.filter(
            (s) => startzeitenIn(platz.id, s).length > 0,
          );

          return (
            <section key={platz.id} className="platzkarte" aria-label={platz.name}>
              <h3>{platz.name}</h3>

              {eigene.length === 0 ? (
                <p className="mit" style={{ color: "var(--muted)", margin: 0 }}>ganztägig frei</p>
              ) : (
                eigene.map((b) => {
                  const inhalt = (
                    <>
                      <div>
                        <span className="zeit">
                          {alsUhrzeit(lokaleMinuten(b.starts_at))}–{alsUhrzeit(lokaleMinuten(b.ends_at))}
                        </span>{" "}
                        <span className="wer">{b.kind === "blocking" ? b.title : b.owner_name}</span>
                      </div>
                      {b.players.length > 0 && <div className="mit">mit {b.players.join(", ")}</div>}
                    </>
                  );
                  const klasse = `belegzeile ${b.is_own ? "eigen" : b.kind === "blocking" ? "blockung" : ""}`;

                  return verwaltbar(b) ? (
                    <button
                      key={b.booking_id}
                      type="button"
                      className={`${klasse} anklickbar${offen(b) ? " sucht-mitspieler" : ""}`}
                      onClick={() => setFenster({ modus: "verwalten", belegung: b })}
                      aria-label={`Buchung ${alsUhrzeit(lokaleMinuten(b.starts_at))} auf ${platz.name} verwalten`}
                    >
                      {inhalt}
                      <span className="mit verwalten-hinweis">
                        {b.is_own || props.istAdmin ? "Verwalten" : "Mitspielen"}
                      </span>
                    </button>
                  ) : (
                    <div key={b.booking_id} className={klasse}>{inhalt}</div>
                  );
                })
              )}

              {freieStunden.length > 0 && (
                <div className="freie-slots">
                  {freieStunden.map((s) => (
                    <button
                      key={s}
                      className="slotknopf"
                      disabled={kontingentAus}
                      onClick={() => setFenster({ modus: "buchen", courtId: platz.id, stunde: s })}
                      aria-label={`${platz.name} um ${alsUhrzeit(s)} buchen`}
                    >
                      {alsUhrzeit(s)}
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* --- Ab Tablet: volles Raster -------------------------------------- */}
      <div className="plan-raster">
        <div className="plan-huelle">
          <table className="plan">
            <thead>
              <tr>
                <th className="zeit" scope="col">Zeit</th>
                {props.plaetze.map((p) => <th key={p.id} scope="col">{p.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {stunden.map((stunde) => (
                <tr key={stunde}>
                  <td className="zeit">{alsUhrzeit(stunde)}</td>
                  {props.plaetze.map((platz) => {
                    const belegt = belegungenFuer(platz.id, stunde);
                    const startzeiten = startzeitenIn(platz.id, stunde);

                    // Jede Belegung dieser Stunde wird gezeigt, nicht nur die
                    // erste. Und ist danach noch eine Startzeit frei, laesst
                    // sich die Stunde trotzdem anklicken.
                    if (belegt.length > 0) {
                      return (
                        <td key={platz.id}>
                          {belegt.map((b) => {
                            const klasse =
                              b.kind === "blocking"
                                ? "blockung"
                                : b.is_own
                                  ? "belegt eigen"
                                  : "belegt";
                            const text = beschriftung(b, stunde);
                            const inhalt = (
                              <>
                                <strong>{text}</strong>
                                {offen(b) && <span className="sucht">sucht {b.frei}</span>}
                                {b.players.length > 0 && <><br />{b.players.join(", ")}</>}
                              </>
                            );

                            return verwaltbar(b) ? (
                              <button
                                key={b.booking_id}
                                type="button"
                                className={`zelle ${klasse} anklickbar${offen(b) ? " sucht-mitspieler" : ""}`}
                                onClick={() => setFenster({ modus: "verwalten", belegung: b })}
                                aria-label={`Buchung ${alsUhrzeit(lokaleMinuten(b.starts_at))} auf ${platz.name} verwalten`}
                              >
                                {inhalt}
                              </button>
                            ) : (
                              <span key={b.booking_id} className={`zelle ${klasse}`}>
                                {inhalt}
                              </span>
                            );
                          })}

                          {startzeiten.length > 0 && (
                            <button
                              className="zelle frei rest"
                              disabled={kontingentAus}
                              onClick={() =>
                                setFenster({ modus: "buchen", courtId: platz.id, stunde })
                              }
                              aria-label={`${platz.name} um ${alsUhrzeit(startzeiten[0]!)} buchen`}
                            >
                              ab {alsUhrzeit(startzeiten[0]!)} frei
                            </button>
                          )}
                        </td>
                      );
                    }

                    const zu = startzeiten.length === 0;

                    return (
                      <td key={platz.id}>
                        <button
                          className={`zelle ${zu ? "gesperrt" : "frei"}`}
                          disabled={zu || kontingentAus}
                          onClick={() => setFenster({ modus: "buchen", courtId: platz.id, stunde })}
                          aria-label={`${platz.name} um ${alsUhrzeit(stunde)} buchen`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
          onBuchen={abschicken}
          onSpeichern={speichern}
          onStornieren={abbrechen}
          onTerminAbsagen={terminAbsagen}
          onSperren={sperren}
          onAusschreiben={ausschreiben}
          onBeitreten={beitreten}
          onSchliessen={() => setFenster(null)}
        />
      )}
    </>
  );
}
