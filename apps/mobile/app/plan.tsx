import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { stil, farben } from "@/lib/stil";
import {
  ladeKontingent,
  ladePlaetze,
  ladeTagesplan,
  storniereBuchung,
} from "@/lib/daten";

function heuteInBerlin(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

function verschiebe(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j!, (m ?? 1) - 1, t));
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function lesbar(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(j!, (m ?? 1) - 1, t));
}

function uhrzeit(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(new Date(iso));
}

/**
 * Auf dem Telefon ist eine Tabelle mit acht Spalten unbrauchbar. Deshalb wird
 * nach Platz gruppiert und die Belegung als Liste gezeigt - das laesst sich
 * mit einer Hand bedienen.
 */
export default function Plan() {
  const [datum, setDatum] = useState(heuteInBerlin());
  const [plaetze, setPlaetze] = useState<Awaited<ReturnType<typeof ladePlaetze>>>([]);
  const [belegung, setBelegung] = useState<Awaited<ReturnType<typeof ladeTagesplan>>>([]);
  const [kontingent, setKontingent] = useState({ used: 0, allowed: 0 });
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async (tag: string) => {
    setLaedt(true);
    const [p, b, k] = await Promise.all([ladePlaetze(), ladeTagesplan(tag), ladeKontingent()]);
    setPlaetze(p);
    setBelegung(b);
    setKontingent(k);
    setLaedt(false);
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
      <View style={stil.zeile}>
        <Pressable
          style={[stil.karte, { paddingVertical: 8 }]}
          onPress={() => setDatum(verschiebe(datum, -1))}
          accessibilityRole="button"
          accessibilityLabel="Vortag"
        >
          <Text>‹</Text>
        </Pressable>
        <Text style={{ fontWeight: "600" }}>{lesbar(datum)}</Text>
        <Pressable
          style={[stil.karte, { paddingVertical: 8 }]}
          onPress={() => setDatum(verschiebe(datum, 1))}
          accessibilityRole="button"
          accessibilityLabel="Folgetag"
        >
          <Text>›</Text>
        </Pressable>
      </View>

      <Text style={stil.leise}>
        {kontingent.used} von {kontingent.allowed} Buchungen offen. Buchungen, bei
        denen du als Mitspieler eingetragen bist, zählen mit.
      </Text>

      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
      )}

      {laedt ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : (
        plaetze.map((platz) => {
          const eintraege = belegung
            .filter((b) => b.court_id === platz.id)
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

          return (
            <View key={platz.id} style={stil.karte}>
              <Text style={{ fontWeight: "600", fontSize: 16 }}>{platz.name}</Text>

              {eintraege.length === 0 ? (
                <Text style={stil.leise}>ganztägig frei</Text>
              ) : (
                eintraege.map((b) => (
                  <View
                    key={b.booking_id}
                    style={{
                      borderLeftWidth: 3,
                      borderLeftColor: b.is_own
                        ? farben.gruen
                        : b.kind === "blocking"
                          ? farben.textLeise
                          : farben.sand,
                      paddingLeft: 10,
                      marginTop: 6,
                    }}
                  >
                    <Text style={{ fontWeight: "600" }}>
                      {uhrzeit(b.starts_at)}–{uhrzeit(b.ends_at)}
                      {"  "}
                      {b.kind === "blocking" ? b.title : b.owner_name}
                    </Text>
                    {b.players.length > 0 && (
                      <Text style={stil.leise}>mit {b.players.join(", ")}</Text>
                    )}
                    {b.is_own && (
                      <Pressable
                        onPress={() => stornieren(b.booking_id)}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: farben.rot, marginTop: 4 }}>Stornieren</Text>
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
