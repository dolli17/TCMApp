/**
 * Eine Karte mit Feldern, die man erst aufklappen muss
 *
 * Gegenstueck zu apps/web/src/components/Stammdatenkarte.tsx. Die Felder
 * kommen als Liste herein, nicht als fest verdrahtete Formulare - so tragen
 * dieselbe Karte die eigenen Daten und der Notfallkontakt.
 *
 * Solange nicht bearbeitet wird, stehen die Werte als Text da. Ein Formular,
 * das immer offen ist, laedt zum versehentlichen Aendern ein, und auf dem
 * Telefon nimmt es dreimal so viel Platz.
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { abstand } from "@tcm/ui";
import { BlattScroll } from "@/components/Blatt";
import { useTheme } from "@/lib/theme";
import type { Ergebnis } from "@/lib/daten";
import { feldEigenschaften, type Feldinhalt } from "@/lib/feldinhalt";

export type Feld = {
  name: string;
  label: string;
  art?: "text" | "email" | "telefon";
  /** Fuer Autofill und Tastatur; ohne Angabe nach dem Spaltennamen. */
  inhalt?: Feldinhalt;
};

/** Spalten von members und was in ihnen steht. */
const INHALT_NACH_SPALTE: Record<string, Feldinhalt> = {
  first_name: "vorname",
  last_name: "nachname",
  title: "titel",
  phone: "telefon",
  mobile: "telefon",
  street: "strasse",
  postcode: "plz",
  city: "ort",
  emergency_contact_name: "name",
  emergency_contact_phone: "telefon",
};

function inhaltVon(f: Feld): Feldinhalt | undefined {
  if (f.inhalt) return f.inhalt;
  if (f.art === "email") return "email";
  if (f.art === "telefon") return "telefon";
  return INHALT_NACH_SPALTE[f.name];
}

type Eigenschaften = {
  titel: string;
  erklaerung?: string;
  felder: Feld[];
  werte: Record<string, string>;
  onSpeichern: (neu: Record<string, string>) => Promise<Ergebnis>;
  onGespeichert: () => void | Promise<void>;
  /**
   * Im Blatt des Kontos: kein eigener Rahmen und Titel (die bringt das Blatt
   * mit), die Felder stehen gleich offen, gespeichert wird mit dem gelben Knopf.
   * Der steht angeheftet unter den Feldern, nicht am Ende der Liste (U76) -
   * das Blatt dazu mit eigenerScroll oeffnen.
   */
  imBlatt?: boolean;
};

export function Stammdatenformular({
  titel,
  erklaerung,
  felder,
  werte,
  onSpeichern,
  onGespeichert,
  imBlatt = false,
}: Eigenschaften) {
  const { stil, farben } = useTheme();
  const [offen, setOffen] = useState(imBlatt);
  // Das Feld, das der letzte Speicherversuch beanstandet hat (Ergebnis.feld).
  const [fehlerFeld, setFehlerFeld] = useState<string | null>(null);
  const [entwurf, setEntwurf] = useState(werte);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  function aufklappen() {
    // Der Entwurf startet immer beim gespeicherten Stand - sonst stuenden nach
    // einem Abbrechen noch die verworfenen Eingaben im Feld.
    setEntwurf(werte);
    setMeldung(null);
    setFehlerFeld(null);
    setOffen(true);
  }

  async function speichern() {
    setLaeuft(true);
    const r = await onSpeichern(entwurf);
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    setFehlerFeld(!r.ok && r.feld ? r.feld : null);
    if (r.ok) {
      setOffen(false);
      await onGespeichert();
    }
  }

  const meldungsZeile = meldung && !(fehlerFeld && offen) && (
    // Ein Fehler mit Feld steht am Feld, nicht noch einmal hier.
    <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler}>{meldung.text}</Text>
  );

  const eingaben = felder.map((f) => {
    const auto = feldEigenschaften(inhaltVon(f));
    const fehler = fehlerFeld === f.name ? meldung?.text : undefined;
    return (
      <View key={f.name}>
        <Text style={[stil.feldLabel, fehler ? { color: farben.red } : null]}>{f.label}</Text>
        <TextInput
          style={[stil.feld, fehler ? { borderColor: farben.red } : null]}
          value={entwurf[f.name] ?? ""}
          onChangeText={(t) => {
            if (fehlerFeld === f.name) setFehlerFeld(null);
            setEntwurf((e) => ({ ...e, [f.name]: t }));
          }}
          accessibilityLabel={f.label}
          accessibilityHint={fehler}
          {...auto}
          autoCapitalize={auto.autoCapitalize ?? "sentences"}
        />
        {fehler && (
          <Text style={[stil.hinweisFehler, { marginTop: 6 }]} accessibilityLiveRegion="polite">{fehler}</Text>
        )}
      </View>
    );
  });

  if (imBlatt) {
    return (
      <>
        <BlattScroll gap={abstand.s}>
          {erklaerung && <Text style={stil.leise}>{erklaerung}</Text>}
          {meldungsZeile}
          {eingaben}
        </BlattScroll>
        <View style={{ marginTop: -abstand.s }}>
          <Pressable
            style={[stil.knopf, stil.knopfGold, { minHeight: 52, justifyContent: "center" }, laeuft && { opacity: 0.5 }]}
            onPress={speichern}
            disabled={laeuft}
            accessibilityRole="button"
          >
            <Text style={[stil.knopfText, stil.knopfGoldText]}>{laeuft ? "Speichert…" : "Speichern"}</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <View style={stil.karte}>
      <View style={stil.zeile}>
        <Text style={[stil.text, { fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 18 }]}>
          {titel}
        </Text>
        {!offen && (
          <Pressable
            onPress={aufklappen}
            accessibilityRole="button"
            style={[stil.knopfLeise, stil.knopfKlein]}
          >
            <Text style={[stil.knopfLeiseText, stil.knopfKleinText]}>Bearbeiten</Text>
          </Pressable>
        )}
      </View>

      {erklaerung && <Text style={stil.leise}>{erklaerung}</Text>}
      {meldungsZeile}

      {offen ? (
        <>
          {eingaben}

          <View style={{ flexDirection: "row", gap: abstand.s, marginTop: abstand.s }}>
            <Pressable
              style={[stil.knopf, { flex: 1 }, laeuft && { opacity: 0.5 }]}
              onPress={speichern}
              disabled={laeuft}
              accessibilityRole="button"
            >
              <Text style={stil.knopfText}>{laeuft ? "Speichert…" : "Speichern"}</Text>
            </Pressable>
            <Pressable
              style={[stil.knopfLeise, { flex: 1 }]}
              onPress={() => setOffen(false)}
              disabled={laeuft}
              accessibilityRole="button"
            >
              <Text style={stil.knopfLeiseText}>Abbrechen</Text>
            </Pressable>
          </View>
        </>
      ) : (
        felder.map((f) => (
          <View key={f.name} style={stil.zeile}>
            <Text style={stil.leise}>{f.label}</Text>
            <Text style={stil.text}>{werte[f.name]?.trim() || "—"}</Text>
          </View>
        ))
      )}
    </View>
  );
}
