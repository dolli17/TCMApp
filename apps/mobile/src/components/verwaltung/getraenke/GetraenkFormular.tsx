/**
 * Ein Getraenk anlegen oder umbenennen (Nachbau von GetraenkFormular in
 * apps/web/src/components/GetraenkeVerwaltung.tsx)
 *
 * Ohne Preis taucht ein neues Getraenk in der Karte gar nicht auf, deshalb
 * bleibt der Knopf bis dahin gesperrt.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { Chipwahl, FormFeld, FormGruppe, Knopf, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { useTheme } from "@/lib/theme";
import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { ART_TEXT, speichereGetraenk, type GetraenkZeile, type Kategorie } from "@/lib/verwaltung/getraenke";

const ARTEN = (Object.keys(ART_TEXT) as Kategorie[]).map((k) => ({ wert: k, label: ART_TEXT[k] }));

export function GetraenkFormular({
  vorhanden,
  onErfolg,
}: {
  vorhanden?: GetraenkZeile;
  onErfolg: (e: Ergebnis) => void | Promise<void>;
}) {
  const { stil } = useTheme();
  const [form, setForm] = useState(
    vorhanden
      ? { id: vorhanden.id as string | null, name: vorhanden.name, beschreibung: vorhanden.description ?? "", art: vorhanden.category, preis: "" }
      : { id: null as string | null, name: "", beschreibung: "", art: "drink" as Kategorie, preis: "" },
  );
  const { laeuft, meldung, ausfuehren } = useAktion();
  const neu = form.id === null;

  return (
    <View style={{ gap: 14 }}>
      <FormGruppe>
        <FormFeld label="Name" wert={form.name} onAendern={(w) => setForm({ ...form, name: w })} />
        <FormFeld
          label="Preis"
          wert={form.preis}
          onAendern={(w) => setForm({ ...form, preis: w })}
          platzhalter={neu ? "2,50" : "leer = unverändert"}
          tastatur="decimal-pad"
        />
        <FormFeld
          label="Beschreibung"
          wert={form.beschreibung}
          onAendern={(w) => setForm({ ...form, beschreibung: w })}
          platzhalter="z. B. 0,5 Liter"
        />
      </FormGruppe>

      <Chipwahl label="Art" optionen={ARTEN} wert={form.art} onWahl={(w) => setForm({ ...form, art: w })} />

      {neu && (
        <Text style={[stil.leise, { fontSize: 13.5 }]}>
          Ein neues Getränk braucht einen Preis – ohne ihn taucht es in der Karte gar nicht auf.
        </Text>
      )}

      <Meldung meldung={meldung} />
      <Knopf
        art="gold"
        gross
        text={neu ? "Getränk anlegen" : "Änderungen speichern"}
        laeuft={laeuft}
        deaktiviert={form.name.trim() === "" || (neu && form.preis.trim() === "")}
        onPress={() => void ausfuehren(() => speichereGetraenk(form), onErfolg)}
      />
    </View>
  );
}
