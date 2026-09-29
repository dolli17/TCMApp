"use client";

import { useState } from "react";
import { AntragsFenster, type Antrag, type Beitragsart } from "@/components/AntragsFenster";
import { Listenzeile, type HinweisTon } from "@/components/Listenzeile";

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
      <ul className="liste-gruppe" aria-label="Anträge">
        {antraege.map((a) => {
          const neu = a.status === "new";
          const zeile = {
            avatar: { kurz: (a.first_name[0] ?? "") + (a.last_name[0] ?? ""), id: a.id },
            titel: `${a.last_name}, ${a.first_name}`,
            kontext: `${datum(a.submitted_at)} · ${a.email}`,
            hinweis: a.possible_duplicate && neu ? "Dublette?" : STATUS_TEXT[a.status] ?? a.status,
            hinweisTon: (a.possible_duplicate && neu
              ? "rot"
              : neu ? "gold" : a.status === "accepted" ? "gruen" : "leise") as HinweisTon,
          };
          return (
            <li key={a.id}>
              {/* Nur offene Anträge öffnen das Blatt; erledigte stehen zur Ansicht da */}
              <Listenzeile {...zeile} onClick={neu ? () => setOffen(a) : undefined} />
            </li>
          );
        })}
      </ul>

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
