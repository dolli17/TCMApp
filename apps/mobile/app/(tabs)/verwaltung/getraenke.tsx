/**
 * Getraenke (Nachbau von apps/web/src/app/admin/getraenke/page.tsx)
 *
 * Die Karte an der Theke und was dazugehoert: der naechste Schritt der
 * Abrechnung, die Karte selbst, Preise, die Getraenkemonate und die
 * Abrechnungsregeln.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { Bildschirm } from "@/components/Bildschirm";
import { EinstellungsGruppe } from "@/components/verwaltung/EinstellungsGruppe";
import { FormBlatt, Meldung } from "@/components/verwaltung/Formular";
import { GetraenkeListe } from "@/components/verwaltung/getraenke/GetraenkeListe";
import { GetraenkFormular } from "@/components/verwaltung/getraenke/GetraenkFormular";
import { Preisbereich } from "@/components/verwaltung/getraenke/Preisbereich";
import { GetraenkemonatKarte } from "@/components/verwaltung/kasse/GetraenkemonatKarte";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { heuteInBerlin, type Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { ladeGetraenke, naechsterSchritt } from "@/lib/verwaltung/getraenke";

export default function GetraenkeVerwaltung() {
  const { farben, stil } = useTheme();
  const [anlegen, setAnlegen] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const zustand = useLaden(ladeGetraenke);
  const d = zustand.daten;

  const melde = (e: Ergebnis) => setMeldung({ ok: e.ok, text: e.meldung });
  const neuLaden = zustand.erneutHolen;

  if (!d) {
    return <Bildschirm laedt={zustand.laedt} fehler={zustand.fehler}>{null}</Bildschirm>;
  }

  const schritt = d.monate ? naechsterSchritt(d.monate, heuteInBerlin()) : null;

  return (
    <Bildschirm aktualisiert={zustand.aktualisiert} onAktualisieren={zustand.neuLaden} fehler={zustand.fehler}>
      <VerwaltungsKopf
        unterzeile="Die Karte an der Theke und die Regeln, nach denen abgerechnet wird."
        aktion={{ text: "Anlegen", onPress: () => setAnlegen(true) }}
      />

      {/* Naechster Schritt der Abrechnung (.naechster-schritt) - die Knoepfe
          dazu stehen unveraendert in der Monatskarte weiter unten. */}
      {schritt && (
        <View style={{ gap: 4, padding: 18, borderRadius: 22, backgroundColor: farben.brand }}>
          <Text style={[stil.kicker, { color: "#fff", opacity: 0.85 }]}>Nächster Schritt · Abrechnung</Text>
          <Text style={{ fontSize: 20, fontFamily: "Barlow_800ExtraBold", color: "#fff" }}>{schritt.titel}</Text>
          <Text style={{ fontSize: 14, lineHeight: 19.5, color: "#fff", opacity: 0.9, fontFamily: "Barlow_400Regular" }}>
            {schritt.text}
          </Text>
        </View>
      )}

      <Meldung meldung={meldung} />

      <GetraenkeListe getraenke={d.getraenke} melde={melde} neuLaden={neuLaden} />
      <Preisbereich getraenke={d.getraenke} neuLaden={neuLaden} />

      {d.monate ? (
        <GetraenkemonatKarte monate={d.monate} fristTage={d.fristTage} onGeaendert={neuLaden} />
      ) : (
        <Text style={stil.hinweisFehler}>Die Getränkemonate konnten nicht geladen werden.</Text>
      )}

      <EinstellungsGruppe
        titel="Abrechnung"
        text="Storno-Fenster und Mindestbetrag."
        eintraege={d.einstellungen}
        onGespeichert={() => void neuLaden()}
      />

      {anlegen && (
        <FormBlatt titel="Getränk anlegen" onSchliessen={() => setAnlegen(false)}>
          {(zu) => (
            <GetraenkFormular
              onErfolg={async (e) => {
                await neuLaden();
                melde(e);
                zu();
              }}
            />
          )}
        </FormBlatt>
      )}
    </Bildschirm>
  );
}
