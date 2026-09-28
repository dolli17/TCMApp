import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { Bildschirm } from "@/components/Bildschirm";
import { AlleGelesenKnopf, NachrichtenListe } from "@/components/NachrichtenListe";
import { ladeBenachrichtigungen, markiereBenachrichtigungenGelesen } from "@/lib/daten";
import { useLaden } from "@/lib/laden";

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
 *
 * Die Liste selbst ist dieselbe wie im Blatt hinter der Glocke
 * (NachrichtenListe); "Alle als gelesen" nimmt die Hervorhebung weg.
 */
export default function Nachrichten() {
  const schonAbgehakt = useRef(false);
  const [alleGesehen, setAlleGesehen] = useState(false);

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
      {!alleGesehen && nachrichten.some((n) => n.read_at === null) && (
        <View style={{ alignItems: "flex-end", marginBottom: -8 }}>
          <AlleGelesenKnopf onPress={() => setAlleGesehen(true)} />
        </View>
      )}
      <NachrichtenListe liste={nachrichten} alleGesehen={alleGesehen} />
    </Bildschirm>
  );
}
