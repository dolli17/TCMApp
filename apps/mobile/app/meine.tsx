import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ladeMeineBuchungen, storniereBuchung, verlasseBuchung } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

const TAG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "2-digit", month: "long", timeZone: "Europe/Berlin",
});
const UHR = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
});

/**
 * Die eigenen Termine.
 *
 * Bis hierher steckte das als Abschnitt in einer langen Kontoseite, zwischen
 * Forderungen und Erscheinungsbild. Wer wissen will, wann er spielt, soll dafür
 * nicht an seinem Arbeitsdienst vorbeiscrollen.
 *
 * Der Unterschied zwischen "gebucht" und "eingetragen" bestimmt, was man tun
 * darf: der Bucher storniert die ganze Buchung, ein Mitspieler trägt nur sich
 * selbst aus.
 */
export default function MeineBuchungen() {
  const { stil, farben } = useTheme();
  const [buchungen, setBuchungen] = useState<Awaited<ReturnType<typeof ladeMeineBuchungen>>>([]);
  const [laedt, setLaedt] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [nachfrage, setNachfrage] = useState<string | null>(null);

  const laden = useCallback(async () => {
    setBuchungen(await ladeMeineBuchungen());
  }, []);

  useEffect(() => {
    laden()
      .catch((f: Error) => setFehler(f.message))
      .finally(() => setLaedt(false));
  }, [laden]);

  async function beenden(id: string, binBucher: boolean) {
    setLaeuft(true);
    const r = binBucher ? await storniereBuchung(id) : await verlasseBuchung(id);
    setLaeuft(false);
    setNachfrage(null);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await laden().catch(() => {});
  }

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
      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
      )}

      {buchungen.length === 0 ? (
        <Text style={stil.leise}>
          Für dich steht gerade nichts an. Im Belegungsplan findest du die freien Plätze.
        </Text>
      ) : (
        buchungen.map((b) => {
          const von = new Date(b.starts_at);
          const bis = new Date(b.ends_at);
          const gefragt = nachfrage === b.booking_id;

          return (
            <View key={b.booking_id} style={stil.karte}>
              <View style={stil.zeile}>
                <Text style={{ fontWeight: "600" }}>{b.court_name ?? "Platz"}</Text>
                <Text style={stil.zahl}>
                  {UHR.format(von)}–{UHR.format(bis)}
                </Text>
              </View>
              <Text style={stil.leise}>{TAG.format(von)}</Text>
              <Text style={stil.leise}>
                {b.kind === "blocking" ? (b.title ?? b.type_name) : b.type_name}
                {!b.bin_bucher && b.owner_name ? ` · gebucht von ${b.owner_name}` : ""}
                {b.players.length > 0 ? ` · mit ${b.players.join(", ")}` : ""}
              </Text>

              <Pressable
                style={[stil.knopfLeise, { marginTop: 8 }, laeuft && { opacity: 0.5 }]}
                disabled={laeuft}
                accessibilityRole="button"
                onPress={() =>
                  gefragt ? beenden(b.booking_id, b.bin_bucher) : setNachfrage(b.booking_id)
                }
              >
                <Text style={[stil.knopfLeiseText, { color: farben.red }]}>
                  {gefragt
                    ? b.bin_bucher ? "Wirklich stornieren" : "Wirklich austragen"
                    : b.bin_bucher ? "Stornieren" : "Austragen"}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
