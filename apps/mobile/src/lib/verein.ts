/**
 * Der Tab "Verein": Getraenke und Veranstaltungen als zwei Reiter
 *
 * Wer den Tab oeffnet, landet auf dem zuletzt gewaehlten Reiter, beim ersten
 * Mal auf den Getraenken. Die Wahl liegt in AsyncStorage wie das Theme.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export type VereinReiter = "/verein/getraenke" | "/verein/veranstaltungen";

const SPEICHER = "tcm-verein-reiter";

export async function letzterVereinReiter(): Promise<VereinReiter> {
  try {
    const w = await AsyncStorage.getItem(SPEICHER);
    return w === "/verein/veranstaltungen" ? w : "/verein/getraenke";
  } catch {
    return "/verein/getraenke";
  }
}

export function merkeVereinReiter(reiter: VereinReiter): void {
  void AsyncStorage.setItem(SPEICHER, reiter).catch(() => undefined);
}
