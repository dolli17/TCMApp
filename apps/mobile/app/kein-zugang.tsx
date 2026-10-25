/**
 * Kein Zugang mehr (B22)
 *
 * Hierher leiten die Weiche und die Tabs, wer ausgetreten, archiviert oder
 * gesperrt ist. Die Datenbank liefert diesem Konto nichts mehr; statt leerer
 * Bildschirme steht hier, warum, und wie man den Vorstand erreicht. Beim
 * Oeffnen meldet der Bildschirm ab, damit der naechste Start bei der
 * Anmeldung beginnt. Entspricht apps/web/src/app/kein-zugang/page.tsx.
 */

import { useEffect } from "react";
import { Linking, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { KEIN_ZUGANG_KONTAKT, KEIN_ZUGANG_TITEL, keinZugangText, zugangsGrund } from "@tcm/core";
import { AnmeldeSeite, GelberKnopf, LeiserVerweis } from "@/components/AnmeldeSeite";
import { abmelden } from "@/lib/daten";
import { useTheme } from "@/lib/theme";
import { webLink } from "@/lib/web";

/** Der Kontakt steht im Impressum; ohne Adresse (lokal) fuehrt der Knopf zur Anmeldung. */
const KONTAKT = webLink("/impressum#kontakt");

export default function KeinZugang() {
  const { grund } = useLocalSearchParams<{ grund?: string }>();

  useEffect(() => {
    void abmelden().catch(() => undefined);
  }, []);

  const zurAnmeldung = () => router.replace("/anmelden");

  return (
    <AnmeldeSeite titel={KEIN_ZUGANG_TITEL} unterzeile={keinZugangText(zugangsGrund(grund))}>
      <Satz />
      <View style={{ marginTop: "auto", gap: 14 }}>
        {KONTAKT ? (
          <>
            <GelberKnopf text="Vorstand kontaktieren" onPress={() => void Linking.openURL(KONTAKT)} />
            <LeiserVerweis text="Mit einem anderen Konto anmelden" onPress={zurAnmeldung} />
          </>
        ) : (
          <GelberKnopf text="Zur Anmeldung" onPress={zurAnmeldung} />
        )}
      </View>
    </AnmeldeSeite>
  );
}

/** Eigene Komponente, weil sie useTheme innerhalb von ImmerDunkel lesen muss (wie AnmeldeHinweis). */
function Satz() {
  const { farben } = useTheme();
  return (
    <Text style={{ color: farben.ink2, fontSize: 16, lineHeight: 24, fontFamily: "Barlow_400Regular" }}>
      {KEIN_ZUGANG_KONTAKT} Du bist abgemeldet.
    </Text>
  );
}
