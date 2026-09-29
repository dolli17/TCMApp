/**
 * Die Lastschriftdatei aufs Telefon holen und weitergeben (iOS/Android).
 *
 * Im Web laedt ein Route Handler die Datei herunter; hier gibt es keinen
 * Browser-Download. Die Datei wird mit der Sitzung des Admins aus dem Bucket
 * geladen (ladeLastschriftdatei), in den Cache der App geschrieben und ueber
 * das Teilen-Blatt weitergereicht - in die Banking-App, in Dateien oder per
 * Mail an den Kassenwart. Keine signierte URL: die waere fuer ihre Laufzeit
 * fuer jeden nutzbar, der sie hat.
 *
 * Die Web-Fassung steht in dateiTeilen.web.ts (Metro waehlt sie selbst).
 */

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { ladeLastschriftdatei } from "@/lib/verwaltung/kasse";

export async function teileLastschriftdatei(storagePfad: string | null): Promise<Ergebnis> {
  const datei = await ladeLastschriftdatei(storagePfad);
  if (!datei.ok || !datei.daten) return { ok: false, meldung: datei.meldung };

  if (!FileSystem.cacheDirectory) return { ok: false, meldung: "Die Datei ließ sich nicht speichern." };
  const ziel = `${FileSystem.cacheDirectory}${datei.daten.name}`;
  try {
    await FileSystem.writeAsStringAsync(ziel, datei.daten.xml, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    return { ok: false, meldung: "Die Datei ließ sich nicht speichern." };
  }

  if (!(await Sharing.isAvailableAsync())) {
    return { ok: false, meldung: "Auf diesem Gerät lässt sich die Datei nicht teilen." };
  }
  try {
    await Sharing.shareAsync(ziel, {
      mimeType: "application/xml",
      UTI: "public.xml",
      dialogTitle: datei.daten.name,
    });
  } catch {
    return { ok: false, meldung: "Die Datei ließ sich nicht teilen." };
  } finally {
    // Eine Datei mit Bankverbindungen bleibt nicht im Cache liegen. Nur auf
    // iOS: dort ist das Teilen-Blatt beim Aufloesen zu und die Datei kopiert.
    // Android meldet sich frueher zurueck, die Ziel-App liest womoeglich
    // noch - dort ueberschreibt der naechste Abruf sie, den Rest raeumt das
    // System mit dem Cache ab.
    if (Platform.OS === "ios") {
      void FileSystem.deleteAsync(ziel, { idempotent: true }).catch(() => undefined);
    }
  }
  return { ok: true, meldung: `${datei.daten.name} ist bereit.` };
}
