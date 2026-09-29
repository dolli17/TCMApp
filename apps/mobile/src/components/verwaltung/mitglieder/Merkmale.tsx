/**
 * Bereich Merkmale & Einwilligungen (Nachbau von
 * apps/web/src/components/MerkmaleKarte.tsx in der Vorstandsansicht)
 *
 * Alle Merkmale des Mitglieds, nicht nur die zur Selbstpflege wie im Konto
 * (src/components/MerkmaleKarte.tsx). Was jemand aendern darf, entscheidet
 * die Datenbank - darf_ich kommt fertig aus der RPC.
 *
 * Datumsmerkmale tippt man deutsch; gespeichert wird ISO wie im Web.
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router, type Href } from "expo-router";
import { Segmente } from "@/components/Segmente";
import { FormAuswahl, Karte, Knopf, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { datum } from "@/components/verwaltung/mitglieder/optionen";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { deutschZuIso, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import { ladeMerkmale, merkmalEntfernen, merkmalSetzen } from "@/lib/verwaltung/mitglieder";

type Zeile = Awaited<ReturnType<typeof ladeMerkmale>>[number];

interface Merkmal {
  code: string;
  name: string;
  description: string;
  art: Zeile["value_kind"];
  multiple: boolean;
  darfIch: boolean;
  optionen: { value: string; label: string }[];
  werte: { option: string | null; label: string | null; text: string | null; seit: string | null }[];
}

/** Aus den Zeilen der RPC wird je Merkmal ein Eintrag mit allen seinen Werten. */
function buendeln(zeilen: Zeile[]): Merkmal[] {
  const map = new Map<string, Merkmal>();
  for (const z of zeilen) {
    let m = map.get(z.code);
    if (!m) {
      m = {
        code: z.code,
        name: z.name,
        description: z.description,
        art: z.value_kind,
        multiple: z.multiple,
        darfIch: z.darf_ich,
        optionen: (Array.isArray(z.optionen) ? z.optionen : []) as { value: string; label: string }[],
        werte: [],
      };
      map.set(z.code, m);
    }
    // Die RPC liefert auch Merkmale ohne Wert - dann bleibt die Liste leer.
    if (z.option_value !== null || z.text_value !== null) {
      m.werte.push({ option: z.option_value, label: z.option_label, text: z.text_value, seit: z.set_at });
    }
  }
  return [...map.values()];
}

