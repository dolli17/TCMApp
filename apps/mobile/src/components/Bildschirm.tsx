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
 *
 * Ist der grosse Titel weggescrollt, stand oben nichts mehr (U80). Wie unter
 * iOS blendet dann eine Kopfzeile mit dem Titel in klein ein; mit "Bewegung
 * reduzieren" ohne Uebergang. Den Titel meldet der Kopf ueber
 * useKompakterTitel (GrosserKopf tut das selbst). Ein Reiter klebt dann unter
 * der Kopfzeile statt am oberen Rand: er wird beim Einblenden um ihre Hoehe
 * nach unten geschoben, Kopfzeile und Reiter stehen als ein Block, die Linie
 * sitzt unter dem Reiter. Ohne Reiter traegt die Kopfzeile die Linie.
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo, ActivityIndicator, Animated, Easing, RefreshControl, Text, View, type ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { abstand } from "@tcm/ui";
import { INHALT_LUFT_UNTEN, LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE, LEISTE_RAND } from "@/lib/masse";
import { SCHRIFT_DECKEL } from "@/lib/schrift";
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
  /** Titel der Kopfzeile, wenn der Kopf keinen meldet (useKompakterTitel). */
  titel?: string;
};

/**
 * Fuer einen Kopf, der unter dem Reiter mitklebt: der Scrollstand (laeuft
 * ueber den nativen Treiber), wo der Inhalt im Scrollbereich beginnt und wie
 * hoch der Reiter ist - samt der Kopfzeile darueber, er klebt unter beiden.
 */
type BildschirmScroll = { scrollY: Animated.Value; inhaltOben: number; reiterHoehe: number };
const ScrollKontext = createContext<BildschirmScroll | null>(null);
export const useBildschirmScroll = () => useContext(ScrollKontext);

/** Der Titel fuer die Kopfzeile und wo der grosse Titel im Kopf endet. */
type KompakterTitel = { titel: string; unten?: number };
const TitelKontext = createContext<((t: KompakterTitel | null) => void) | null>(null);

/**
 * Meldet dem Bildschirm den Titel fuer die Kopfzeile (U80). unten ist die
 * Unterkante des grossen Titels im Kopf; fehlt sie, gilt das Ende des Kopfs.
 */
export function useKompakterTitel(titel: string | undefined, unten?: number) {
  const melde = useContext(TitelKontext);
  useEffect(() => {
    if (!melde || !titel) return;
    melde({ titel, unten });
    return () => melde(null);
  }, [melde, titel, unten]);
}

/** Hoehe der Kopfzeile, bis sie sich selbst gemessen hat. */
const KOPFZEILE = 44;

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
  titel,
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

  const [gemeldet, setKompakt] = useState<KompakterTitel | null>(null);
  const kompakt = gemeldet ?? (titel ? { titel } : null);
  const [zeileHoehe, setZeileHoehe] = useState(KOPFZEILE);
  const [zeileDa, setZeileDa] = useState(false);
  const zeileDaRef = useRef(false);
  const einblenden = useRef(new Animated.Value(0)).current;
  const ruhig = useRef(false);
  // Nur mit Kopf: ohne ihn gibt es keinen grossen Titel, der verschwinden koennte.
  const mitZeile = Boolean(kopf && kompakt);
  const zeile = mitZeile ? zeileHoehe : 0;
  // Die Kopfzeile erscheint, sobald der grosse Titel unter ihr liegt.
  const schwelle = useRef(0);
  schwelle.current = (kompakt?.unten ?? kopfHoehe) - zeileHoehe;

  useEffect(() => {
    let ab = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (ab) ruhig.current = r;
    });
    return () => {
      ab = false;
    };
  }, []);

  useEffect(() => {
    const ziel = zeileDa ? 1 : 0;
    if (ruhig.current) einblenden.setValue(ziel);
    else Animated.timing(einblenden, { toValue: ziel, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [zeileDa, einblenden]);

  function pruefeZeile(y: number) {
    const da = y > schwelle.current;
    if (da === zeileDaRef.current) return;
    zeileDaRef.current = da;
    setZeileDa(da);
  }

  // Die Linie blendet ein, sobald der Kopf weggescrollt ist und der Reiter
  // klebt - mit Kopfzeile schon um deren Hoehe frueher.
  const linie = scrollY.interpolate({
    inputRange: [kopfHoehe - zeile - 1, kopfHoehe - zeile + 8],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  // Der Reiter haelt unter der Kopfzeile an: im letzten Stueck bis zum
  // Kleben wandert er um ihre Hoehe nach unten mit.
  const reiterVersatz = mitZeile
    ? scrollY.interpolate({ inputRange: [kopfHoehe - zeile, kopfHoehe], outputRange: [0, zeile], extrapolate: "clamp" })
    : 0;
  const reiterFlaeche = (mitLinie: boolean) =>
    reiter ? (
      <Animated.View
        style={{ backgroundColor: farben.bg, zIndex: 1, transform: [{ translateY: mitLinie ? reiterVersatz : 0 }] }}
        onLayout={(e) => setReiterHoehe(e.nativeEvent.layout.height)}
      >
        {reiter}
        {mitLinie && (
          <Animated.View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: farben.line2, opacity: linie }}
          />
        )}
      </Animated.View>
    ) : null;

  const kopfzeile = mitZeile && (
    <Animated.View
      // Der grosse Titel bleibt die Ueberschrift fuer VoiceOver; die Zeile ist nur fuers Auge.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents={zeileDa ? "auto" : "none"}
      onLayout={(e) => setZeileHoehe(e.nativeEvent.layout.height)}
      style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 2, minHeight: KOPFZEILE,
        justifyContent: "center", paddingHorizontal: abstand.rand,
        backgroundColor: farben.bg, opacity: einblenden,
        borderBottomWidth: reiter ? 0 : 1, borderBottomColor: farben.line2,
      }}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={SCHRIFT_DECKEL.kopfzeile}
        style={{ textAlign: "center", fontSize: 17, fontFamily: "Barlow_700Bold", color: farben.ink }}
      >
        {kompakt?.titel}
      </Text>
    </Animated.View>
  );

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
        <TitelKontext.Provider value={setKompakt}>{kopf}</TitelKontext.Provider>
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
          if (mitZeile) pruefeZeile(e.nativeEvent.contentOffset.y);
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
        <ScrollKontext.Provider value={{ scrollY, inhaltOben, reiterHoehe: reiterHoehe + zeile }}>
          {children}
        </ScrollKontext.Provider>
      </Inhalt>
    </Animated.ScrollView>
  );

  if (!kopf && !reiter && !fuss) return inhalt;
  return (
    <View style={seite}>
      {/* Immer dieselbe Huelle: wechselte sie mit der Kopfzeile, finge der ScrollView neu an. */}
      <TitelKontext.Provider value={setKompakt}>
        <View style={{ flex: 1 }}>
          {inhalt}
          {kopfzeile}
        </View>
      </TitelKontext.Provider>
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
