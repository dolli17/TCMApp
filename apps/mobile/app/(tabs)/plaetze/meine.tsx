import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Bildschirm } from "@/components/Bildschirm";
import { ladeMeineBuchungen, storniereBuchung, verlasseBuchung } from "@/lib/daten";
import { useLaden } from "@/lib/laden";
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
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [nachfrage, setNachfrage] = useState<string | null>(null);

  const laden = useCallback(() => ladeMeineBuchungen(), []);
  const zustand = useLaden(laden);
  const buchungen = zustand.daten ?? [];

  async function beenden(id: string, binBucher: boolean) {
    setLaeuft(true);
    const r = binBucher ? await storniereBuchung(id) : await verlasseBuchung(id);
    setLaeuft(false);
    setNachfrage(null);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await zustand.erneutHolen();
  }

  return (
    <Bildschirm
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
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
                <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold" }]}>
                  {b.court_name ?? "Platz"}
                </Text>
                <Text style={[stil.text, stil.zahl]}>
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
    </Bildschirm>
  );
}
