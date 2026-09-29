/**
 * Ein Block Stammdaten mit eigenem Formular und eigener Rueckmeldung
 * (Nachbau von apps/web/src/components/Stammdatenkarte.tsx)
 *
 * Solange nicht bearbeitet wird, stehen die Werte als Zeilen da; Bearbeiten
 * oeffnet ein Blatt. Geschickt wird nur, was sich geaendert hat - das haelt
 * das Aenderungsprotokoll sauber (stammdatenPatch).
 */

import { useState } from "react";
import { View } from "react-native";
import {
  FormAuswahl, FormBlatt, FormFeld, FormGruppe, FormSchalter, Karte, Knopf, Meldung, Wertzeile, useAktion,
} from "@/components/verwaltung/Formular";
import { isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import { stammdatenSpeichern } from "@/lib/verwaltung/mitglieder";

export interface Feld {
  name: string;
  label: string;
  art: "text" | "email" | "tel" | "datum" | "auswahl" | "schalter" | "mehrzeilig";
  hinweis?: string;
  optionen?: { wert: string; label: string }[];
}

type Werte = Record<string, string | boolean>;

function alsText(w: unknown): string {
  if (w === null || w === undefined) return "";
  return String(w);
}

/** Die gespeicherten Werte so, wie das Formular sie vergleicht (Daten ISO). */
function ausgangswerte(felder: Feld[], quelle: Record<string, unknown>): Werte {
  return Object.fromEntries(
    felder.map((f) => [f.name, f.art === "schalter" ? Boolean(quelle[f.name]) : alsText(quelle[f.name])]),
  );
}

function anzeige(f: Feld, w: string | boolean): string {
  if (f.art === "schalter") return w ? "ja" : "nein";
  const text = String(w);
  if (!text) return "—";
  if (f.art === "datum") return isoZuDeutsch(text);
  if (f.art === "auswahl") return f.optionen?.find((o) => o.wert === text)?.label ?? text;
  return text;
}

export function StammdatenBlock({
  mitgliedId,
  titel,
  text,
  felder,
  quelle,
  onGespeichert,
}: {
  mitgliedId: string;
  titel: string;
  text?: string;
  felder: Feld[];
  quelle: Record<string, unknown>;
  onGespeichert: () => void | Promise<void>;
}) {
  const alt = ausgangswerte(felder, quelle);
  const [offen, setOffen] = useState(false);
  const [entwurf, setEntwurf] = useState<Werte>(alt);
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const [ergebnis, setErgebnis] = useState<{ ok: boolean; text: string } | null>(null);

  const datumsfelder = Object.fromEntries(felder.filter((f) => f.art === "datum").map((f) => [f.name, f.label]));

  function oeffnen() {
    // Der Entwurf startet immer beim gespeicherten Stand; Daten deutsch.
    setEntwurf(
      Object.fromEntries(
        Object.entries(alt).map(([k, w]) => [k, k in datumsfelder ? isoZuDeutsch(String(w)) : w]),
      ),
    );
    setMeldung(null);
    setOffen(true);
  }

  const setze = (name: string, w: string | boolean) => setEntwurf((e) => ({ ...e, [name]: w }));

  return (
    <>
      <Karte titel={titel} unterzeile={text}>
        <Meldung meldung={ergebnis} />
        <View>
          {felder.map((f) => (
            <Wertzeile key={f.name} name={f.label} wert={anzeige(f, alt[f.name] ?? "")} />
          ))}
        </View>
        <View style={{ alignSelf: "flex-start" }}>
          <Knopf art="leise" klein text="Bearbeiten" onPress={oeffnen} />
        </View>
      </Karte>

      {offen && (
        <FormBlatt titel={titel} unterzeile={text} onSchliessen={() => setOffen(false)}>
          {(zu) => (
            <>
              <Meldung meldung={meldung} />
              <FormGruppe>
                {felder.map((f) =>
                  f.art === "schalter" ? (
                    <FormSchalter
                      key={f.name}
                      label={f.label}
                      beschreibung={f.hinweis}
                      an={Boolean(entwurf[f.name])}
                      onWechsel={(an) => setze(f.name, an)}
                    />
                  ) : f.art === "auswahl" ? (
                    <FormAuswahl
                      key={f.name}
                      label={f.label}
                      wert={String(entwurf[f.name] ?? "")}
                      optionen={f.optionen ?? []}
                      leer="—"
                      onWahl={(w) => setze(f.name, w)}
                    />
                  ) : (
                    <FormFeld
                      key={f.name}
                      label={f.label}
                      wert={String(entwurf[f.name] ?? "")}
                      onAendern={(w) => setze(f.name, w)}
                      beschreibung={f.hinweis}
                      mehrzeilig={f.art === "mehrzeilig"}
                      platzhalter={f.art === "datum" ? "TT.MM.JJJJ" : undefined}
                      tastatur={
                        f.art === "email" ? "email-address"
                        : f.art === "tel" ? "phone-pad"
                        : f.art === "datum" ? "numbers-and-punctuation"
                        : undefined
                      }
                      gross={f.art === "email" ? "none" : undefined}
                    />
                  ),
                )}
              </FormGruppe>
              <Knopf
                art="gold"
                gross
                text="Speichern"
                laeuftText="Wird gespeichert…"
                laeuft={laeuft}
                onPress={() =>
                  void ausfuehren(
                    () => stammdatenSpeichern(mitgliedId, entwurf, alt, datumsfelder),
                    async (e) => {
                      setErgebnis({ ok: true, text: e.meldung });
                      zu();
                      await onGespeichert();
                    },
                  )
                }
              />
            </>
          )}
        </FormBlatt>
      )}
    </>
  );
}
