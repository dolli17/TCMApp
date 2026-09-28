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
    return <p className="leer-klein">Keine Anträge in dieser Ansicht.</p>;
  }

  return (
    <>
      <div className="karte tabellenkarte">
        <table className="liste">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Eingegangen</th>
              <th scope="col">Stand</th>
              <th scope="col"><span className="sr-only">Aktion</span></th>
            </tr>
          </thead>
          <tbody>
            {antraege.map((a) => (
              <tr key={a.id}>
                <td>
                  <div className="person">
                    <span className={`avatar ton-${a.id.charCodeAt(0) % 4}`} aria-hidden="true">
                      {(a.first_name[0] ?? "") + (a.last_name[0] ?? "")}
                    </span>
                    <div>
                      <b>
                        {a.last_name}, {a.first_name}
                      </b>
                      <small>{a.email}</small>
                      {a.possible_duplicate && (
                        <span className="marken-zeile">
                          <span className="statusmarke rot" title="Diese Adresse gehört bereits zu einem Mitglied">
                            Dublette?
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td data-label="Eingegangen" className="leiser">{datum(a.submitted_at)}</td>
                <td data-label="Stand">
                  <span className={`statusmarke ${a.status === "new" ? "gelb" : a.status === "accepted" ? "gruen" : ""}`}>
                    {STATUS_TEXT[a.status] ?? a.status}
                  </span>
                </td>
                <td className="aktion">
                  {a.status === "new" && (
                    <button className="knopf leise klein" onClick={() => setOffen(a)}>
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
