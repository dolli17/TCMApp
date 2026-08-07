import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { ladeBenachrichtigungen, markiereBenachrichtigungenGelesen } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

const ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});

/**
 * Was sich an den eigenen Buchungen geändert hat.
 *
 * Zwei Dinge sind hier anders als vorher in der Kontoseite:
 *
 * Erstens werden die Nachrichten erst beim Öffnen *dieses* Bildschirms als
 * gelesen markiert, nicht beim Öffnen des Kontos. Vorher verlor jemand seinen
 * Ungelesen-Stand, weil er seine Forderungen nachsehen wollte.
 *
 * Zweitens bleibt der ungelesene Zustand beim ersten Anzeigen sichtbar: der
 * Stand wird beim Laden festgehalten und erst beim nächsten Aufruf verworfen.
 * Ohne das markiert die Seite still als gelesen, was sie nie hervorgehoben hat.
 */
export default function Nachrichten() {
  const { stil, farben } = useTheme();
  const [nachrichten, setNachrichten] =
    useState<Awaited<ReturnType<typeof ladeBenachrichtigungen>>>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let abgebrochen = false;

    ladeBenachrichtigungen()
      .then(async (liste) => {
        if (abgebrochen) return;
        // Erst anzeigen, dann abhaken - in dieser Reihenfolge, damit die
        // Hervorhebung überhaupt einmal zu sehen war.
        setNachrichten(liste);
        if (liste.some((n) => n.read_at === null)) {
          await markiereBenachrichtigungenGelesen().catch(() => {});
        }
      })
      .catch((f: Error) => setFehler(f.message))
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });

    return () => {
      abgebrochen = true;
    };
  }, []);

  if (laedt) {
    return (
      <View style={[stil.seite, { justifyContent: "center" }]}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }

  return (
    <ScrollView style={stil.seite} contentContainerStyle={stil.inhalt}>
      {fehler && <Text style={stil.hinweisFehler}>{fehler}</Text>}

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
            <Text style={{ fontWeight: "600" }}>{n.title}</Text>
            <Text style={stil.leise}>{n.body}</Text>
            <Text style={stil.leise}>{ZEIT.format(new Date(n.created_at))} Uhr</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
