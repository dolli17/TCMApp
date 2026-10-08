/**
 * Die Art einer Forderung als kleine Marke (Nachbau von
 * apps/web/src/components/ArtMarke.tsx): Beitrag blau, Getraenke gold, der
 * Rest grau. Damit ist in jeder Liste auf einen Blick zu sehen, was eine
 * Forderung oder Lastschrift eigentlich einzieht.
 *
 * Bezeichnung und Farbe kommen aus @tcm/core (forderungen.ts) - eine Quelle
 * fuer Web und App.
 */

import { Text, View } from "react-native";
import { CHARGE_KIND_LABEL, CHARGE_KIND_TON, sortChargeKinds, type ChargeKindTon } from "@tcm/core";
import { useTheme } from "@/lib/theme";

export function ArtMarke({ art }: { art: string }) {
  const { farben } = useTheme();
  const [k] = sortChargeKinds([art]);
  if (!k) return null;
  const toene: Record<ChargeKindTon, { bg: string; ink: string }> = {
    blau: { bg: farben.blueSoft, ink: farben.blueInk },
    gold: { bg: farben.goldSoft, ink: farben.goldInk },
    grau: { bg: farben.chip, ink: farben.ink2 },
  };
  const t = toene[CHARGE_KIND_TON[k]];
  return (
    <View
      style={{
        alignSelf: "flex-start", height: 20, paddingHorizontal: 7, borderRadius: 10,
        backgroundColor: t.bg, justifyContent: "center",
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: "Barlow_700Bold", color: t.ink }}>
        {CHARGE_KIND_LABEL[k]}
      </Text>
    </View>
  );
}

/** Mehrere Arten nebeneinander, in Vereinsreihenfolge. */
export function ArtMarken({ arten }: { arten: readonly string[] | null | undefined }) {
  const sortiert = sortChargeKinds(arten);
  if (sortiert.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
      {sortiert.map((k) => (
        <ArtMarke key={k} art={k} />
      ))}
    </View>
  );
}
