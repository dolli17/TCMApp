import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { ladeOffeneSpiele, spieleMit } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

const TAG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "2-digit", month: "long", timeZone: "Europe/Berlin",
});
const UHR = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
});

/**
 * Wer noch jemanden zum Spielen sucht.
 *
 * Bei 300 Mitgliedern scheitern Partien nicht am Platz, sondern daran, dass
 * zwei Leute nichts voneinander wissen. Ein Tipp trägt ein — keine Anfrage,
 * keine Zusage, kein Rundruf in der Gruppe.
 */
export default function OffeneSpiele() {
  const { stil, farben } = useTheme();
  const [spiele, setSpiele] = useState<Awaited<ReturnType<typeof ladeOffeneSpiele>>>([]);
  const [laedt, setLaedt] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    setSpiele(await ladeOffeneSpiele());
  }, []);

  useEffect(() => {
    laden()
      .catch((f: Error) => setFehler(f.message))
      .finally(() => setLaedt(false));
  }, [laden]);

  async function mitspielen(id: string) {
    setLaeuft(true);
    const r = await spieleMit(id);
    setLaeuft(false);
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

      {spiele.length === 0 ? (
        <Text style={stil.leise}>
          Gerade sucht niemand Mitspieler. Wenn du selbst buchst, kannst du im Buchungsfenster
          „Mitspieler gesucht“ anhaken – dann steht deine Buchung hier.
        </Text>
      ) : (
        spiele.map((o) => {
          const von = new Date(o.starts_at);
          const bis = new Date(o.ends_at);

          return (
            <View key={o.booking_id} style={stil.karte}>
              <View style={stil.zeile}>
                <Text style={{ fontWeight: "600" }}>{o.court_name ?? "Platz"}</Text>
                <Text style={stil.zahl}>
                  {UHR.format(von)}–{UHR.format(bis)}
                </Text>
              </View>
              <Text style={stil.leise}>{TAG.format(von)}</Text>
              <Text style={stil.leise}>
                {o.type_name} · {o.owner_name ?? "unbekannt"}
                {o.players.length > 0 ? ` · mit ${o.players.join(", ")}` : ""}
              </Text>
              <Text style={[stil.leise, { color: farben.gold, fontWeight: "700" }]}>
                {o.frei === 1 ? "noch ein Platz frei" : `noch ${o.frei} Plätze frei`}
              </Text>

              {o.bin_dabei ? (
                <Text style={stil.leise}>Du bist dabei</Text>
              ) : (
                <Pressable
                  style={[stil.knopf, { marginTop: 8 }, laeuft && { opacity: 0.5 }]}
                  disabled={laeuft}
                  accessibilityRole="button"
                  onPress={() => mitspielen(o.booking_id)}
                >
                  <Text style={stil.knopfText}>Mitspielen</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
