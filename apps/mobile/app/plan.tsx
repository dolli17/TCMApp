import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { ladeKontingent, ladePlaetze, ladeTagesplan, storniereBuchung } from "@/lib/daten";

const heuteInBerlin = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

function verschiebe(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j!, (m ?? 1) - 1, t));
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function lesbar(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long" })
    .format(new Date(j!, (m ?? 1) - 1, t));
}

const uhrzeit = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
  }).format(new Date(iso));

/**
 * Auf dem Telefon ist ein Raster mit acht Spalten unbrauchbar. Deshalb je
 * Platz eine Karte mit den Belegungen darunter - einhaendig bedienbar. Die
 * Web-App zeigt unter 768 Pixel dieselbe Form.
 */
export default function Plan() {
  const { stil, farben } = useTheme();
  const [datum, setDatum] = useState(heuteInBerlin());
  const [plaetze, setPlaetze] = useState<Awaited<ReturnType<typeof ladePlaetze>>>([]);
  const [belegung, setBelegung] = useState<Awaited<ReturnType<typeof ladeTagesplan>>>([]);
  const [kontingent, setKontingent] = useState({ used: 0, allowed: 0 });
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async (tag: string) => {
    setLaedt(true);
    const [p, b, k] = await Promise.all([ladePlaetze(), ladeTagesplan(tag), ladeKontingent()]);
    setPlaetze(p); setBelegung(b); setKontingent(k); setLaedt(false);
  }, []);

  useEffect(() => {
    laden(datum).catch((f: Error) => {
      setMeldung({ ok: false, text: f.message });
      setLaedt(false);
    });
  }, [datum, laden]);

  async function stornieren(id: string) {
    const r = await storniereBuchung(id);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await laden(datum);
  }

  return (
    <ScrollView style={stil.seite} contentContainerStyle={stil.inhalt}>
      <View style={stil.hero}>
        <Text style={stil.heroKicker}>Freiplätze</Text>
        <Text style={stil.heroTitel}>{lesbar(datum)}</Text>
        <View style={stil.heroPillen}>
          <View style={stil.heroPille}>
            <Text style={stil.heroPilleWert}>
              {kontingent.used} / {kontingent.allowed}
            </Text>
            <Text style={stil.heroPilleLabel}>Buchungen offen</Text>
          </View>
          <View style={stil.heroPille}>
            <Text style={stil.heroPilleWert}>{plaetze.length}</Text>
            <Text style={stil.heroPilleLabel}>Plätze</Text>
          </View>
        </View>
      </View>

      <View style={stil.zeile}>
        <Pressable style={stil.knopfLeise} onPress={() => setDatum(verschiebe(datum, -1))}
          accessibilityRole="button" accessibilityLabel="Vortag">
          <Text style={stil.knopfLeiseText}>‹ Vortag</Text>
        </Pressable>
        <Pressable style={stil.knopfLeise} onPress={() => setDatum(verschiebe(datum, 1))}
          accessibilityRole="button" accessibilityLabel="Folgetag">
          <Text style={stil.knopfLeiseText}>Folgetag ›</Text>
        </Pressable>
      </View>

      <Text style={stil.leise}>
        Buchungen, bei denen du als Mitspieler eingetragen bist, zählen mit.
      </Text>

      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
      )}

      {laedt ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={farben.blue} />
      ) : (
        plaetze.map((platz) => {
          const eintraege = belegung
            .filter((b) => b.court_id === platz.id)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

          return (
            <View key={platz.id} style={stil.karte}>
              <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 18, color: farben.ink }}>
                {platz.name}
              </Text>

              {eintraege.length === 0 ? (
                <Text style={stil.leise}>ganztägig frei</Text>
              ) : (
                eintraege.map((b) => (
                  <View
                    key={b.booking_id}
                    style={[
                      stil.belegzeile,
                      b.is_own && stil.belegzeileEigen,
                      b.kind === "blocking" && stil.belegzeileBlockung,
                    ]}
                  >
                    <Text style={stil.text}>
                      <Text style={stil.zahl}>{uhrzeit(b.starts_at)}–{uhrzeit(b.ends_at)}</Text>
                      {"  "}
                      {b.kind === "blocking" ? b.title : b.owner_name}
                    </Text>
                    {b.players.length > 0 && (
                      <Text style={stil.leise}>mit {b.players.join(", ")}</Text>
                    )}
                    {b.is_own && (
                      <Pressable onPress={() => stornieren(b.booking_id)} accessibilityRole="button">
                        <Text style={{ color: farben.red, marginTop: 4 }}>Stornieren</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
