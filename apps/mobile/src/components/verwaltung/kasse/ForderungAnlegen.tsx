/**
 * Eine Forderung von Hand anlegen (Nachbau von
 * apps/web/src/components/ForderungAnlegen.tsx) - als Blatt.
 *
 * Fuer alles, was keine eigene Abrechnung hat: ein verlorener Schluessel,
 * Pfand fuer die Hallenkarte, eine Nachberechnung. Die Forderung entsteht
 * offen; angekuendigt und eingezogen wird sie wie jede andere ueber
 * "Zur Ankuendigung bereit" und den Lastschriftlauf.
 *
 * Das Mitglied waehlt man wie ueberall in der Verwaltung ueber die
 * Personensuche (im Web eine datalist).
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { CHARGE_KINDS, CHARGE_KIND_LABEL, parseAmountToCents, type ChargeKind } from "@tcm/core";
import {
  Chipwahl, FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { Personensuche } from "@/components/verwaltung/mitglieder/Personensuche";
import { useTheme } from "@/lib/theme";
import { forderungAnlegen, type MitgliedWahl } from "@/lib/verwaltung/kasse";

export function ForderungAnlegen({
  mitglieder,
  onSchliessen,
  onAngelegt,
}: {
  mitglieder: MitgliedWahl[];
  onSchliessen: () => void;
  onAngelegt?: () => void | Promise<void>;
}) {
  const { stil } = useTheme();
  const [mitglied, setMitglied] = useState<string | null>(null);
  const [art, setArt] = useState<ChargeKind>("misc");
  const [betrag, setBetrag] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();

  function anlegen() {
    let cents = 0;
    try {
      cents = parseAmountToCents(betrag);
    } catch {
      setMeldung({ ok: false, text: "Bitte einen Betrag in Euro angeben, etwa 25,00." });
      return;
    }
    if (!mitglied) {
      setMeldung({ ok: false, text: "Bitte ein Mitglied aus der Liste wählen." });
      return;
    }
    void ausfuehren(
      () => forderungAnlegen({ mitgliedId: mitglied, art, betragCents: cents, beschreibung: beschreibung.trim() }),
      async () => {
        // Das Blatt bleibt offen: oft kommen mehrere Forderungen hintereinander.
        setMitglied(null);
        setBetrag("");
        setBeschreibung("");
        await onAngelegt?.();
      },
    );
  }

  return (
    <FormBlatt
      titel="Forderung von Hand"
      unterzeile="Für alles ohne eigene Abrechnung. Die Forderung ist danach offen und wird wie jede andere angekündigt und eingezogen."
      onSchliessen={onSchliessen}
    >
      {() => (
        <>
          <View style={{ gap: 8 }}>
            <Text style={[stil.feldLabel, { marginBottom: 0 }]}>Mitglied</Text>
            <Personensuche
              verzeichnis={mitglieder}
              gewaehlt={mitglied}
              onWahl={(id) => {
                setMeldung(null);
                setMitglied(id);
              }}
              label="Mitglied"
              deaktiviert={laeuft}
            />
          </View>

          <Chipwahl
            label="Art"
            optionen={CHARGE_KINDS.map((k) => ({ wert: k, label: CHARGE_KIND_LABEL[k] }))}
            wert={art}
            onWahl={setArt}
          />

          <FormGruppe>
            <FormFeld
              label="Betrag in Euro"
              wert={betrag}
              onAendern={setBetrag}
              platzhalter="25,00"
              tastatur="decimal-pad"
            />
            <FormFeld
              label="Beschreibung"
              wert={beschreibung}
              onAendern={setBeschreibung}
              platzhalter="z. B. Ersatzschlüssel Clubhaus"
            />
          </FormGruppe>

          <Meldung meldung={meldung} />

          <Knopf
            art="gold"
            gross
            text="Forderung anlegen"
            laeuftText="Wird angelegt…"
            laeuft={laeuft}
            deaktiviert={!mitglied || betrag.trim() === "" || beschreibung.trim() === ""}
            onPress={anlegen}
          />
        </>
      )}
    </FormBlatt>
  );
}
