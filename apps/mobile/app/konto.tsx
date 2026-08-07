import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import { ladeArbeitsdienst, ladeMeineForderungen } from "@/lib/daten";
import { useTheme, type ThemeWahl } from "@/lib/theme";

const ART_TEXT: Record<string, string> = {
  fee: "Mitgliedsbeitrag", drinks: "Getränke", deposit: "Pfand",
  work_duty: "Arbeitsdienst", guest: "Gastgebühr", misc: "Sonstiges",
};

/**
 * Geld und Erscheinungsbild.
 *
 * Buchungen, offene Spiele und Benachrichtigungen standen früher ebenfalls
 * hier - alles untereinander in einem einzigen ScrollView. Wer wissen wollte,
 * wann er spielt, scrollte an seinem Arbeitsdienst vorbei. Seit sie eigene
 * Bildschirme haben, bleibt hier, was zusammengehört.
 */
export default function Konto() {
  const { stil, farben } = useTheme();
  const [forderungen, setForderungen] = useState<Awaited<ReturnType<typeof ladeMeineForderungen>>>([]);
  const [dienst, setDienst] = useState<Awaited<ReturnType<typeof ladeArbeitsdienst>>>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([ladeMeineForderungen(), ladeArbeitsdienst()])
      .then(([f, d]) => { setForderungen(f); setDienst(d); })
      .catch((f: Error) => setFehler(f.message))
      .finally(() => setLaedt(false));
  }, []);

  if (laedt) {
    return <View style={[stil.seite, { justifyContent: "center" }]}><ActivityIndicator color={farben.blue} /></View>;
  }

  const offen = forderungen
    .filter((f) => f.status === "open" || f.status === "notified")
    .reduce((s, f) => s + f.amount_cents, 0);

  return (
    <ScrollView style={stil.seite} contentContainerStyle={stil.inhalt}>
      {fehler && <Text style={stil.hinweisFehler}>{fehler}</Text>}

      <View style={stil.karte}>
        <Text style={stil.leise}>Offene Forderungen</Text>
        <Text style={{ fontSize: 28, fontWeight: "700", color: farben.ink }}>
          {formatCents(offen)}
        </Text>
      </View>

      {dienst && (
        <View style={stil.karte}>
          <Text style={stil.leise}>Arbeitsdienst {dienst.year}</Text>
          <Text style={{ fontSize: 22, fontWeight: "700" }}>
            {Number(dienst.completed_hours)} von {Number(dienst.required_hours)} Stunden
          </Text>
          {Number(dienst.missing_hours) > 0 && (
            <Text style={stil.leise}>noch {Number(dienst.missing_hours)} Stunden offen</Text>
          )}
        </View>
      )}

      <Text style={stil.abschnitt}>Erscheinungsbild</Text>
      <ThemeWahlKnoepfe />

      <Text style={[stil.titel, { fontSize: 18, marginTop: 8 }]}>Forderungen</Text>
      {forderungen.length === 0 ? (
        <Text style={stil.leise}>Keine Forderungen vorhanden.</Text>
      ) : (
        forderungen.map((f) => (
          <View key={f.id} style={stil.karte}>
            <View style={stil.zeile}>
              <Text style={{ fontWeight: "600" }}>{ART_TEXT[f.kind] ?? f.kind}</Text>
              <Text>{formatCents(f.amount_cents)}</Text>
            </View>
            <Text style={stil.leise}>
              {f.description}
              {f.is_for_other ? ` · für ${f.member_name}` : ""}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

/** Systemeinstellung als Vorgabe, Wahl ueberlebt den Neustart. */
function ThemeWahlKnoepfe() {
  const { stil, wahl, setzeWahl } = useTheme();
  const optionen: { wert: ThemeWahl; label: string }[] = [
    { wert: "hell", label: "Hell" },
    { wert: "system", label: "System" },
    { wert: "dunkel", label: "Dunkel" },
  ];

  return (
    <View style={stil.segment} accessibilityRole="radiogroup">
      {optionen.map((o) => (
        <Pressable
          key={o.wert}
          style={[stil.segmentKnopf, wahl === o.wert && stil.segmentAktiv]}
          onPress={() => setzeWahl(o.wert)}
          accessibilityRole="radio"
          accessibilityState={{ selected: wahl === o.wert }}
        >
          <Text style={[stil.segmentText, wahl === o.wert && stil.segmentTextAktiv]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
