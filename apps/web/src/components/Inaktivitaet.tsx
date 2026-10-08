"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  aktivitaetLesen,
  aktivitaetMerken,
  aktivitaetVergessen,
  istAbgelaufen,
} from "@/lib/inaktivitaet";

/** Wie oft gemerkt bzw. geprueft wird - auf die halbe Minute genau reicht. */
const TAKT_MS = 30_000;

const AKTIVITAET = ["pointerdown", "keydown", "wheel", "touchstart", "scroll", "mousemove"];

/**
 * Meldet nach 30 Minuten ohne Aktivitaet ab (siehe lib/inaktivitaet.ts).
 *
 * Haengt nur im Layout fuer Mitglieder - der Kiosk bleibt angemeldet. Ohne
 * Vorwarnung; die Loginseite sagt danach, warum.
 */
export function Inaktivitaet() {
  useEffect(() => {
    let zuletztGemerkt = 0;
    let fertig = false;

    function merken() {
      const jetzt = Date.now();
      if (jetzt - zuletztGemerkt < TAKT_MS) return;
      zuletztGemerkt = jetzt;
      aktivitaetMerken(jetzt);
    }

    async function pruefen() {
      if (fertig || !istAbgelaufen(aktivitaetLesen(), Date.now())) return;
      fertig = true;
      // Nur dieser Browser - die App auf dem Telefon bleibt angemeldet.
      await createClient().auth.signOut({ scope: "local" });
      aktivitaetVergessen();
      // Voller Seitenwechsel statt router.push: nichts von der Sitzung bleibt
      // im Speicher des Tabs.
      window.location.replace("/login?grund=inaktiv");
    }

    // Erst pruefen, dann merken: wer nach Stunden zurueckkommt, soll nicht
    // durch das Oeffnen selbst wieder als aktiv gelten.
    void pruefen().then(() => {
      if (!fertig) merken();
    });

    for (const e of AKTIVITAET) window.addEventListener(e, merken, { passive: true });
    window.addEventListener("focus", pruefen);
    document.addEventListener("visibilitychange", pruefen);
    const takt = window.setInterval(pruefen, TAKT_MS);

    return () => {
      for (const e of AKTIVITAET) window.removeEventListener(e, merken);
      window.removeEventListener("focus", pruefen);
      document.removeEventListener("visibilitychange", pruefen);
      window.clearInterval(takt);
    };
  }, []);

  return null;
}
