/**
 * Die Weiche
 *
 * Entspricht apps/web/src/app/page.tsx: entscheidet nur, wohin es geht, und
 * zeigt selbst nichts an. Angemeldet geht es auf Home - bewusst /home und
 * nicht (tabs)/index.tsx, das mit dieser Datei um "/" konkurrieren wuerde.
 * Ist das Onboarding noch offen, geht es stattdessen nach /onboarding; bis
 * dahin sperrt die Datenbank ohnehin alles Vereinsweite.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { ladeIchSelbst } from "@/lib/daten";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

type Ziel = "/home" | "/onboarding" | "/anmelden";

export default function Start() {
  const { stil, farben } = useTheme();
  const [ziel, setZiel] = useState<Ziel | null>(null);

  useEffect(() => {
    let aktiv = true;

    async function entscheide(angemeldet: boolean) {
      if (!angemeldet) {
        if (aktiv) setZiel("/anmelden");
        return;
      }
      // Faellt das Lesen aus, geht es auf Home: die Tabs pruefen noch einmal,
      // und die Datenbank weist ein offenes Konto selbst ab.
      const ich = await ladeIchSelbst().catch(() => null);
      if (aktiv) setZiel(ich && !ich.onboardingErledigt ? "/onboarding" : "/home");
    }

    supabase.auth.getSession().then(({ data }) => entscheide(Boolean(data.session)));

    const { data: abo } = supabase.auth.onAuthStateChange((ereignis, sitzung) => {
      // Das erste Ereignis meldet nur die vorhandene Sitzung - die prueft getSession schon.
      if (ereignis === "INITIAL_SESSION") return;
      void entscheide(Boolean(sitzung));
    });

    return () => {
      aktiv = false;
      abo.subscription.unsubscribe();
    };
  }, []);

  if (!ziel) {
    return (
      <View style={[stil.seite, { justifyContent: "center" }]}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }

  return <Redirect href={ziel} />;
}
