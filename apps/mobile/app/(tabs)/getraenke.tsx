import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { canVoidSelf, formatCents } from "@tcm/core";
import { abstand } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import { GetraenkeFenster } from "@/components/GetraenkeFenster";
import {
  bucheGetraenk, ladeEigeneGetraenke, ladeGetraenkekarte, ladeStornoFenster, storniereGetraenk,
} from "@/lib/daten";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "Europe/Berlin" });
const ZEITPUNKT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  timeZone: "Europe/Berlin",
});

type Gewaehlt = { id: string; name: string; preisCents: number };

export default function Getraenke() {
  const { stil, farben } = useTheme();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [gewaehlt, setGewaehlt] = useState<Gewaehlt | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  /**
   * Taktgeber fuer das Stornofenster.
   *
   * canVoidSelf vergleicht gegen die aktuelle Uhrzeit. Ohne ein regelmaessiges
   * Neuzeichnen bliebe der Knopf stehen, bis der Bildschirm aus einem anderen
   * Grund neu rendert - und jemand tippt nach zwanzig Minuten auf etwas, das
   * die Datenbank dann abweist.
   */
  const [, setTakt] = useState(0);
  useEffect(() => {
    const uhr = setInterval(() => setTakt((t) => t + 1), 30_000);
    return () => clearInterval(uhr);
  }, []);

  const laden = useCallback(async () => {
    const [karte, buchungen, stornoFenster] = await Promise.all([
      ladeGetraenkekarte(),
      ladeEigeneGetraenke(),
      ladeStornoFenster(),
    ]);
    return { karte, buchungen, stornoFenster };
  }, []);

  const zustand = useLaden(laden);
  const karte = zustand.daten?.karte ?? [];
  const buchungen = zustand.daten?.buchungen ?? [];
  const stornoFenster = zustand.daten?.stornoFenster ?? 15;

  async function buchen(menge: number) {
    if (!gewaehlt) return;
    setLaeuft(true);
    const r = await bucheGetraenk(gewaehlt.id, menge);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) {
      setGewaehlt(null);
      await zustand.erneutHolen();
    }
  }

  async function zuruecknehmen(id: string) {
    setLaeuft(true);
    const r = await storniereGetraenk(id);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await zustand.erneutHolen();
  }

  const aktive = buchungen.filter((b) => !b.voided_at);
  const summe = aktive.reduce((s, b) => s + (b.total_cents ?? 0), 0);

  return (
    <>
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
      >
        {meldung && (
          <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
        )}

        <View style={stil.kachelReihe}>
          <View style={stil.kachel}>
            <Text style={stil.kachelTitel}>Offen im {MONAT.format(new Date())}</Text>
            <Text style={stil.kachelWert}>{formatCents(summe)}</Text>
          </View>
          <View style={stil.kachel}>
            <Text style={stil.kachelTitel}>Entnahmen</Text>
            <Text style={stil.kachelWert}>{aktive.length}</Text>
          </View>
        </View>

        <Text style={stil.abschnitt}>Karte</Text>
        <View style={stil.kachelReihe}>
          {karte.map((a) => (
            <Pressable
              key={a.id}
              style={stil.kachel}
              accessibilityRole="button"
              accessibilityLabel={`${a.name} buchen`}
              onPress={() =>
                setGewaehlt({ id: a.id, name: a.name, preisCents: a.price_cents ?? 0 })
              }
            >
              <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold" }]}>{a.name}</Text>
              <Text
                style={{
                  color: farben.blueInk,
                  fontFamily: "BarlowSemiCondensed_700Bold",
                  fontSize: 19,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatCents(a.price_cents ?? 0)}
              </Text>
              {a.description ? <Text style={stil.leise}>{a.description}</Text> : null}
            </Pressable>
          ))}
        </View>

        <Text style={[stil.abschnitt, { marginTop: abstand.m }]}>Dieser Monat</Text>
        <Text style={stil.leise}>
          Eine Entnahme lässt sich {stornoFenster} Minuten lang selbst zurücknehmen.
        </Text>

        {buchungen.length === 0 ? (
          <Text style={stil.leise}>Noch nichts entnommen.</Text>
        ) : (
          buchungen.map((b) => {
            // Dieselbe Konstruktion wie in apps/web/src/components/Getraenkekarte.tsx:
            // canVoidSelf sieht nur auf Zeitpunkt und Storno, die uebrigen
            // Felder gehoeren zum Typ und bleiben leer.
            const stornierbar = canVoidSelf(
              {
                id: b.id,
                memberId: "",
                drinkItemId: "",
                quantity: b.quantity,
                unitPriceCents: b.unit_price_cents,
                createdAt: b.created_at,
                voidedAt: b.voided_at,
              },
              stornoFenster,
            );

            return (
              <View key={b.id} style={[stil.listenkarte, b.voided_at ? { opacity: 0.45 } : null]}>
                <View style={stil.zeile}>
                  <Text style={stil.text}>
                    {b.item_name}
                    {b.quantity > 1 ? ` · ${b.quantity} ×` : ""}
                  </Text>
                  <Text style={[stil.text, stil.zahl]}>{formatCents(b.total_cents ?? 0)}</Text>
                </View>
                <Text style={stil.leise}>
                  {ZEITPUNKT.format(new Date(b.created_at))}
                  {b.voided_at ? " · storniert" : ""}
                </Text>

                {stornierbar && (
                  <Pressable
                    style={[
                      stil.knopfLeise, stil.knopfKlein,
                      { alignSelf: "flex-start", marginTop: 6 },
                      laeuft && { opacity: 0.5 },
                    ]}
                    disabled={laeuft}
                    accessibilityRole="button"
                    onPress={() => zuruecknehmen(b.id)}
                  >
                    <Text
                      style={[stil.knopfLeiseText, stil.knopfKleinText, { color: farben.red }]}
                    >
                      Zurücknehmen
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </Bildschirm>

      {gewaehlt && (
        <GetraenkeFenster
          name={gewaehlt.name}
          preisCents={gewaehlt.preisCents}
          laeuft={laeuft}
          onBuchen={buchen}
          onSchliessen={() => setGewaehlt(null)}
        />
      )}
    </>
  );
}
