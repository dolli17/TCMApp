"use client";

import { useMemo, useState, useTransition } from "react";
import { buchen, stornieren } from "@/app/plan/aktionen";

export interface Platz {
  id: string;
  name: string;
  short_name: string;
}

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

export interface Mitglied {
  id: string;
  first_name: string;
  last_name: string;
}

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
  vorlaufTage: number;
}

/** Minuten seit Mitternacht in lokaler Zeit. */
function lokaleMinuten(iso: string): number {
  const d = new Date(iso);
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(teile.find((t) => t.type === "hour")?.value ?? 0);
  const m = Number(teile.find((t) => t.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

function zuMinuten(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function alsUhrzeit(minuten: number): string {
  return `${String(Math.floor(minuten / 60)).padStart(2, "0")}:${String(minuten % 60).padStart(2, "0")}`;
}

export function Belegungsplan(props: Props) {
  const [ausgewaehlt, setAusgewaehlt] = useState<{ courtId: string; minute: number } | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starteUebergang] = useTransition();

  const oeffnungMin = zuMinuten(props.oeffnung);
  const schlussMin = zuMinuten(props.schluss);

  const zeilen = useMemo(() => {
    const out: number[] = [];
    for (let m = oeffnungMin; m < schlussMin; m += props.rasterMinuten) out.push(m);
    return out;
  }, [oeffnungMin, schlussMin, props.rasterMinuten]);

  /** Welche Belegung deckt diesen Platz zu dieser Minute ab? */
  function belegungFuer(courtId: string, minute: number): Belegung | undefined {
    return props.belegungen.find((b) => {
      if (b.court_id !== courtId) return false;
      const von = lokaleMinuten(b.starts_at);
      const bis = lokaleMinuten(b.ends_at);
      return minute >= von && minute < bis;
    });
  }

  /** Nur die erste Zeile einer Belegung zeigt den Text. */
  function istBeginn(b: Belegung, minute: number): boolean {
    return lokaleMinuten(b.starts_at) === minute;
  }

  function inVergangenheit(minute: number): boolean {
    const [j, mo, t] = props.datum.split("-").map(Number);
    const d = new Date(j!, (mo ?? 1) - 1, t, Math.floor(minute / 60), minute % 60);
    return d.getTime() < Date.now();
  }

  // Die Server Actions rufen bereits revalidatePath auf; ein zusaetzliches
  // router.refresh() wuerde die Komponente neu einhaengen und die eben
  // gesetzte Rueckmeldung sofort wieder verschlucken.
  function abschicken(formData: FormData) {
    starteUebergang(async () => {
      const ergebnis = await buchen(formData);
      setMeldung({ ok: ergebnis.ok, text: ergebnis.meldung });
      if (ergebnis.ok) setAusgewaehlt(null);
    });
  }

  function abbrechen(bookingId: string) {
    starteUebergang(async () => {
      const ergebnis = await stornieren(bookingId);
      setMeldung({ ok: ergebnis.ok, text: ergebnis.meldung });
    });
  }

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`}>{meldung.text}</div>
      )}

      <div className="plan-huelle">
        <table className="plan">
          <thead>
            <tr>
              <th className="zeit">Zeit</th>
              {props.plaetze.map((p) => (
                <th key={p.id}>{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((minute) => (
              <tr key={minute}>
                <td className="zeit">{alsUhrzeit(minute)}</td>
                {props.plaetze.map((platz) => {
                  const b = belegungFuer(platz.id, minute);

                  if (b) {
                    if (!istBeginn(b, minute)) return <td key={platz.id} />;

                    const spanne = Math.max(
                      1,
                      Math.round(
                        (lokaleMinuten(b.ends_at) - lokaleMinuten(b.starts_at)) /
                          props.rasterMinuten,
                      ),
                    );
                    const klasse =
                      b.kind === "blocking" ? "blockung" : b.is_own ? "belegt eigen" : "belegt";

                    return (
                      <td key={platz.id} rowSpan={spanne}>
                        <span className={`zelle ${klasse}`}>
                          <strong>{b.kind === "blocking" ? b.title : b.owner_name}</strong>
                          {b.players.length > 0 && (
                            <>
                              <br />
                              {b.players.join(", ")}
                            </>
                          )}
                          {b.is_own && !inVergangenheit(minute) && (
                            <>
                              <br />
                              <button
                                className="knopf leise"
                                style={{ marginTop: 4, padding: "0.1rem 0.4rem", fontSize: "0.75rem" }}
                                onClick={() => abbrechen(b.booking_id)}
                                disabled={laeuft}
                              >
                                Stornieren
                              </button>
                            </>
                          )}
                        </span>
                      </td>
                    );
                  }

                  const vergangen = inVergangenheit(minute);
                  const gewaehlt =
                    ausgewaehlt?.courtId === platz.id && ausgewaehlt?.minute === minute;

                  return (
                    <td key={platz.id}>
                      <button
                        className={`zelle ${vergangen ? "gesperrt" : "frei"}`}
                        disabled={vergangen || props.kontingentFrei <= 0}
                        onClick={() => setAusgewaehlt({ courtId: platz.id, minute })}
                        title={
                          props.kontingentFrei <= 0
                            ? "Kontingent ausgeschöpft"
                            : `${platz.name} um ${alsUhrzeit(minute)} buchen`
                        }
                      >
                        {gewaehlt ? "gewählt" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
  datum,
  platz,
  minute,
  arten,
  verzeichnis,
  laeuft,
  onAbschicken,
  onSchliessen,
}: {
  datum: string;
  platz: Platz;
  minute: number;
  arten: Buchungsart[];
  verzeichnis: Mitglied[];
  laeuft: boolean;
  onAbschicken: (fd: FormData) => void;
  onSchliessen: () => void;
}) {
  const [art, setArt] = useState(arten[0]?.code ?? "einzel");
  const [mitspieler, setMitspieler] = useState<string[]>([""]);
  const [gaeste, setGaeste] = useState<string[]>([]);

  const gewaehlteArt = arten.find((a) => a.code === art);
  const maxWeitere = (gewaehlteArt?.max_players ?? 2) - 1;

  // Startzeitpunkt als ISO in lokaler Zeit
  const [j, mo, t] = datum.split("-").map(Number);
  const start = new Date(j!, (mo ?? 1) - 1, t, Math.floor(minute / 60), minute % 60, 0, 0);

  return (
    <div className="karte" style={{ marginTop: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>
        {platz.name}, {alsUhrzeit(minute)} Uhr
      </h2>

      <form action={onAbschicken}>
        <input type="hidden" name="courtId" value={platz.id} />
        <input type="hidden" name="startsAt" value={start.toISOString()} />

        <label>
          <span>Buchungsart</span>
          <select name="bookingType" value={art} onChange={(e) => setArt(e.target.value)}>
            {arten.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name} ({a.duration_minutes} Min.)
              </option>
            ))}
          </select>
        </label>

        <span style={{ fontSize: "0.9rem", color: "var(--text-leise)" }}>
          Mitspieler {gewaehlteArt?.requires_partner ? "(Pflicht)" : ""}
        </span>
        {mitspieler.map((wert, i) => (
          <label key={i}>
            <select
              name="mitspieler"
              value={wert}
              onChange={(e) => {
                const neu = [...mitspieler];
                neu[i] = e.target.value;
                setMitspieler(neu);
              }}
            >
              <option value="">— auswählen —</option>
              {verzeichnis.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.last_name}, {m.first_name}
                </option>
              ))}
            </select>
          </label>
        ))}

        {gaeste.map((wert, i) => (
          <label key={`g${i}`}>
            <span>Gast</span>
            <input
              name="gast"
              value={wert}
              placeholder="Name des Gastes"
              onChange={(e) => {
                const neu = [...gaeste];
                neu[i] = e.target.value;
                setGaeste(neu);
              }}
            />
          </label>
        ))}

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {mitspieler.length + gaeste.length < maxWeitere && (
            <>
              <button
                type="button"
                className="knopf leise"
                onClick={() => setMitspieler([...mitspieler, ""])}
              >
                + Mitglied
              </button>
              <button
                type="button"
                className="knopf leise"
                onClick={() => setGaeste([...gaeste, ""])}
              >
                + Gast
              </button>
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="knopf" disabled={laeuft}>
            {laeuft ? "Wird gebucht…" : "Verbindlich buchen"}
          </button>
          <button type="button" className="knopf leise" onClick={onSchliessen}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
