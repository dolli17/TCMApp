/**
 * Haptik (U78)
 *
 * Ein kurzer Stoss bestaetigt, was man nicht ansieht: Buchen, Eintragen, das
 * "+" an einem Getraenk - und ein deutlicher, wenn etwas scheitert. Auf dem
 * Web gibt es nichts zu fuehlen, dort bleibt jeder Aufruf stumm.
 *
 * expo-haptics ist ein natives Modul. In einem Build ohne das Modul (alte
 * Installation) wirft jeder Aufruf - das faengt diese Datei ab, die Haptik
 * fehlt dann einfach.
 */

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

function still(aufruf: () => Promise<void>) {
  if (Platform.OS === "web") return;
  try {
    void aufruf().catch(() => {});
  } catch {
    // ohne natives Modul: keine Haptik
  }
}

export const haptik = {
  /** Etwas Kleines hat sich geaendert, etwa ein Stueck mehr im Korb. */
  tippen: () => still(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Gebucht, eingetragen, gespeichert. */
  erfolg: () => still(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Die Datenbank hat abgelehnt. */
  fehler: () => still(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
