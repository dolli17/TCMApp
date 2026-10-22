"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { aktivitaetVergessen } from "@/lib/inaktivitaet";
import { abmeldungInDiesemTab, kontoGewechselt } from "@/lib/konto-kanal";
import { createClient } from "@/lib/supabase/client";

/**
 * Abmelden. Als Knopf mit Rückfrage in der Nutzerkarte der Seitenleiste; mit alsZeile als
 * rote Zeile in der letzten Gruppe der Konto-Seite (Entwurf AppKonto); mit
 * alsText als kleiner Knopf, etwa im Rahmen des Onboardings.
 */
export function AbmeldeKnopf({
  alsZeile = false,
  alsText = false,
}: { alsZeile?: boolean; alsText?: boolean } = {}) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);
  const [frage, setFrage] = useState(false);

  async function abmelden() {
    setLaeuft(true);
    abmeldungInDiesemTab();
    await createClient().auth.signOut();
    aktivitaetVergessen();
    kontoGewechselt();
    router.push("/login");
    router.refresh();
  }

  if (alsZeile) {
    return (
      <button type="button" className="gruppen-zeile rot" onClick={abmelden} disabled={laeuft}>
        {laeuft ? "Wird abgemeldet…" : "Abmelden"}
      </button>
    );
  }

  if (alsText) {
    return (
      <button type="button" className="knopf leise klein" onClick={abmelden} disabled={laeuft}>
        {laeuft ? "Wird abgemeldet…" : "Abmelden"}
      </button>
    );
  }

  // In der Nutzerkarte der Seitenleiste mit Text und kurzer Rueckfrage: der
  // Knopf sitzt direkt unter dem Namen, ein Fehlklick soll niemanden abmelden.
  if (frage) {
    return (
      <div className="abmelden-frage" role="group" aria-labelledby="abmelden-frage">
        <p id="abmelden-frage">Wirklich abmelden?</p>
        <button type="button" className="knopf gefahr klein" onClick={abmelden} disabled={laeuft} autoFocus>
          {laeuft ? "Wird abgemeldet…" : "Abmelden"}
        </button>
        <button type="button" className="knopf leise klein" onClick={() => setFrage(false)} disabled={laeuft}>
          Abbrechen
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="abmelden" onClick={() => setFrage(true)}>
      <svg viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
        <path
          d="M15 12H3M7 8l-4 4 4 4M13 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6"
          strokeWidth="1.9"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Abmelden
    </button>
  );
}
