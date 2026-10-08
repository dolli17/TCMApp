/**
 * Was noch angekuendigt werden muss - fuer jede Art, nicht nur fuer Beitraege
 * (Nachbau von apps/web/src/components/AnkuendigungNachArt.tsx).
 *
 * Bisher liessen sich nur Beitraege (Jahresbeitraege) und Getraenke
 * (Getraenkemonat) ankuendigen. Arbeitsdienst, Gastgebuehr, Pfand und
 * Sonstiges blieben dadurch fuer immer offen und kamen nie in einen
 * Lastschriftlauf - der nimmt nur angekuendigte Forderungen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { CHARGE_KIND_LABEL, formatCents } from "@tcm/core";
import {
  FormFeld, FormGruppe, Karte, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { ListenGruppe } from "@/components/verwaltung/Liste";
import { ArtMarke } from "@/components/verwaltung/kasse/ArtMarke";
import { KEIN_DATUM, zahlwort } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import { deutschZuIso, heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import { forderungenAnkuendigen, plusTage, type AnkuendbarZeile } from "@/lib/verwaltung/kasse";

export function AnkuendigungNachArt({
  zeilen,
  fristTage,
  onGeaendert,
}: {
  zeilen: AnkuendbarZeile[];
  fristTage: number;
  onGeaendert: () => void | Promise<void>;
}) {
  const { farben } = useTheme();
  const frueheste = plusTage(heuteInBerlin(), fristTage);
  const [faellig, setFaellig] = useState(isoZuDeutsch(frueheste));
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const offen = zeilen.filter((z) => z.anzahl > 0);

  if (offen.length === 0) return null;

  const iso = deutschZuIso(faellig);

  return (
    <Karte
      titel="Zur Ankündigung bereit"
      unterzeile={`Eingezogen wird nur, was angekündigt ist. Jeder Zahler bekommt eine Nachricht mit Betrag und Fälligkeit; erst ${fristTage} Tage danach darf der Lastschriftlauf sie mitnehmen.`}
    >
      <Meldung meldung={meldung} />

      <FormGruppe>
        <FormFeld
          label="Fällig am"
          wert={faellig}
          onAendern={setFaellig}
          platzhalter="TT.MM.JJJJ"
          tastatur="numbers-and-punctuation"
          beschreibung={`Frühestens der ${isoZuDeutsch(frueheste)} – so lange läuft die Frist.`}
        />
      </FormGruppe>

      <ListenGruppe>
        {offen.map((z) => (
          <View
            key={z.art}
            accessibilityLabel={`${CHARGE_KIND_LABEL[z.art]}: ${zahlwort(z.anzahl, "Forderung", "Forderungen")}, ${formatCents(z.summe_cents)}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 16 }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 4, alignItems: "flex-start" }}>
              <ArtMarke art={z.art} />
              <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
                {`${zahlwort(z.anzahl, "Forderung", "Forderungen")} · ${z.zahler} Zahler`}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}>
                {formatCents(z.summe_cents)}
              </Text>
              <Knopf
                klein
                text="Ankündigen"
                deaktiviert={laeuft || (iso !== null && iso < frueheste)}
                onPress={() => {
                  if (!iso) {
                    setMeldung({ ok: false, text: KEIN_DATUM });
                    return;
                  }
                  void ausfuehren(
                    async () => {
                      const e = await forderungenAnkuendigen({ faelligAm: iso, art: z.art, zeitraum: null });
                      return { ...e, meldung: `${CHARGE_KIND_LABEL[z.art]}: ${e.meldung}` };
                    },
                    onGeaendert,
                  );
                }}
              />
            </View>
          </View>
        ))}
      </ListenGruppe>
    </Karte>
  );
}
