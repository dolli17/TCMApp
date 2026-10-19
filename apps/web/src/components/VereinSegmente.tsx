"use client";

import Link from "next/link";
import { useEffect } from "react";
import { VEREIN_REITER_COOKIE, type VereinReiter } from "@/lib/verein";

/**
 * Kopf des Bereichs "Verein" mit den Reitern Getränke | Veranstaltungen
 * (Entwurf WebVerein). Echte Seiten mit eigener Adresse, wie PlanSegmente.
 *
 * Merkt sich den Reiter, auf dem man steht: /verein führt beim nächsten Mal
 * wieder hierher.
 */
export function VereinSegmente({ aktiv }: { aktiv: VereinReiter }) {
  useEffect(() => {
    document.cookie = `${VEREIN_REITER_COOKIE}=${aktiv}; path=/; max-age=31536000; samesite=lax`;
  }, [aktiv]);

  return (
    <>
      <header className="plan-kopf">
        <div>
          <h1 className="pagetitle">Verein</h1>
        </div>
      </header>
      <nav className="segtoggle plan-segmente" aria-label="Bereich">
        <Link href="/verein/getraenke" aria-current={aktiv === "getraenke" ? "page" : undefined}>
          Getränke
        </Link>
        <Link href="/verein/veranstaltungen" aria-current={aktiv === "veranstaltungen" ? "page" : undefined}>
          Veranstaltungen
        </Link>
      </nav>
    </>
  );
}
