/**
 * Preise aendern und geplante Erhoehungen zuruecknehmen (Nachbau von
 * Preisbereich in apps/web/src/components/GetraenkeVerwaltung.tsx)
 *
 * "Gueltig ab" kann in der Zukunft liegen: die Preishistorie kennt kein
 * Enddatum, ein spaeterer Eintrag loest den frueheren von selbst ab. Damit
 * laesst sich eine Erhoehung zum Monatsersten heute schon eintragen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import {
  FormAuswahl, FormFeld, FormGruppe, Karte, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { useTheme } from "@/lib/theme";
import { heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import {
  datumKurz, entferneGeplantenPreis, setzePreis, type GetraenkZeile,
} from "@/lib/verwaltung/getraenke";

export function Preisbereich({
  getraenke,
  neuLaden,
}: {
  getraenke: GetraenkZeile[];
  neuLaden: () => Promise<void>;
}) {
  const { farben } = useTheme();
  const [itemId, setItemId] = useState(getraenke[0]?.id ?? "");
  const [preis, setPreis] = useState("");
  const [ab, setAb] = useState(isoZuDeutsch(heuteInBerlin()));
  const { laeuft, meldung, ausfuehren } = useAktion();

  const geplante = getraenke.filter((g) => g.naechster_preis_cents !== null && g.naechster_preis_ab !== null);

  return (
    <Karte
      titel="Preis ändern"
      unterzeile="Bereits gebuchte Getränke behalten ihren Preis – er wird beim Buchen festgehalten. Eine Änderung wirkt nur auf das, was danach über die Theke geht."
    >
      <FormGruppe>
        <FormAuswahl
          label="Getränk"
          wert={itemId}
          optionen={getraenke.map((g) => ({
            wert: g.id,
            label: `${g.name}${g.price_cents !== null ? ` (${formatCents(g.price_cents)})` : ""}`,
          }))}
          onWahl={setItemId}
        />
        <FormFeld label="Neuer Preis" wert={preis} onAendern={setPreis} platzhalter="2,80" tastatur="decimal-pad" />
        <FormFeld label="Gültig ab" wert={ab} onAendern={setAb} platzhalter="TT.MM.JJJJ" tastatur="numbers-and-punctuation" />
      </FormGruppe>

      <Meldung meldung={meldung} />

      <Knopf
        text="Preis setzen"
        laeuft={laeuft}
        deaktiviert={itemId === "" || preis.trim() === ""}
        onPress={() =>
          void ausfuehren(() => setzePreis({ itemId, preis, gueltigAb: ab }), async () => {
            setPreis("");
            await neuLaden();
          })
        }
      />

      {geplante.length > 0 && (
        <View style={{ gap: 8, marginTop: 6 }}>
          <Text accessibilityRole="header" style={{ fontSize: 16, fontFamily: "Barlow_700Bold", color: farben.ink }}>
            Geplante Preise
          </Text>
          <ListenGruppe>
            {geplante.map((g) => (
              <Listenzeile
                key={g.id}
                titel={`${g.name} ${formatCents(g.naechster_preis_cents!)}`}
                kontext={`ab ${datumKurz(g.naechster_preis_ab!)}`}
                neben={
                  <Knopf
                    art="leise"
                    klein
                    text="Zurücknehmen"
                    deaktiviert={laeuft}
                    onPress={() =>
                      void ausfuehren(() => entferneGeplantenPreis(g.id, g.naechster_preis_ab!), () => neuLaden())
                    }
                  />
                }
              />
            ))}
          </ListenGruppe>
        </View>
      )}
    </Karte>
  );
}
