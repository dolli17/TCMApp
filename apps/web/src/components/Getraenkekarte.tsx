"use client";

import { useState, useTransition } from "react";
import { canVoidSelf, formatCents } from "@tcm/core";
import { getraenkBuchen, getraenkStornieren } from "@/app/getraenke/aktionen";

interface Artikel {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
}

interface Buchung {
  id: string;
  item_name: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number | null;
  source: string;
  created_at: string;
  voided_at: string | null;
}

export function Getraenkekarte({
  artikel,
  buchungen,
  stornoFensterMinuten,
}: {
  artikel: Artikel[];
  buchungen: Buchung[];
  stornoFensterMinuten: number;
}) {
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  function buchen(id: string) {
    starte(async () => {
      const r = await getraenkBuchen(id, 1);
      setMeldung({ ok: r.ok, text: r.meldung });
    });
  }

  function zuruecknehmen(id: string) {
    starte(async () => {
      const r = await getraenkStornieren(id);
      setMeldung({ ok: r.ok, text: r.meldung });
    });
  }

  return (
    <>
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`}>{meldung.text}</div>
      )}

      <h2>Karte</h2>
      <div className="kachel-reihe">
        {artikel.map((a) => (
          <button
            key={a.id}
            className="kachel"
            style={{ textAlign: "left", cursor: "pointer", font: "inherit" }}
            onClick={() => buchen(a.id)}
            disabled={laeuft}
          >
            <div style={{ fontWeight: 600 }}>{a.name}</div>
            {a.description && <div className="titel">{a.description}</div>}
            <div style={{ marginTop: "0.4rem", color: "var(--sand-dunkel)", fontWeight: 600 }}>
              {formatCents(a.price_cents)}
            </div>
          </button>
        ))}
      </div>

      <h2>Dieser Monat</h2>
      {buchungen.length === 0 ? (
        <p className="leer">Noch nichts entnommen.</p>
      ) : (
        <table className="liste">
          <thead>
            <tr>
              <th>Zeitpunkt</th>
              <th>Artikel</th>
              <th className="zahl">Menge</th>
              <th className="zahl">Betrag</th>
              <th>Erfasst</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {buchungen.map((b) => {
              const storniert = Boolean(b.voided_at);
              const stornierbar =
                !storniert &&
                canVoidSelf(
                  {
                    id: b.id,
                    memberId: "",
                    drinkItemId: "",
                    quantity: b.quantity,
                    unitPriceCents: b.unit_price_cents,
                    createdAt: b.created_at,
                    voidedAt: b.voided_at,
                  },
                  stornoFensterMinuten,
                );

              return (
                <tr key={b.id} style={storniert ? { opacity: 0.45 } : undefined}>
                  <td>
                    {new Intl.DateTimeFormat("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Europe/Berlin",
                    }).format(new Date(b.created_at))}
                  </td>
                  <td>
                    {b.item_name}
                    {storniert && <span className="marke-klein"> storniert</span>}
                  </td>
                  <td className="zahl">{b.quantity}</td>
                  <td className="zahl">{formatCents(b.total_cents ?? 0)}</td>
                  <td>
                    <span className="marke-klein">
                      {b.source === "kiosk" ? "Theke" : b.source === "bar_duty" ? "Thekendienst" : "App"}
                    </span>
                  </td>
                  <td>
                    {stornierbar && (
                      <button
                        className="knopf leise"
                        onClick={() => zuruecknehmen(b.id)}
                        disabled={laeuft}
                      >
                        Zurücknehmen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p style={{ color: "var(--text-leise)", fontSize: "0.85rem" }}>
        Eigene Fehlbuchungen können {stornoFensterMinuten} Minuten lang zurückgenommen werden.
        Danach hilft der Vorstand weiter.
      </p>
    </>
  );
}
