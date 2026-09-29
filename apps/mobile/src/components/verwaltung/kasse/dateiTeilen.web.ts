/**
 * Die Lastschriftdatei im Browser: statt des Teilen-Blatts ein gewoehnlicher
 * Download ueber einen Blob. Die Datei kommt wie auf dem Telefon mit der
 * Sitzung aus dem Bucket, nie ueber eine signierte URL.
 */

import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { ladeLastschriftdatei } from "@/lib/verwaltung/kasse";

export async function teileLastschriftdatei(storagePfad: string | null): Promise<Ergebnis> {
  const datei = await ladeLastschriftdatei(storagePfad);
  if (!datei.ok || !datei.daten) return { ok: false, meldung: datei.meldung };

  const doc = (globalThis as { document?: Document }).document;
  if (!doc || typeof URL.createObjectURL !== "function") {
    return { ok: false, meldung: "In diesem Browser lässt sich die Datei nicht herunterladen." };
  }
  const blob = new Blob([datei.daten.xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = datei.daten.name;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, meldung: `${datei.daten.name} wird heruntergeladen.` };
}