export function Merkmale({ mitgliedId, onGeaendert }: { mitgliedId: string; onGeaendert: () => Promise<void> }) {
  const { farben, stil } = useTheme();
  const zustand = useLaden(() => ladeMerkmale(mitgliedId));
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const [entwuerfe, setEntwuerfe] = useState<Record<string, string>>({});
  const merkmale = buendeln(zustand.daten ?? []);

  function fuehreAus(tun: () => ReturnType<typeof merkmalSetzen>) {
    void ausfuehren(tun, async () => {
      await Promise.all([onGeaendert(), zustand.erneutHolen()]);
    });
  }

  /** Text, Zahl oder Datum speichern - ein Datum erst nach ISO. */
  function textSpeichern(m: Merkmal, text: string) {
    if (m.art === "date" && text.trim()) {
      const iso = deutschZuIso(text);
      if (!iso) {
        setMeldung({ ok: false, text: `${m.name}: Bitte das Datum als TT.MM.JJJJ eingeben.` });
        return;
      }
      text = iso;
    }
    fuehreAus(() => merkmalSetzen(mitgliedId, m.code, undefined, text));
  }

  if (zustand.fehler) return <Text style={stil.hinweisFehler}>{zustand.fehler}</Text>;
  if (zustand.laedt) return null;

  return (
    <>
      <Karte
        titel="Merkmale"
        unterzeile={
          merkmale.length === 0
            ? "Es sind noch keine Merkmale angelegt."
            : "Frei definierbare Angaben. Neue Merkmale legt der Vorstand unter Einstellungen an."
        }
      >
        <Meldung meldung={meldung} />
        {merkmale.map((m) => {
          const gesetzt = m.werte.length > 0;
          const gespeichert = m.art === "date" ? isoZuDeutsch(m.werte[0]?.text) : (m.werte[0]?.text ?? "");
          const entwurf = entwuerfe[m.code] ?? gespeichert;
          return (
            <View key={m.code} style={{ gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: farben.line }}>
              <Text style={{ fontSize: 15.5, fontFamily: "Barlow_700Bold", color: farben.ink }}>{m.name}</Text>
              {m.description ? <Text style={stil.leise}>{m.description}</Text> : null}

              {m.art === "boolean" ? (
                <>
                  <Segmente<"ja" | "nein">
                    beschriftung={m.name}
                    hoehe={36}
                    wert={gesetzt ? "ja" : "nein"}
                    optionen={[
                      { wert: "ja", label: "Ja", deaktiviert: laeuft || !m.darfIch },
                      { wert: "nein", label: "Nein", deaktiviert: laeuft || !m.darfIch },
                    ]}
                    onWahl={(w) =>
                      fuehreAus(() => (w === "ja" ? merkmalSetzen(mitgliedId, m.code) : merkmalEntfernen(mitgliedId, m.code)))
                    }
                  />
                  {gesetzt && m.werte[0]?.seit && <Text style={stil.leise}>Erteilt am {datum(m.werte[0].seit)}</Text>}
                </>
              ) : m.art === "list" ? (
                <>
                  {m.werte.length > 0 && (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {m.werte.map((w) => (
                        <Pressable
                          key={w.option ?? w.text}
                          style={stil.marke}
                          disabled={laeuft || !m.darfIch}
                          accessibilityRole="button"
                          accessibilityLabel={`${w.label ?? w.option} entfernen`}
                          onPress={() => fuehreAus(() => merkmalEntfernen(mitgliedId, m.code, w.option ?? undefined))}
                        >
                          <Text style={stil.markeText}>{w.label ?? w.option}</Text>
                          {m.darfIch && <Text style={stil.markeWeg}>×</Text>}
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {m.darfIch && (m.multiple || m.werte.length === 0) && (
                    <View style={{ backgroundColor: farben.surf2, borderRadius: 14 }}>
                      <FormAuswahl
                        label="Hinzufügen"
                        wert=""
                        leer="Auswählen…"
                        optionen={m.optionen
                          .filter((o) => !m.werte.some((w) => w.option === o.value))
                          .map((o) => ({ wert: o.value, label: o.label }))}
                        onWahl={(w) => fuehreAus(() => merkmalSetzen(mitgliedId, m.code, w))}
                      />
                    </View>
                  )}
                </>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <TextInput
                    style={[stil.feld, { flex: 1 }, !m.darfIch && { opacity: 0.6 }]}
                    value={entwurf}
                    editable={!laeuft && m.darfIch}
                    onChangeText={(t) => setEntwuerfe({ ...entwuerfe, [m.code]: t })}
                    accessibilityLabel={m.name}
                    keyboardType={m.art === "number" ? "numeric" : m.art === "date" ? "numbers-and-punctuation" : "default"}
                    placeholder={m.art === "date" ? "TT.MM.JJJJ" : undefined}
                    placeholderTextColor={farben.muted}
                  />
                  {m.darfIch && (
                    <Knopf
                      klein
                      text="Speichern"
                      deaktiviert={laeuft || entwurf === gespeichert}
                      onPress={() => textSpeichern(m, entwurf)}
                    />
                  )}
                </View>
              )}

              {!m.darfIch && <Text style={stil.leise}>Dieses Merkmal pflegt der Vorstand.</Text>}
            </View>
          );
        })}
      </Karte>
      <Pressable onPress={() => router.push("/verwaltung/system/merkmale" as Href)} accessibilityRole="link">
        <Text style={{ fontSize: 14, fontFamily: "Barlow_600SemiBold", color: farben.blueInk, marginHorizontal: 4 }}>
          Merkmale verwalten →
        </Text>
      </Pressable>
    </>
  );
}
