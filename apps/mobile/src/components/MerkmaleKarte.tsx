/**
 * Merkmale und Einwilligungen
 *
 * Portierung von apps/web/src/components/MerkmaleKarte.tsx. Im Konto laeuft
 * sie immer im Selbstpflege-Modus: es erscheinen nur Merkmale, die das
 * Mitglied selbst setzen darf.
 *
 * Ob jemand ein Merkmal aendern darf, entscheidet die Datenbank - darf_ich
 * kommt fertig aus der RPC und wird hier nur angezeigt, nicht nachgebaut.
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { abstand } from "@tcm/ui";
import { entferneMerkmal, setzeMerkmal } from "@/lib/daten";
import { useTheme } from "@/lib/theme";

export interface MerkmalZeile {
  code: string;
  name: string;
  description: string;
  value_kind: "list" | "text" | "date" | "boolean" | "number";
  multiple: boolean;
  self_editable: boolean;
  darf_ich: boolean;
  option_value: string | null;
  option_label: string | null;
  text_value: string | null;
  set_at: string | null;
  optionen: { value: string; label: string }[];
}

/** Aus den Zeilen der RPC wird je Merkmal ein Eintrag mit allen seinen Werten. */
interface Merkmal {
  code: string;
  name: string;
  description: string;
  art: MerkmalZeile["value_kind"];
  multiple: boolean;
  darfIch: boolean;
  optionen: { value: string; label: string }[];
  werte: { option: string | null; label: string | null; text: string | null; seit: string | null }[];
}

function buendeln(zeilen: MerkmalZeile[]): Merkmal[] {
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
        optionen: z.optionen ?? [],
        werte: [],
      };
      map.set(z.code, m);
    }
    // Die RPC liefert auch Merkmale ohne Wert - dann bleibt die Liste leer.
    if (z.option_value !== null || z.text_value !== null) {
      m.werte.push({
        option: z.option_value,
        label: z.option_label,
        text: z.text_value,
        seit: z.set_at,
      });
    }
  }

  return [...map.values()];
}

function alsDatum(wert: string | null): string {
  if (!wert) return "";
  return new Intl.DateTimeFormat("de-DE").format(new Date(wert));
}

export function MerkmaleKarte({
  zeilen,
  onGeaendert,
}: {
  zeilen: MerkmalZeile[];
  onGeaendert: () => void | Promise<void>;
}) {
  const { stil } = useTheme();
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [texte, setTexte] = useState<Record<string, string>>({});

  // Nur was das Mitglied selbst pflegen darf.
  const merkmale = buendeln(zeilen).filter((m) =>
    zeilen.some((z) => z.code === m.code && z.self_editable),
  );

  if (merkmale.length === 0) return null;

  async function ausfuehren(tun: () => Promise<{ ok: boolean; meldung: string }>) {
    setLaeuft(true);
    const r = await tun();
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) await onGeaendert();
  }

  return (
    <View style={stil.karte}>
      <Text style={[stil.text, { fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 18 }]}>
        Einwilligungen
      </Text>
      <Text style={stil.leise}>
        Was du hier setzt, kannst du jederzeit wieder zurücknehmen.
      </Text>

      {meldung && (
        <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
      )}

      {merkmale.map((m) => {
        const gesetzt = m.werte.length > 0;
        const jaNein = m.art === "boolean";

        return (
          <View key={m.code} style={{ gap: abstand.xs, marginTop: abstand.m }}>
            <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold" }]}>{m.name}</Text>
            {m.description ? <Text style={stil.leise}>{m.description}</Text> : null}

            {!m.darfIch ? (
              <Text style={stil.leise}>
                {gesetzt ? (m.werte[0]?.label ?? m.werte[0]?.text ?? "gesetzt") : "nicht gesetzt"}
                {" · nur der Verein kann das ändern"}
              </Text>
            ) : jaNein ? (
              <>
                <View style={stil.segment} accessibilityRole="radiogroup">
                  {[
                    { wert: true, label: "Ja" },
                    { wert: false, label: "Nein" },
                  ].map((o) => (
                    <Pressable
                      key={o.label}
                      style={[stil.segmentKnopf, gesetzt === o.wert && stil.segmentAktiv]}
                      disabled={laeuft}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: gesetzt === o.wert }}
                      onPress={() =>
                        ausfuehren(() =>
                          o.wert ? setzeMerkmal(m.code, "true") : entferneMerkmal(m.code),
                        )
                      }
                    >
                      <Text
                        style={[stil.segmentText, gesetzt === o.wert && stil.segmentTextAktiv]}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {gesetzt && m.werte[0]?.seit && (
                  <Text style={stil.leise}>erteilt am {alsDatum(m.werte[0].seit)}</Text>
                )}
              </>
            ) : m.art === "list" ? (
              <>
                {m.werte.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {m.werte.map((w) => (
                      <Pressable
                        key={w.option ?? w.text}
                        style={stil.marke}
                        disabled={laeuft}
                        accessibilityRole="button"
                        accessibilityLabel={`${w.label ?? w.text} entfernen`}
                        onPress={() =>
                          ausfuehren(() => entferneMerkmal(m.code, w.option ?? undefined))
                        }
                      >
                        <Text style={stil.markeText}>{w.label ?? w.text}</Text>
                        <Text style={stil.markeWeg}>×</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {m.optionen
                    .filter((o) => !m.werte.some((w) => w.option === o.value))
                    .map((o) => (
                      <Pressable
                        key={o.value}
                        style={[stil.markeKlein, stil.markeKleinGrau]}
                        disabled={laeuft}
                        accessibilityRole="button"
                        accessibilityLabel={`${o.label} setzen`}
                        onPress={() => ausfuehren(() => setzeMerkmal(m.code, o.value))}
                      >
                        <Text style={[stil.markeKleinText, stil.markeKleinGrauText]}>
                          + {o.label}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: abstand.s, alignItems: "flex-end" }}>
                <TextInput
                  style={[stil.feld, { flex: 1 }]}
                  value={texte[m.code] ?? m.werte[0]?.text ?? ""}
                  onChangeText={(t) => setTexte((s) => ({ ...s, [m.code]: t }))}
                  accessibilityLabel={m.name}
                  keyboardType={m.art === "number" ? "numeric" : "default"}
                  placeholder={m.art === "date" ? "TT.MM.JJJJ" : undefined}
                />
                <Pressable
                  style={[stil.knopf, stil.knopfKlein, laeuft && { opacity: 0.5 }]}
                  disabled={laeuft}
                  accessibilityRole="button"
                  onPress={() =>
                    ausfuehren(() =>
                      setzeMerkmal(m.code, undefined, texte[m.code] ?? m.werte[0]?.text ?? ""),
                    )
                  }
                >
                  <Text style={[stil.knopfText, stil.knopfKleinText]}>Speichern</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
