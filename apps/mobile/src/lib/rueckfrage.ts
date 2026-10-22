/**
 * Rueckfrage vor einer folgenreichen Aktion: der native Dialog.
 *
 * Alert.alert ist in react-native-web ein leerer Aufruf - im Browser (der
 * Web-Vorschau der App) erschiene keine Rueckfrage, und die Aktion liesse
 * sich nie ausloesen. Dort springt window.confirm ein.
 *
 * Lag bisher in components/verwaltung/Formular.tsx; jetzt braucht ihn auch
 * das Abmelden im Konto.
 */

import { Alert, Platform } from "react-native";

export function bestaetige(
  titel: string,
  text: string,
  ja: string,
  aktion: () => void,
  gefaehrlich = true,
): void {
  if (Platform.OS === "web") {
    const frage = text ? `${titel}\n\n${text}` : titel;
    if (typeof window !== "undefined" && window.confirm(frage)) aktion();
    return;
  }
  Alert.alert(titel, text || undefined, [
    { text: "Abbrechen", style: "cancel" },
    { text: ja, style: gefaehrlich ? "destructive" : "default", onPress: aktion },
  ]);
}
