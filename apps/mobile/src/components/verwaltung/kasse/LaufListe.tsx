/**
 * Die Lastschriftlaeufe als Listenzeilen (Nachbau von
 * apps/web/src/components/LaufListe.tsx): je Lauf die Statusmarke und ein
 * kleiner Weg des Geldes - dieselbe Rechnung wie auf der Laufseite (debitFlow).
 */

import { Text, View } from "react-native";
import { debitFlow, isoDateLabel } from "@tcm/core";
import { GeldwegBalken } from "@/components/verwaltung/Geldweg";
import { LeereZeile, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { BetragMitMarke } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import type { Laeufe } from "@/lib/verwaltung/kasse";

export function LaufListe({ daten, heute }: { daten: Laeufe; heute: string }) {
  const { farben } = useTheme();
  const { laeufe, faelligAb } = daten;

  return (
    <ListenGruppe>
      {laeufe.length === 0 ? (
        <LeereZeile text="Es gibt noch keinen Lastschriftlauf." />
      ) : (
        laeufe.map((l) => {
          const weg = debitFlow({
            charges: {
              payers: l.kandidaten?.alle ?? 0,
              totalCents: 0,
              unannounced: 0,
              dueDate: l.kandidaten ? faelligAb : null,
            },
            batch: {
              status: l.status,
              collectionDate: l.collection_date,
              itemCount: l.item_count,
              readyPayers: l.kandidaten?.bereit ?? 0,
              returned: l.zurueck,
            },
            today: heute,
          });
          const nr = weg.steps.findIndex((s) => s.state === "aktuell") + 1;
          return (
            <Listenzeile
              key={l.id}
              href={`/verwaltung/kasse/lastschriften/${l.id}`}
              titel={l.title}
              kontext={
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular", fontVariant: ["tabular-nums"] }}>
                    Fällig {isoDateLabel(l.collection_date)} · {l.item_count}{" "}
                    {l.item_count === 1 ? "Lastschrift" : "Lastschriften"}
                    {l.zurueck > 0 ? ` · ${l.zurueck} zurück` : ""}
                  </Text>
                  <View
                    style={{ width: 110 }}
                    accessibilityLabel={nr > 0 ? `Schritt ${nr} von 5` : "abgeschlossen"}
                  >
                    <GeldwegBalken schritte={weg.steps} />
                  </View>
                </View>
              }
              neben={
                <BetragMitMarke cents={l.total_cents} marke={weg.label} ton={weg.current === null ? "gruen" : "gelb"} />
              }
            />
          );
        })
      )}
    </ListenGruppe>
  );
}
