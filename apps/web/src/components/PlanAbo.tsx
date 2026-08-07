"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Höchstens ein Neuladen pro Sekunde. */
const DROSSEL_MS = 1000;

/**
 * Hält den Belegungsplan aktuell, ohne dass jemand F5 drückt.
 *
 * Zwei Drosselungen, aus zwei verschiedenen Gründen:
 *
 * 1. **Zeitlich.** Ein Admin, der eine Serie mit sechzig Terminen anlegt, löst
 *    sechzig Ereignisse in wenigen Sekunden aus. Ohne Drossel wären das sechzig
 *    `router.refresh()` – jedes ein voller Server-Render.
 * 2. **Fachlich.** Es wird nur nachgeladen, wenn das Ereignis den angezeigten
 *    Tag betrifft. Wer den Montag ansieht, während jemand für Freitag bucht,
 *    soll keinen Hinweis bekommen.
 *
 * Der sichtbare Hinweis ist Absicht: ein Slot, der wortlos unter dem Finger
 * verschwindet, ist schlimmer als einer, der belegt ist.
 */
export function PlanAbo({ datum }: { datum: string }) {
  const router = useRouter();
  const [geaendert, setGeaendert] = useState(false);
  const letzte = useRef(0);
  const wartet = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    function auffrischen() {
      setGeaendert(true);

      const jetzt = Date.now();
      const rest = DROSSEL_MS - (jetzt - letzte.current);

      if (rest <= 0) {
        letzte.current = jetzt;
        router.refresh();
        return;
      }
      // Innerhalb der Drossel: einmal am Ende nachladen, nicht je Ereignis.
      if (wartet.current) return;
      wartet.current = setTimeout(() => {
        wartet.current = null;
        letzte.current = Date.now();
        router.refresh();
      }, rest);
    }

    const kanal = supabase
      .channel(`plan-${datum}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        (ereignis) => {
          // Der Filter läuft hier und nicht im Abo: der Zeitraum steckt in
          // einem tstzrange, und darauf kann Realtime nicht filtern.
          const zeile = (ereignis.new ?? ereignis.old) as { slot?: string } | null;
          const spanne = zeile?.slot;
          if (typeof spanne === "string" && !spanne.includes(datum)) {
            // Grobe Prüfung: der Bereichstext enthält beide Zeitstempel in
            // UTC. Ein Treffer auf das Datum reicht, um früh auszusteigen;
            // Grenzfälle um Mitternacht laden lieber einmal zu viel nach.
            const tagDavor = new Date(`${datum}T00:00:00Z`);
            tagDavor.setUTCDate(tagDavor.getUTCDate() - 1);
            if (!spanne.includes(tagDavor.toISOString().slice(0, 10))) return;
          }
          auffrischen();
        },
      )
      .subscribe();

    return () => {
      if (wartet.current) clearTimeout(wartet.current);
      void supabase.removeChannel(kanal);
    };
  }, [datum, router]);

  if (!geaendert) return null;

  return (
    <div className="hinweis" role="status">
      Der Plan wurde aktualisiert.{" "}
      <button type="button" className="knopf leise klein" onClick={() => setGeaendert(false)}>
        Verstanden
      </button>
    </div>
  );
}
