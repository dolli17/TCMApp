"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  veranstaltungAbsagen, veranstaltungLoeschen, veranstaltungVeroeffentlichen,
} from "@/app/admin/veranstaltungen/aktionen";

/**
 * Die Knöpfe im Kopf einer Veranstaltung: Bearbeiten, Liste exportieren,
 * Veröffentlichen, Absagen, Löschen. Absagen und Löschen fragen einmal nach -
 * im Knopf selbst, nicht in einem Browser-Dialog.
 */
export function VeranstaltungsAktionen({
  id, status, loeschbar, mitAnmeldung,
}: {
  id: string;
  status: "draft" | "published" | "cancelled";
  /** Entwurf ohne Anmeldungen */
  loeschbar: boolean;
  mitAnmeldung: boolean;
}) {
  const router = useRouter();
  const [frage, setFrage] = useState<"absagen" | "loeschen" | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [laeuft, starte] = useTransition();

  function tue(was: "veroeffentlichen" | "absagen" | "loeschen") {
    starte(async () => {
      const e = was === "veroeffentlichen"
        ? await veranstaltungVeroeffentlichen(id)
        : was === "absagen" ? await veranstaltungAbsagen(id) : await veranstaltungLoeschen(id);
      setFrage(null);
      setMeldung({ ok: e.ok, text: e.meldung });
      if (e.ok && was === "loeschen") router.push("/admin/veranstaltungen");
      else router.refresh();
    });
  }

  return (
    <div className="veranstaltung-aktionen">
      <div className="knopfreihe">
        {status !== "cancelled" && (
          <Link className="knopf leise" href={`/admin/veranstaltungen/${id}/bearbeiten`}>Bearbeiten</Link>
        )}
        {mitAnmeldung && (
          <a className="knopf leise" href={`/admin/veranstaltungen/${id}/export`} download>Liste exportieren</a>
        )}
        {status === "draft" && (
          <button type="button" className="knopf gold" disabled={laeuft} onClick={() => tue("veroeffentlichen")}>
            Veröffentlichen
          </button>
        )}
        {status === "published" && frage !== "absagen" && (
          <button type="button" className="knopf leise" disabled={laeuft} onClick={() => setFrage("absagen")}>
            Absagen
          </button>
        )}
        {loeschbar && frage !== "loeschen" && (
          <button type="button" className="knopf gefahr-leise" disabled={laeuft} onClick={() => setFrage("loeschen")}>
            Löschen
          </button>
        )}
      </div>
      {frage && (
        <div className="hinweis rueckfrage" role="group" aria-label="Rückfrage">
          <span>
            {frage === "absagen"
              ? "Absagen? Offene Forderungen werden gelöscht; was schon in einem Einzug steckt, bleibt stehen."
              : "Den Entwurf endgültig löschen?"}
          </span>
          <span className="knopfreihe">
            <button type="button" className="knopf gefahr klein" disabled={laeuft} onClick={() => tue(frage)}>
              {frage === "absagen" ? "Ja, absagen" : "Ja, löschen"}
            </button>
            <button type="button" className="knopf leise klein" disabled={laeuft} onClick={() => setFrage(null)}>
              Abbrechen
            </button>
          </span>
        </div>
      )}
      {meldung && (
        <div className={`hinweis ${meldung.ok ? "erfolg" : "fehler"}`} role="status">{meldung.text}</div>
      )}
    </div>
  );
}
