import { useCallback, useRef } from "react";
import { Text, View } from "react-native";
import { Bildschirm } from "@/components/Bildschirm";
import { ladeBenachrichtigungen, markiereBenachrichtigungenGelesen } from "@/lib/daten";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";

const ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/**
 * Was sich an den eigenen Buchungen geändert hat.
 *
 * Zwei Dinge sind hier anders als in einer gewöhnlichen Liste:
 *
 * Erstens werden die Nachrichten erst beim Öffnen *dieses* Bildschirms als
 * gelesen markiert, nicht beim Öffnen des Kontos. Vorher verlor jemand seinen
 * Ungelesen-Stand, weil er seine Forderungen nachsehen wollte.
 *
 * Zweitens bleibt der ungelesene Zustand beim ersten Anzeigen sichtbar: erst
 * wird gerendert, dann abgehakt. Beim Herunterziehen unterbleibt das Abhaken
 * ganz - wer die Liste bewusst neu lädt, will sehen, was inzwischen kam, und
 * nicht dabei zusehen, wie die Hervorhebung ein zweites Mal verschwindet.
 */
export default function Nachrichten() {
  const { stil, farben } = useTheme();
  const schonAbgehakt = useRef(false);

  const laden = useCallback(async () => {
    const liste = await ladeBenachrichtigungen();

    if (!schonAbgehakt.current && liste.some((n) => n.read_at === null)) {
      schonAbgehakt.current = true;
      // Ohne await: die Liste soll sofort stehen, das Abhaken darf nachlaufen.
      void markiereBenachrichtigungenGelesen().catch(() => {});
    }

    return liste;
  }, []);

  const zustand = useLaden(laden);
  const nachrichten = zustand.daten ?? [];

  return (
    <Bildschirm
      ohneFussleiste
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
      {nachrichten.length === 0 ? (
        <Text style={stil.leise}>Es liegt nichts vor.</Text>
      ) : (
        nachrichten.map((n) => (
          <View
            key={n.id}
            style={[
              stil.karte,
              n.read_at === null && { borderColor: farben.blue, borderWidth: 1.5 },
            ]}
          >
            <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold" }]}>{n.title}</Text>
            <Text style={stil.leise}>{n.body}</Text>
            <Text style={stil.leise}>{ZEIT.format(new Date(n.created_at))} Uhr</Text>
          </View>
        ))
      )}
    </Bildschirm>
  );
}
