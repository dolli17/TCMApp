/**
 * Die Getraenkekarte (Nachbau von Kartenliste in
 * apps/web/src/components/GetraenkeVerwaltung.tsx)
 *
 * Bearbeiten, Reihenfolge (Hoch/Runter statt Ziehen) und Stilllegen stehen
 * im Blatt, nicht in der Zeile (Regel 4).
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import { GetraenkFormular } from "@/components/verwaltung/getraenke/GetraenkFormular";
import { FormBlatt, Meldung, useAktion } from "@/components/verwaltung/Formular";
import { Abschnitt, Gruppenkopf, ListenGruppe, Listenzeile, Statusmarke } from "@/components/verwaltung/Liste";
import { useTheme } from "@/lib/theme";
import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";
import {
  ART_TEXT, datumKurz, schalteGetraenk, sortiereGetraenke, type GetraenkZeile,
} from "@/lib/verwaltung/getraenke";
import { verschoben } from "@/lib/verwaltung/plaetze";

export function GetraenkeListe({
  getraenke,
  melde,
  neuLaden,
}: {
  getraenke: GetraenkZeile[];
  melde: (e: Ergebnis) => void;
  neuLaden: () => Promise<void>;
}) {
  const { stil, farben } = useTheme();
  const [gewaehlt, setGewaehlt] = useState<GetraenkZeile | null>(null);

  return (
    <Abschnitt>
      <Gruppenkopf titel="Getränkekarte" />
      <Text style={[stil.leise, { fontSize: 14, marginHorizontal: 4, color: farben.ink2 }]}>
        Was an der Theke angeboten wird, in der Reihenfolge, in der es dort erscheint. Ein
        stillgelegtes Getränk verschwindet aus der Karte; seine bisherigen Buchungen bleiben.
      </Text>
      <ListenGruppe>
        {getraenke.map((g) => (
          <Listenzeile
            key={g.id}
            titel={g.name}
            kontext={[
              g.description,
              ART_TEXT[g.category],
              `${g.buchungen} Buchungen`,
              g.naechster_preis_cents !== null && g.naechster_preis_ab !== null
                ? `${formatCents(g.naechster_preis_cents)} ab ${datumKurz(g.naechster_preis_ab)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            neben={
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink, fontVariant: ["tabular-nums"] }}>
                  {g.price_cents === null ? "—" : formatCents(g.price_cents)}
                </Text>
                {!g.active && <Statusmarke text="stillgelegt" />}
              </View>
            }
            onPress={() => setGewaehlt(g)}
          />
        ))}
      </ListenGruppe>

      {gewaehlt && (
        <FormBlatt titel={gewaehlt.name} kicker="Getränk bearbeiten" onSchliessen={() => setGewaehlt(null)}>
          {(zu) => (
            <GetraenkBlatt
              getraenk={gewaehlt}
              getraenke={getraenke}
              neuLaden={neuLaden}
              onErfolg={async (e) => {
                await neuLaden();
                melde(e);
                zu();
              }}
            />
          )}
        </FormBlatt>
      )}
    </Abschnitt>
  );
}

function GetraenkBlatt({
  getraenk,
  getraenke,
  neuLaden,
  onErfolg,
}: {
  getraenk: GetraenkZeile;
  getraenke: GetraenkZeile[];
  neuLaden: () => Promise<void>;
  onErfolg: (e: Ergebnis) => Promise<void>;
}) {
  const { laeuft, meldung, ausfuehren } = useAktion();
  // Nach dem Verschieben kommt die Liste frisch; das Getraenk ueber die Id finden.
  const index = getraenke.findIndex((g) => g.id === getraenk.id);
  const aktuell = index >= 0 ? getraenke[index]! : getraenk;

  function verschieben(richtung: -1 | 1) {
    const neu = verschoben(getraenke, index, richtung);
    if (!neu) return;
    void ausfuehren(() => sortiereGetraenke(neu.map((g) => g.id)), () => neuLaden());
  }

  return (
    <View style={{ gap: 14 }}>
      <GetraenkFormular key={getraenk.id} vorhanden={getraenk} onErfolg={onErfolg} />
      <Meldung meldung={meldung} />
      <ListenGruppe>
        <Listenzeile
          titel="Weiter nach oben"
          pfeil={false}
          onPress={laeuft || index <= 0 ? undefined : () => verschieben(-1)}
        />
        <Listenzeile
          titel="Weiter nach unten"
          pfeil={false}
          onPress={laeuft || index >= getraenke.length - 1 ? undefined : () => verschieben(1)}
        />
        <Listenzeile
          titel={aktuell.active ? "Stilllegen" : "Wieder anbieten"}
          gefahr={aktuell.active}
          pfeil={false}
          onPress={laeuft ? undefined : () => void ausfuehren(() => schalteGetraenk(aktuell.id, !aktuell.active), onErfolg)}
        />
      </ListenGruppe>
    </View>
  );
}
