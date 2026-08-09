/**
 * Die Weiche
 *
 * Entspricht apps/web/src/app/page.tsx: entscheidet nur, wohin es geht, und
 * zeigt selbst nichts an. Das frueher hier stehende Kachelmenue ist entfallen -
 * die Fussleiste ist das Menue.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

export default function Start() {
  const { stil, farben } = useTheme();
  const [pruefeSitzung, setPruefeSitzung] = useState(true);
  const [angemeldet, setAngemeldet] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAngemeldet(Boolean(data.session));
      setPruefeSitzung(false);
    });

    const { data: abo } = supabase.auth.onAuthStateChange((_ereignis, sitzung) => {
      setAngemeldet(Boolean(sitzung));
    });

    return () => abo.subscription.unsubscribe();
  }, []);

  if (pruefeSitzung) {
    return (
      <View style={[stil.seite, { justifyContent: "center" }]}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }

  return <Redirect href={angemeldet ? "/plaetze" : "/anmelden"} />;
}
