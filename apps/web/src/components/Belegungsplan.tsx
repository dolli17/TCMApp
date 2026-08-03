"use client";

import { useMemo, useState, useTransition } from "react";
import { buchen, stornieren } from "@/app/plan/aktionen";

export interface Platz { id: string; name: string; short_name: string }

export interface Belegung {
  booking_id: string;
  court_id: string;
  starts_at: string;
  ends_at: string;
  kind: "booking" | "blocking";
  type_name: string;
  title: string | null;
  owner_name: string | null;
  is_own: boolean;
  players: string[];
}

export interface Buchungsart {
  code: string;
  name: string;
  duration_minutes: number;
  requires_partner: boolean;
  max_players: number;
}

export interface Mitglied { id: string; first_name: string; last_name: string }

interface Props {
  datum: string;
  plaetze: Platz[];
  belegungen: Belegung[];
  arten: Buchungsart[];
  verzeichnis: Mitglied[];
  oeffnung: string;
  schluss: string;
  rasterMinuten: number;
  kontingentFrei: number;
}

/** Minuten seit Mitternacht in deutscher Ortszeit. */
function lokaleMinuten(iso: string): number {
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(teile.find((t) => t.type === "hour")?.value ?? 0);
  const m = Number(teile.find((t) => t.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

const zuMinuten = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const alsUhrzeit = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Zwei Darstellungen derselben Daten: am Telefon eine Liste je Platz, ab
 * Tablet das volle Raster. Ein Raster mit acht Spalten ist auf 390 Pixel
 * unbedienbar - beides aus einer Komponente, damit die Zustaende nicht
 * auseinanderlaufen.
 */
export function Belegungsplan(props: Props) {
  const [ausgewaehlt, setAusgewaehlt] = useState<{ courtId: string; minute: number } | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  const oeffnungMin = zuMinuten(props.oeffnung);
  const schlussMin = zuMinuten(props.schluss);

  const zeilen = useMemo(() => {
    const out: number[] = [];
    for (let m = oeffnungMin; m < schlussMin; m += props.rasterMinuten) out.push(m);
    return out;
  }, [oeffnungMin, schlussMin, props.rasterMinuten]);

  function belegungFuer(courtId: string, minute: number) {
    return props.belegungen.find((b) => {
      if (b.court_id !== courtId) return false;
      return minute >= lokaleMinuten(b.starts_at) && minute < lokaleMinuten(b.ends_at);
    });
  }

  function vergangen(minute: number): boolean {
    const [j, mo, t] = props.datum.split("-").map(Number);
    return new Date(j!, (mo ?? 1) - 1, t, Math.floor(minute / 60), minute % 60).getTime() < Date.now();
  }

  const gesperrt = props.kontingentFrei <= 0;

  // Die Server Actions rufen bereits revalidatePath auf; ein zusaetzliches
  // router.refresh() wuerde die Rueckmeldung sofort wieder verschlucken.
  function abschicken(fd: FormData) {
    starte(async () => {
      const e = await buchen(fd);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok) setAusgewaehlt(null);
    });
  }

  function abbrechen(id: string) {
    starte(async () => {
      const e = await stornieren(id);
      setMeldung({ ok: e.ok, text: e.meldung });
    });
  }

  function waehle(courtId: string, minute: number) {
    setAusgewaehlt({ courtId, minute });
  }

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
          const frei = zeilen.filter((m) => !belegungFuer(platz.id, m) && !vergangen(m));

          return (
            <section key={platz.id} className="platzkarte" aria-label={platz.name}>
              <h3>{platz.name}</h3>

              {eigene.length === 0 ? (
                <p className="mit" style={{ color: "var(--muted)", margin: 0 }}>ganztägig frei</p>
              ) : (
                eigene.map((b) => (
                  <div
                    key={b.booking_id}
                    className={`belegzeile ${b.is_own ? "eigen" : b.kind === "blocking" ? "blockung" : ""}`}
                  >
                    <div>
                      <span className="zeit">
                        {alsUhrzeit(lokaleMinuten(b.starts_at))}–{alsUhrzeit(lokaleMinuten(b.ends_at))}
                      </span>{" "}
                      <span className="wer">{b.kind === "blocking" ? b.title : b.owner_name}</span>
                    </div>
                    {b.players.length > 0 && <div className="mit">mit {b.players.join(", ")}</div>}
                    {b.is_own && !vergangen(lokaleMinuten(b.starts_at)) && (
                      <button className="knopf leise klein" onClick={() => abbrechen(b.booking_id)} disabled={laeuft}>
                        Stornieren
                      </button>
                    )}
                  </div>
                ))
              )}

              {frei.length > 0 && (
                <div className="freie-slots">
                  {frei.map((m) => (
                    <button
                      key={m}
                      className="slotknopf"
                      disabled={gesperrt}
                      onClick={() => waehle(platz.id, m)}
                      aria-label={`${platz.name} um ${alsUhrzeit(m)} buchen`}
                    >
                      {alsUhrzeit(m)}
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
              {zeilen.map((minute) => (
                <tr key={minute}>
                  <td className="zeit">{alsUhrzeit(minute)}</td>
                  {props.plaetze.map((platz) => {
                    const b = belegungFuer(platz.id, minute);

                    if (b) {
                      if (lokaleMinuten(b.starts_at) !== minute) return <td key={platz.id} />;
                      const spanne = Math.max(1, Math.round(
                        (lokaleMinuten(b.ends_at) - lokaleMinuten(b.starts_at)) / props.rasterMinuten,
                      ));
                      const klasse = b.kind === "blocking" ? "blockung" : b.is_own ? "belegt eigen" : "belegt";

                      return (
                        <td key={platz.id} rowSpan={spanne}>
                          <span className={`zelle ${klasse}`}>
                            <strong>{b.kind === "blocking" ? b.title : b.owner_name}</strong>
                            {b.players.length > 0 && <><br />{b.players.join(", ")}</>}
                            {b.is_own && !vergangen(minute) && (
                              <>
                                <br />
                                <button className="knopf leise klein" style={{ marginTop: 4 }}
                                  onClick={() => abbrechen(b.booking_id)} disabled={laeuft}>
                                  Stornieren
                                </button>
                              </>
                            )}
                          </span>
                        </td>
                      );
                    }

                    const alt = vergangen(minute);
                    return (
                      <td key={platz.id}>
                        <button
                          className={`zelle ${alt ? "gesperrt" : "frei"}`}
                          disabled={alt || gesperrt}
                          onClick={() => waehle(platz.id, minute)}
                          aria-label={`${platz.name} um ${alsUhrzeit(minute)} buchen`}
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

      {ausgewaehlt && (
        <BuchungsFormular
          datum={props.datum}
          platz={props.plaetze.find((p) => p.id === ausgewaehlt.courtId)!}
          minute={ausgewaehlt.minute}
          arten={props.arten}
          verzeichnis={props.verzeichnis}
          laeuft={laeuft}
          onAbschicken={abschicken}
          onSchliessen={() => setAusgewaehlt(null)}
        />
      )}
    </>
  );
}

function BuchungsFormular({
  datum, platz, minute, arten, verzeichnis, laeuft, onAbschicken, onSchliessen,
}: {
  datum: string; platz: Platz; minute: number; arten: Buchungsart[];
  verzeichnis: Mitglied[]; laeuft: boolean;
  onAbschicken: (fd: FormData) => void; onSchliessen: () => void;
}) {
  const [art, setArt] = useState(arten[0]?.code ?? "einzel");
  const [mitspieler, setMitspieler] = useState<string[]>([""]);
  const [gaeste, setGaeste] = useState<string[]>([]);

  const gewaehlt = arten.find((a) => a.code === art);
  const maxWeitere = (gewaehlt?.max_players ?? 2) - 1;

  const [j, mo, t] = datum.split("-").map(Number);
  const start = new Date(j!, (mo ?? 1) - 1, t, Math.floor(minute / 60), minute % 60, 0, 0);

  return (
    <section className="karte" style={{ marginTop: 20 }} aria-label="Buchung anlegen">
      <h2 className="pagetitle" style={{ fontSize: 20, marginBottom: 12 }}>
        {platz.name}, {alsUhrzeit(minute)} Uhr
      </h2>

      <form action={onAbschicken}>
        <input type="hidden" name="courtId" value={platz.id} />
        <input type="hidden" name="startsAt" value={start.toISOString()} />

        <label>
          <span>Buchungsart</span>
          <select name="bookingType" value={art} onChange={(e) => setArt(e.target.value)}>
            {arten.map((a) => (
              <option key={a.code} value={a.code}>{a.name} ({a.duration_minutes} Min.)</option>
            ))}
          </select>
        </label>

        {mitspieler.map((wert, i) => (
          <label key={i}>
            <span>Mitspieler {gewaehlt?.requires_partner ? "(Pflicht)" : ""}</span>
            <select name="mitspieler" value={wert}
              onChange={(e) => { const n = [...mitspieler]; n[i] = e.target.value; setMitspieler(n); }}>
              <option value="">— auswählen —</option>
              {verzeichnis.map((m) => (
                <option key={m.id} value={m.id}>{m.last_name}, {m.first_name}</option>
              ))}
            </select>
          </label>
        ))}

        {gaeste.map((wert, i) => (
          <label key={`g${i}`}>
            <span>Gast</span>
            <input name="gast" value={wert} placeholder="Name des Gastes"
              onChange={(e) => { const n = [...gaeste]; n[i] = e.target.value; setGaeste(n); }} />
          </label>
        ))}

        {mitspieler.length + gaeste.length < maxWeitere && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button type="button" className="knopf leise klein"
              onClick={() => setMitspieler([...mitspieler, ""])}>+ Mitglied</button>
            <button type="button" className="knopf leise klein"
              onClick={() => setGaeste([...gaeste, ""])}>+ Gast</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="knopf" disabled={laeuft}>
            {laeuft ? "Wird gebucht…" : "Verbindlich buchen"}
          </button>
          <button type="button" className="knopf leise" onClick={onSchliessen}>Abbrechen</button>
        </div>
      </form>
    </section>
  );
}
