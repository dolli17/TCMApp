"use client";

import { useEffect } from "react";
import { aufKontowechselHoeren, meldetSichSelbstAb } from "@/lib/konto-kanal";
import { createClient } from "@/lib/supabase/client";

/** Wie oft nachgesehen wird, falls der Kanal nichts meldet (aelterer Browser). */
const TAKT_MS = 2_000;

/**
 * Meldet diesen Tab ab, sobald im selben Browser ein anderes Konto angemeldet
 * ist - oder gar keins mehr (siehe lib/konto-kanal.ts).
 *
 * kontoId ist das Konto, mit dem der Server diese Seite gerendert hat. Stimmt
 * es nicht mehr mit den Cookies ueberein, geht der Tab zur Anmeldung. Bewusst
 * ohne signOut: das wuerde das neue Konto abmelden, nicht das alte.
 */
export function KontoWaechter({ kontoId }: { kontoId: string }) {
  useEffect(() => {
    const supabase = createClient();
    let fertig = false;

    async function pruefen() {
      if (fertig) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const jetzt = session?.user.id ?? null;
      if (jetzt === kontoId || fertig || meldetSichSelbstAb()) return;
      fertig = true;
      window.location.replace(`/login?grund=${jetzt ? "anderes-konto" : "abgemeldet"}`);
    }

    const sichtbar = () => {
      if (document.visibilityState === "visible") void pruefen();
    };
    const aufhoeren = aufKontowechselHoeren(() => void pruefen());
    window.addEventListener("focus", sichtbar);
    document.addEventListener("visibilitychange", sichtbar);
    const takt = window.setInterval(() => void pruefen(), TAKT_MS);

    return () => {
      aufhoeren();
      window.removeEventListener("focus", sichtbar);
      document.removeEventListener("visibilitychange", sichtbar);
      window.clearInterval(takt);
    };
  }, [kontoId]);

  return null;
}
