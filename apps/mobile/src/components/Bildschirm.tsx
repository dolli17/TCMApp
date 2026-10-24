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
 *
 * Im Fluss verkuerzt die Leiste beim Erscheinen aber den Scrollbereich, und
 * was eben unten angetippt wurde, rutschte darunter weg - das erste "+" nahm
 * seine eigene Kachel aus dem Bild (U73). Bildschirm merkt sich deshalb, wo
 * zuletzt getippt wurde, und scrollt beim Erscheinen der Leiste so weit nach,
 * dass die Stelle sichtbar bleibt.
 *
 * Klebt der Reiter, zieht eine feine Linie die Grenze zum Inhalt darunter
 * (U74); in Ruhe steht er ohne. Tabellen, deren Kopf unter dem Reiter
 * mitkleben soll, holen sich Scrollstand und Masse aus useBildschirmScroll.
 */

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Animated, RefreshControl, View, type ScrollView } from "react-native";
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

/**
 * Fuer einen Kopf, der unter dem Reiter mitklebt: der Scrollstand (laeuft
 * ueber den nativen Treiber), wo der Inhalt im Scrollbereich beginnt und wie
 * hoch der Reiter ist.
 */
type BildschirmScroll = { scrollY: Animated.Value; inhaltOben: number; reiterHoehe: number };
const ScrollKontext = createContext<BildschirmScroll | null>(null);
export const useBildschirmScroll = () => useContext(ScrollKontext);

/** So viel Luft bleibt unter der zuletzt angetippten Stelle, wenn die Fussleiste erscheint. */
const LUFT_UEBER_FUSS = 40;

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
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollStand = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const fussRef = useRef<View>(null);
  const letzteBeruehrung = useRef<number | null>(null);
  const fussDa = useRef(false);
  const [kopfHoehe, setKopfHoehe] = useState(0);
  const [reiterHoehe, setReiterHoehe] = useState(0);
  const [inhaltOben, setInhaltOben] = useState(0);

  // Die Linie blendet ein, sobald der Kopf weggescrollt ist und der Reiter klebt.
  const linie = scrollY.interpolate({
    inputRange: [kopfHoehe - 1, kopfHoehe + 8],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const reiterFlaeche = (mitLinie: boolean) =>
    reiter ? (
      <View style={{ backgroundColor: farben.bg }} onLayout={(e) => setReiterHoehe(e.nativeEvent.layout.height)}>
        {reiter}
        {mitLinie && (
          <Animated.View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: farben.line2, opacity: linie }}
          />
        )}
      </View>
    ) : null;

  function merkeBeruehrung(e: { nativeEvent: { pageY: number } }) {
    letzteBeruehrung.current = e.nativeEvent.pageY;
  }

  /** Erscheint die Fussleiste, bleibt die zuletzt angetippte Stelle ueber ihr sichtbar (U73). */
  function fussGemessen() {
    if (fussDa.current) return;
    fussDa.current = true;
    const y = letzteBeruehrung.current;
    letzteBeruehrung.current = null;
    if (y === null) return;
    // Die Oberkante der Leiste ist die neue Unterkante des Scrollbereichs.
    fussRef.current?.measureInWindow((_x, fussOben) => {
      const fehlt = y + LUFT_UEBER_FUSS - fussOben;
      if (fehlt > 0) scrollRef.current?.scrollTo({ y: scrollStand.current + fehlt, animated: true });
    });
  }
  if (!fuss) fussDa.current = false;

  if (laedt) {
    return (
      <View style={seite}>
        {kopf}
        {reiterFlaeche(false)}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator color={farben.blue} />
        </View>
      </View>
    );
  }

  const inhalt = (
    <Animated.ScrollView
      ref={scrollRef}
      style={stil.seite}
      onTouchStart={merkeBeruehrung}
      onPointerDown={merkeBeruehrung}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
          scrollStand.current = e.nativeEvent.contentOffset.y;
        },
      })}
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
      {kopf && <View onLayout={(e) => setKopfHoehe(e.nativeEvent.layout.height)}>{kopf}</View>}
      {reiterFlaeche(true)}
      <Inhalt mitRand={Boolean(kopf || reiter)} onOben={setInhaltOben}>
        {/* Erneut versuchen tut dasselbe wie Herunterziehen (U3). */}
        {fehler && <Fehlerzeile text={fehler} onErneut={onAktualisieren} laeuft={aktualisiert} />}
        <ScrollKontext.Provider value={{ scrollY, inhaltOben, reiterHoehe }}>{children}</ScrollKontext.Provider>
      </Inhalt>
    </Animated.ScrollView>
  );

  if (!kopf && !reiter && !fuss) return inhalt;
  return (
    <View style={seite}>
      {inhalt}
      {fuss && (
        <View
          ref={fussRef}
          onLayout={fussGemessen}
          style={{ paddingHorizontal: LEISTE_RAND, paddingTop: abstand.s, paddingBottom: tabLeiste + 14 }}
        >
          {fuss}
        </View>
      )}
    </View>
  );
}

/** Ohne Kopf traegt der ScrollView selbst den Rand, mit Kopf diese Huelle. */
function Inhalt({
  mitRand, onOben, children,
}: { mitRand: boolean; onOben: (y: number) => void; children: ReactNode }) {
  const { stil } = useTheme();
  if (!mitRand) return <>{children}</>;
  return (
    <View style={[stil.inhalt, { paddingBottom: 0 }]} onLayout={(e) => onOben(e.nativeEvent.layout.y)}>
      {children}
    </View>
  );
}
