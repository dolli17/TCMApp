/**
 * Die Huelle jedes Bildschirms
 *
 * Nimmt dem einzelnen Screen den immer gleichen ScrollView ab und bringt das
 * Herunterziehen zum Nachladen mit. Bisher lud nur der Belegungsplan von selbst
 * nach; ueberall sonst standen nach der Rueckkehr aus einem anderen Tab die
 * Daten von vorhin.
 *
 * Der untere Abstand traegt die schwebende Leiste mit: sie liegt ueber dem
 * Inhalt, und ohne die Luft verschwaende die letzte Zeile jeder Liste
 * dahinter. Das Mass kommt aus derselben Datei wie die Leiste selbst -
 * useBottomTabBarHeight waere der direktere Weg, verlangt aber einen
 * Direktzugriff auf @react-navigation/bottom-tabs, das hier nur ueber
 * expo-router mitkommt und unter pnpm nicht aufloest.
 *
 * Der Kopf (GrosserKopf) scrollt mit dem Inhalt weg wie der grosse Titel
 * unter iOS (U53): Titel plus Segment standen vorher fest und nahmen mit der
 * schwebenden Leiste fast die Haelfte des Bildschirms. Fest bleibt nur der
 * Reiter (das Segment darunter) - als klebende Kopfzeile des Scrollbereichs.
 * Waehrend des ersten Ladens stehen beide still ueber dem Ladekreis.
 *
 * Eine Fussleiste (Eintragen, Buchen) liegt nicht ueber dem Inhalt, sondern
 * darunter im Fluss, direkt ueber der Tab-Leiste: so verschwindet nichts
 * dahinter, auch nicht das +/- der letzten sichtbaren Kachel.
 */

import type { ReactNode } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { abstand } from "@tcm/ui";
import { INHALT_LUFT_UNTEN, LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE, LEISTE_RAND } from "@/lib/masse";
import { useTheme } from "@/lib/theme";
import { Fehlerzeile } from "@/components/Fehlerzeile";

type Eigenschaften = {
  children: ReactNode;
  /** Erstes Laden: es gibt noch nichts anzuzeigen. */
  laedt?: boolean;
  aktualisiert?: boolean;
  onAktualisieren?: () => void;
  fehler?: string | null;
  /** Fuer Bildschirme ausserhalb der Tabs, etwa die Benachrichtigungen. */
  ohneFussleiste?: boolean;
  /** Scrollt oben mit, meist ein GrosserKopf. */
  kopf?: ReactNode;
  /** Bleibt beim Scrollen oben stehen, etwa die Segmente eines Bereichs. */
  reiter?: ReactNode;
  /** Liegt unter dem Scrollbereich ueber der Tab-Leiste. */
  fuss?: ReactNode;
};

export function Bildschirm({
  children,
  laedt = false,
  aktualisiert = false,
  onAktualisieren,
  fehler,
  ohneFussleiste = false,
  kopf,
  reiter,
  fuss,
}: Eigenschaften) {
  const { farben, stil } = useTheme();
  const rand = useSafeAreaInsets();
  const tabLeiste = LEISTE_HOEHE + LEISTE_ABSTAND_UNTEN + rand.bottom;
  const unten = fuss ? abstand.m : ohneFussleiste ? 40 : INHALT_LUFT_UNTEN + rand.bottom;
  // Mit Kopf zeichnet der Bildschirm den Sicherheitsabstand selbst: ein
  // fester Streifen, unter dem Titel und Reiter verschwinden.
  const seite = [stil.seite, kopf || reiter ? { paddingTop: rand.top } : null];
  const reiterFlaeche = reiter ? <View style={{ backgroundColor: farben.bg }}>{reiter}</View> : null;

  if (laedt) {
    return (
      <View style={seite}>
        {kopf}
        {reiterFlaeche}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator color={farben.blue} />
        </View>
      </View>
    );
  }

  const inhalt = (
    <ScrollView
      style={stil.seite}
      contentContainerStyle={kopf || reiter ? { paddingBottom: unten } : [stil.inhalt, { paddingBottom: unten }]}
      stickyHeaderIndices={reiter ? [kopf ? 1 : 0] : undefined}
      refreshControl={
        onAktualisieren ? (
          <RefreshControl
            refreshing={aktualisiert}
            onRefresh={onAktualisieren}
            tintColor={farben.blue}
            colors={[farben.blue]}
            progressBackgroundColor={farben.surf}
          />
        ) : undefined
      }
    >
      {kopf}
      {reiterFlaeche}
      <Inhalt mitRand={Boolean(kopf || reiter)}>
        {/* Erneut versuchen tut dasselbe wie Herunterziehen (U3). */}
        {fehler && <Fehlerzeile text={fehler} onErneut={onAktualisieren} laeuft={aktualisiert} />}
        {children}
      </Inhalt>
    </ScrollView>
  );

  if (!kopf && !reiter && !fuss) return inhalt;
  return (
    <View style={seite}>
      {inhalt}
      {fuss && (
        <View style={{ paddingHorizontal: LEISTE_RAND, paddingTop: abstand.s, paddingBottom: tabLeiste + 14 }}>
          {fuss}
        </View>
      )}
    </View>
  );
}

/** Ohne Kopf traegt der ScrollView selbst den Rand, mit Kopf diese Huelle. */
function Inhalt({ mitRand, children }: { mitRand: boolean; children: ReactNode }) {
  const { stil } = useTheme();
  if (!mitRand) return <>{children}</>;
  return <View style={[stil.inhalt, { paddingBottom: 0 }]}>{children}</View>;
}
