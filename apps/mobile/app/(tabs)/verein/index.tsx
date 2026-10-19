/**
 * /verein: weiter zum zuletzt gewaehlten Reiter, sonst zu den Getraenken.
 */

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { letzterVereinReiter, type VereinReiter } from "@/lib/verein";
import { useTheme } from "@/lib/theme";

export default function VereinStart() {
  const { farben, stil } = useTheme();
  const [ziel, setZiel] = useState<VereinReiter | null>(null);

  useEffect(() => {
    void letzterVereinReiter().then(setZiel);
  }, []);

  if (ziel) return <Redirect href={ziel} />;
  return (
    <View style={[stil.seite, { justifyContent: "center" }]}>
      <ActivityIndicator color={farben.blue} />
    </View>
  );
}
