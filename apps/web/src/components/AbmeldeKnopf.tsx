"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { aktivitaetVergessen } from "@/lib/inaktivitaet";
import { createClient } from "@/lib/supabase/client";

/**
 * Abmelden. Als Symbol in der Nutzerkarte der Seitenleiste; mit alsZeile als
 * rote Zeile in der letzten Gruppe der Konto-Seite (Entwurf AppKonto).
 */
export function AbmeldeKnopf({ alsZeile = false }: { alsZeile?: boolean } = {}) {
  const router = useRouter();
  const [laeuft, setLaeuft] = useState(false);

  async function abmelden() {
    setLaeuft(true);
    await createClient().auth.signOut();
    aktivitaetVergessen();
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

  // Nur ein Symbol in der Nutzerkarte der Seitenleiste; der Name fuer
  // Screenreader kommt aus aria-label, der Tooltip aus title.
  return (
    <button
      type="button"
      className="abmelden"
      onClick={abmelden}
      disabled={laeuft}
      aria-label="Abmelden"
      title="Abmelden"
    >
      <svg viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true" focusable="false">
        <path
          d="M15 12H3M7 8l-4 4 4 4M13 4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-6"
          strokeWidth="1.9"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
