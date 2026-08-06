"use client";

import { useState } from "react";
import { AntragsFenster, type Antrag, type Beitragsart } from "@/components/AntragsFenster";

const STATUS_TEXT: Record<string, string> = {
  new: "offen",
  accepted: "aufgenommen",
  declined: "abgelehnt",
  spam: "Spam",
};

function datum(wert: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(wert),
  );
}

/**
 * Die Liste der Anträge, mit dem Fenster darüber.
 *
 * Eigene Client-Komponente, damit die Seite selbst eine Server-Komponente
 * bleiben kann – nur die Auswahl des offenen Antrags braucht Zustand.
 */
export function AntragsListe({
  antraege,
  beitragsarten,
}: {
  antraege: Antrag[];
  beitragsarten: Beitragsart[];
}) {
  const [offen, setOffen] = useState<Antrag | null>(null);

  if (antraege.length === 0) {
    return <p className="leer">Keine Anträge in dieser Ansicht.</p>;
  }

  return (
    <>
      <div className="tabellenhuelle">
        <table className="liste">
          <thead>
            <tr>
              <th>Eingegangen</th>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {antraege.map((a) => (
              <tr key={a.id}>
                <td style={{ whiteSpace: "nowrap" }}>{datum(a.submitted_at)}</td>
                <td>
                  {a.last_name}, {a.first_name}
                  {a.possible_duplicate && (
                    <span className="marke-klein rot" title="Diese Adresse gehört bereits zu einem Mitglied">
                      Dublette?
                    </span>
                  )}
                </td>
                <td>{a.email}</td>
                <td>
                  <span
                    className={`marke-klein ${
                      a.status === "new" ? "" : a.status === "accepted" ? "gruen" : "grau"
                    }`}
                  >
                    {STATUS_TEXT[a.status] ?? a.status}
                  </span>
                </td>
                <td>
                  {a.status === "new" && (
                    <button className="knopf klein" onClick={() => setOffen(a)}>
                      Ansehen
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {offen && (
        <AntragsFenster
          antrag={offen}
          beitragsarten={beitragsarten}
          onSchliessen={() => setOffen(null)}
        />
      )}
    </>
  );
}
