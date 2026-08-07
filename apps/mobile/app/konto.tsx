import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import {
  ladeArbeitsdienst, ladeBenachrichtigungen, ladeMeineBuchungen, ladeMeineForderungen,
  ladeOffeneSpiele, markiereBenachrichtigungenGelesen, spieleMit, storniereBuchung,
  verlasseBuchung,
} from "@/lib/daten";
import { useTheme, type ThemeWahl } from "@/lib/theme";

const TAG = new Intl.DateTimeFormat("de-DE", {
  weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin",
});
const UHR = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
});

const ART_TEXT: Record<string, string> = {
  fee: "Mitgliedsbeitrag", drinks: "Getränke", deposit: "Pfand",
  work_duty: "Arbeitsdienst", guest: "Gastgebühr", misc: "Sonstiges",
};

export default function Konto() {
  const { stil, farben } = useTheme();
  const [forderungen, setForderungen] = useState<Awaited<ReturnType<typeof ladeMeineForderungen>>>([]);
  const [dienst, setDienst] = useState<Awaited<ReturnType<typeof ladeArbeitsdienst>>>(null);
  const [buchungen, setBuchungen] = useState<Awaited<ReturnType<typeof ladeMeineBuchungen>>>([]);
  const [nachrichten, setNachrichten] =
    useState<Awaited<ReturnType<typeof ladeBenachrichtigungen>>>([]);
  const [offene, setOffene] = useState<Awaited<ReturnType<typeof ladeOffeneSpiele>>>([]);
  const [laedt, setLaedt] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [nachfrage, setNachfrage] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const [f, d, b, n, o] = await Promise.all([
      ladeMeineForderungen(), ladeArbeitsdienst(), ladeMeineBuchungen(), ladeBenachrichtigungen(),
      ladeOffeneSpiele(),
    ]);
    setForderungen(f); setDienst(d); setBuchungen(b); setNachrichten(n); setOffene(o);
  }, []);

  useEffect(() => {
    laden()
      .catch((f: Error) => setFehler(f.message))
      .finally(() => setLaedt(false));
  }, [laden]);

  // Wer den Bereich aufschlaegt, hat die Nachrichten gesehen. Sie bleiben in
  // der Liste stehen, nur die Hervorhebung faellt beim naechsten Laden weg.
  useEffect(() => {
    if (nachrichten.some((n) => n.read_at === null)) {
      markiereBenachrichtigungenGelesen().catch(() => {});
    }
  }, [nachrichten]);

  async function mitspielen(id: string) {
    setLaeuft(true);
    const r = await spieleMit(id);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await laden().catch(() => {});
  }

  async function beenden(id: string, binBucher: boolean) {
    setLaeuft(true);
    const r = binBucher ? await storniereBuchung(id) : await verlasseBuchung(id);
    setLaeuft(false);
    setNachfrage(null);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await laden().catch(() => {});
  }

  if (laedt) {
    return <View style={[stil.seite, { justifyContent: "center" }]}><ActivityIndicator color={farben.blue} /></View>;
  }

  const offen = forderungen
    .filter((f) => f.status === "open" || f.status === "notified")
    .reduce((s, f) => s + f.amount_cents, 0);

  return (
    <ScrollView style={stil.seite} contentContainerStyle={stil.inhalt}>
      {fehler && <Text style={stil.hinweisFehler}>{fehler}</Text>}
      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
      )}

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

      <Text style={[stil.titel, { fontSize: 18, marginTop: 8 }]}>Meine Buchungen</Text>
      {buchungen.length === 0 ? (
        <Text style={stil.leise}>Für dich steht gerade nichts an.</Text>
      ) : (
        buchungen.map((b) => {
          const von = new Date(b.starts_at);
          const bis = new Date(b.ends_at);
          const offenGefragt = nachfrage === b.booking_id;

          return (
            <View key={b.booking_id} style={stil.karte}>
              <View style={stil.zeile}>
                <Text style={{ fontWeight: "600" }}>{b.court_name ?? "Platz"}</Text>
                <Text style={stil.zahl}>
                  {TAG.format(von)} {UHR.format(von)}–{UHR.format(bis)}
                </Text>
              </View>
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
                  offenGefragt ? beenden(b.booking_id, b.bin_bucher) : setNachfrage(b.booking_id)
                }
              >
                <Text style={[stil.knopfLeiseText, { color: farben.red }]}>
                  {offenGefragt
                    ? b.bin_bucher ? "Wirklich stornieren" : "Wirklich austragen"
                    : b.bin_bucher ? "Stornieren" : "Austragen"}
                </Text>
              </Pressable>
            </View>
          );
        })
      )}

      <Text style={[stil.titel, { fontSize: 18, marginTop: 8 }]}>Offene Spiele</Text>
      {offene.length === 0 ? (
        <Text style={stil.leise}>Gerade sucht niemand Mitspieler.</Text>
      ) : (
        offene.map((o) => {
          const von = new Date(o.starts_at);
          const bis = new Date(o.ends_at);

          return (
            <View key={o.booking_id} style={stil.karte}>
              <View style={stil.zeile}>
                <Text style={{ fontWeight: "600" }}>{o.court_name ?? "Platz"}</Text>
                <Text style={stil.zahl}>
                  {TAG.format(von)} {UHR.format(von)}–{UHR.format(bis)}
                </Text>
              </View>
              <Text style={stil.leise}>
                {o.type_name} · {o.owner_name ?? "unbekannt"}
                {o.players.length > 0 ? ` · mit ${o.players.join(", ")}` : ""}
              </Text>
              <Text style={stil.leise}>
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

      <Text style={[stil.titel, { fontSize: 18, marginTop: 8 }]}>Benachrichtigungen</Text>
      {nachrichten.length === 0 ? (
        <Text style={stil.leise}>Es liegt nichts vor.</Text>
      ) : (
        nachrichten.map((n) => (
          <View key={n.id} style={stil.karte}>
            <Text style={{ fontWeight: "600" }}>{n.title}</Text>
            <Text style={stil.leise}>{n.body}</Text>
            <Text style={stil.leise}>
              {TAG.format(new Date(n.created_at))} {UHR.format(new Date(n.created_at))}
            </Text>
          </View>
        ))
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
