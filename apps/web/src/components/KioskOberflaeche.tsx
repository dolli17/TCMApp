"use client";

import { useMemo, useState, useTransition } from "react";
import { formatCents } from "@tcm/core";
import { kioskBuchen } from "@/app/getraenke/aktionen";

interface Mitglied {
  id: string;
  first_name: string;
  last_name: string;
}
interface Artikel {
  id: string;
  name: string;
  price_cents: number;
}

/**
 * Bedienung in zwei Schritten: erst wer, dann was. Nach der Buchung springt
 * die Ansicht automatisch zurueck zur Namensliste - am Tresen steht selten
 * jemand, der zweimal hintereinander dasselbe braucht, und der naechste soll
 * nicht versehentlich auf den Vorgaenger buchen.
 */
export function KioskOberflaeche({
  mitglieder,
  artikel,
}: {
  mitglieder: Mitglied[];
  artikel: Artikel[];
}) {
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<Mitglied | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, starte] = useTransition();

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const liste = q
      ? mitglieder.filter(
          (m) =>
            m.last_name.toLowerCase().includes(q) || m.first_name.toLowerCase().includes(q),
        )
      : mitglieder;
    return liste.slice(0, 60);
  }, [mitglieder, suche]);

  function buchen(item: Artikel) {
    if (!gewaehlt) return;
    starte(async () => {
      const r = await kioskBuchen(gewaehlt.id, item.id, 1);
      setMeldung(
        r.ok ? `${item.name} für ${gewaehlt.first_name} ${gewaehlt.last_name} gebucht.` : r.meldung,
      );
      setGewaehlt(null);
      setSuche("");
      setTimeout(() => setMeldung(null), 4000);
    });
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <h1>Getränke an der Theke</h1>

      {meldung && <div className="hinweis erfolg">{meldung}</div>}

      {!gewaehlt ? (
        <>
          <p className="unterzeile">Wer nimmt etwas?</p>
          <input
            autoFocus
            placeholder="Name eingeben…"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            style={{ fontSize: "1.2rem", padding: "0.8rem", marginBottom: "1rem" }}
          />
          <div className="kachel-reihe">
            {gefiltert.map((m) => (
              <button
                key={m.id}
                className="kachel"
                style={{ cursor: "pointer", font: "inherit", textAlign: "left" }}
                onClick={() => setGewaehlt(m)}
              >
                <div style={{ fontWeight: 600 }}>{m.last_name}</div>
                <div className="titel">{m.first_name}</div>
              </button>
            ))}
          </div>
          {gefiltert.length === 0 && <p className="leer">Niemand gefunden.</p>}
        </>
      ) : (
        <>
          <p className="unterzeile">
            Für <strong>{gewaehlt.first_name} {gewaehlt.last_name}</strong> —{" "}
            <button className="knopf leise" onClick={() => setGewaehlt(null)}>
              anderes Mitglied
            </button>
          </p>
          <div className="kachel-reihe">
            {artikel.map((a) => (
              <button
                key={a.id}
                className="kachel"
                style={{ cursor: "pointer", font: "inherit", textAlign: "left" }}
                onClick={() => buchen(a)}
                disabled={laeuft}
              >
                <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{a.name}</div>
                <div style={{ color: "var(--blue-ink)", fontWeight: 600 }}>
                  {formatCents(a.price_cents)}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
