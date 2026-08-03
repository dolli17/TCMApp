import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import { bucheGetraenk, ladeEigeneGetraenke, ladeGetraenkekarte } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export default function Getraenke() {
  const { stil, farben } = useTheme();
  const [karte, setKarte] = useState<Awaited<ReturnType<typeof ladeGetraenkekarte>>>([]);
  const [buchungen, setBuchungen] = useState<Awaited<ReturnType<typeof ladeEigeneGetraenke>>>([]);
  const [laedt, setLaedt] = useState(true);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(async () => {
    const [k, b] = await Promise.all([ladeGetraenkekarte(), ladeEigeneGetraenke()]);
    setKarte(k);
    setBuchungen(b);
    setLaedt(false);
  }, []);

  useEffect(() => {
    laden().catch((f: Error) => {
      setMeldung({ ok: false, text: f.message });
      setLaedt(false);
    });
  }, [laden]);

  async function buchen(id: string) {
    const r = await bucheGetraenk(id, 1);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await laden();
  }

  const summe = buchungen
    .filter((b) => !b.voided_at)
    .reduce((s, b) => s + (b.total_cents ?? 0), 0);

  if (laedt) {
    return (
      <View style={[stil.seite, { justifyContent: "center" }]}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }

  return (
    <ScrollView style={stil.seite} contentContainerStyle={stil.inhalt}>
      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
      )}

      <View style={stil.karte}>
        <Text style={stil.leise}>Offen in diesem Monat</Text>
        <Text style={{ fontSize: 28, fontWeight: "700", color: farben.ink }}>
          {formatCents(summe)}
        </Text>
      </View>

      <Text style={[stil.titel, { fontSize: 18, marginTop: 8 }]}>Karte</Text>
      {karte.map((a) => (
        <Pressable
          key={a.id}
          style={stil.karte}
          onPress={() => buchen(a.id)}
          accessibilityRole="button"
          accessibilityLabel={`${a.name} buchen`}
        >
          <View style={stil.zeile}>
            <Text style={{ fontWeight: "600", fontSize: 16 }}>{a.name}</Text>
            <Text style={{ color: farben.blueInk, fontWeight: "700" }}>
              {formatCents(a.price_cents ?? 0)}
            </Text>
          </View>
          {a.description ? <Text style={stil.leise}>{a.description}</Text> : null}
        </Pressable>
      ))}

      <Text style={[stil.titel, { fontSize: 18, marginTop: 8 }]}>Dieser Monat</Text>
      {buchungen.length === 0 ? (
        <Text style={stil.leise}>Noch nichts entnommen.</Text>
      ) : (
        buchungen.map((b) => (
          <View key={b.id} style={[stil.karte, b.voided_at ? { opacity: 0.45 } : null]}>
            <View style={stil.zeile}>
              <Text>{b.item_name}</Text>
              <Text>{formatCents(b.total_cents ?? 0)}</Text>
            </View>
            <Text style={stil.leise}>
              {new Intl.DateTimeFormat("de-DE", {
                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                timeZone: "Europe/Berlin",
              }).format(new Date(b.created_at))}
              {b.voided_at ? " · storniert" : ""}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
