/**
 * Das Buchungsblatt
 *
 * Bottom-Sheet nach dem Entwurf AppBuchen (docs/design/clubhaus, Abschnitt
 * 4): oben rund (radius.blatt), Griff, dahinter abgedunkelt. Dasselbe Blatt
 * fuer Buchen, Bearbeiten, Mitspielen, Stornieren und - abgesetzt unten -
 * fuer das Sperren durch Admins.
 *
 * Nur Darstellung. Ob gebucht werden darf, entscheidet create_booking; die
 * Startzeiten, die hier waehlbar sind, kommen aus canStartAt.
 *
 * Modal plus Animated, keine weitere Bibliothek: das Blatt faehrt von unten
 * herein, die Abdunklung blendet auf. Mit "Bewegung reduzieren" erscheint es
 * ohne Fahrt. onRequestClose faengt die Zurueck-Taste auf Android ab.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, Text, TextInput, View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, schrift } from "@tcm/ui";
import { Schalter, Segmente } from "@/components/Segmente";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";
import {
  alsUhrzeit, lokaleMinuten,
  type Belegung, type Buchungsart, type Fenster, type Mitglied,
} from "@/lib/plan";

interface Props {
  fenster: Fenster;
  arten: Buchungsart[];
  verzeichnis: Mitglied[];
  /** Eigene Mitglieds-Id, damit man sich nicht selbst als Mitspieler waehlt. */
  meineId: string | null;
  rasterMinuten: number;
  anzeigeMinuten: number;
  istAdmin: boolean;
  laeuft: boolean;
  /** Gastgebuehr je Gast in Cent. */
  gastgebuehrCents: number;
  /** Rueckmeldung der Datenbank, steht ueber dem Hauptknopf. */
  fehler: string | null;
  onBuchen: (
    courtId: string, start: number, typ: string, mitglieder: string[], gaeste: string[],
    sucheMitspieler: boolean,
  ) => void;
  onSpeichern: (bookingId: string, mitglieder: string[], gaeste: string[]) => void;
  onStornieren: (bookingId: string) => void;
  onAusschreiben: (bookingId: string, gesucht: boolean) => void;
  onBeitreten: (bookingId: string) => void;
  /** Gibt die Zahl der Buchungen zurueck, die verdraengt wuerden - sonst null. */
  onSperren: (courtId: string, von: number, bis: number, grund: string, verdraengen: boolean) => Promise<number | null>;
  onSchliessen: () => void;
}

/**
 * Gaeste haben keinen Namen - es geht um die Gebuehr und um den belegten Platz,
 * nicht um eine Gaesteliste. Die Datenbank verlangt einen nicht leeren
 * guest_name, also traegt jeder Gastplatz genau dieses Wort.
 */
const GAST = "Gast";

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

const TAG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC",
});
/** "Montag, 28.09." - der Tag kommt als JJJJ-MM-TT und wird mittags gelesen. */
const tagText = (tag: string) => TAG.format(new Date(`${tag}T12:00:00Z`));

const initialen = (vor?: string | null, nach?: string | null) =>
  `${(vor ?? "").charAt(0)}${(nach ?? "").charAt(0)}`.toUpperCase() || "?";

export function BuchungsFenster(props: Props) {
  const { farben } = useTheme();
  const rand = useSafeAreaInsets();
  const fahrt = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let ab = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((ruhig) => {
      if (!ab) return;
      if (ruhig) fahrt.setValue(0);
      else {
        Animated.timing(fahrt, {
          toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }).start();
      }
    });
    return () => {
      ab = false;
    };
  }, [fahrt]);

  function schliessen() {
    Animated.timing(fahrt, {
      toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => props.onSchliessen());
  }

  const f = props.fenster;
  const kicker = `${f.platzName} · ${tagText(f.tag)}`;

  return (
    <Modal visible transparent animationType="none" onRequestClose={schliessen} statusBarTranslucent>
      <Animated.View
        style={{
          position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
          backgroundColor: "rgba(3,8,14,.62)",
          opacity: fahrt.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={schliessen}
          accessibilityRole="button"
          accessibilityLabel="Blatt schließen"
        />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, justifyContent: "flex-end" }}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          style={{
            maxHeight: "92%",
            backgroundColor: farben.surf,
            borderTopLeftRadius: radius.blatt, borderTopRightRadius: radius.blatt,
            borderTopWidth: 1, borderColor: farben.line,
            paddingTop: 10, paddingHorizontal: 20, paddingBottom: 20 + rand.bottom,
            transform: [{ translateY: fahrt.interpolate({ inputRange: [0, 1], outputRange: [0, 800] }) }],
          }}
        >
          <View
            style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: farben.line2, alignSelf: "center" }}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 18, paddingTop: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {f.modus === "buchen" ? (
              <BuchenInhalt {...props} fenster={f} kicker={kicker} onZu={schliessen} />
            ) : (
              <VerwaltenInhalt {...props} fenster={f} kicker={kicker} onZu={schliessen} />
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* --- Kopf ----------------------------------------------------------------- */

function Kopf({ kicker, titel, onZu }: { kicker: string; titel: string; onZu: () => void }) {
  const { stil, farben } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={stil.kicker}>{kicker}</Text>
        <Text
          accessibilityRole="header"
          style={{
            marginTop: 4, fontFamily: "BarlowSemiCondensed_700Bold", fontSize: schrift.groesse.seitentitel,
            lineHeight: schrift.groesse.seitentitel, color: farben.ink, fontVariant: ["tabular-nums"],
          }}
        >
          {titel}
        </Text>
      </View>
      <Pressable
        onPress={onZu}
        accessibilityRole="button"
        accessibilityLabel="Schließen"
        hitSlop={4}
        style={{
          width: 44, height: 44, borderRadius: 22, backgroundColor: farben.surf2,
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M6 6l12 12M18 6 6 18" stroke={farben.ink2} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      </Pressable>
    </View>
  );
}

function Feldname({ children }: { children: ReactNode }) {
  const { farben } = useTheme();
  return (
    <Text style={{ marginBottom: 8, fontSize: 13, fontFamily: "Barlow_600SemiBold", color: farben.ink2 }}>
      {children}
    </Text>
  );
}

/* --- Knoepfe -------------------------------------------------------------- */

function Hauptknopf({ text, onPress, gesperrt }: { text: string; onPress: () => void; gesperrt?: boolean }) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={gesperrt}
      accessibilityRole="button"
      accessibilityState={{ disabled: gesperrt }}
      style={({ pressed }) => ({
        height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center",
        backgroundColor: farben.gold, opacity: gesperrt ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: farben.onGold, fontSize: 17, fontFamily: "Barlow_800ExtraBold" }}>{text}</Text>
    </Pressable>
  );
}

function Nebenknopf({
  text, onPress, gefahr, gesperrt, klein,
}: { text: string; onPress: () => void; gefahr?: boolean; gesperrt?: boolean; klein?: boolean }) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={gesperrt}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: klein ? 40 : 52, borderRadius: klein ? 20 : 16, paddingHorizontal: 16,
        alignItems: "center", justifyContent: "center",
        alignSelf: klein ? "flex-start" : "stretch",
        backgroundColor: gefahr ? "transparent" : farben.surf2,
        borderWidth: 1.5, borderColor: gefahr ? mitDeckkraft(farben.red, 0.4) : farben.line,
        opacity: gesperrt ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: gefahr ? farben.red : farben.ink, fontSize: klein ? 14 : 16, fontFamily: "Barlow_700Bold" }}>
        {text}
      </Text>
    </Pressable>
  );
}

function Fehlerzeile({ text }: { text: string | null }) {
  const { stil } = useTheme();
  if (!text) return null;
  return (
    <Text style={stil.hinweisFehler} accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}

function Fussnote({ children }: { children: ReactNode }) {
  const { farben } = useTheme();
  return (
    <Text style={{ textAlign: "center", fontSize: 12.5, color: farben.muted, fontFamily: "Barlow_400Regular", marginTop: -6 }}>
      {children}
    </Text>
  );
}

/** "Mitspieler gesucht" mit Erklaerung - ohne sie raet man, was das bewirkt. */
function GesuchtKarte({ an, onWechsel, deaktiviert }: { an: boolean; onWechsel: (an: boolean) => void; deaktiviert?: boolean }) {
  const { farben } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 14, padding: 16,
        borderRadius: 18, backgroundColor: farben.surf2,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontFamily: "Barlow_700Bold", color: farben.ink }}>Mitspieler gesucht</Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: farben.muted, marginTop: 2, fontFamily: "Barlow_400Regular" }}>
          Dein Spiel erscheint unter „Offene Spiele“. Wer mag, trägt sich selbst ein.
        </Text>
      </View>
      <Schalter an={an} onWechsel={onWechsel} beschriftung="Mitspieler gesucht" deaktiviert={deaktiviert} />
    </View>
  );
}

/* --- Buchen --------------------------------------------------------------- */

function BuchenInhalt(
  props: Props & { fenster: Extract<Fenster, { modus: "buchen" }>; kicker: string; onZu: () => void },
) {
  const f = props.fenster;

  const haelften = useMemo(() => {
    const out: number[] = [];
    for (let m = f.stunde; m < f.stunde + props.anzeigeMinuten; m += props.rasterMinuten) out.push(m);
    return out;
  }, [f.stunde, props.anzeigeMinuten, props.rasterMinuten]);

  const [start, setStart] = useState(
    f.startzeiten.includes(f.start) ? f.start : (f.startzeiten[0] ?? f.stunde),
  );
  const [art, setArt] = useState(props.arten[0]?.code ?? "einzel");
  const [mitglieder, setMitglieder] = useState<string[]>([]);
  const [gaeste, setGaeste] = useState<string[]>([]);
  const [sucht, setSucht] = useState(false);

  const gewaehlt = props.arten.find((a) => a.code === art);
  const dauer = gewaehlt?.duration_minutes ?? 60;
  const maxWeitere = Math.max((gewaehlt?.max_players ?? 2) - 1, 0);
  const anzahl = mitglieder.length + gaeste.length;
  const nochPlatz = anzahl < maxWeitere;
  // Wer Mitspieler sucht, darf unterbesetzt buchen - genau dafuer ist der
  // Schalter da. Die Datenbank sieht das ebenso.
  const pflichtVerletzt = Boolean(gewaehlt?.requires_partner) && anzahl === 0 && !sucht;
  const ich = props.verzeichnis.find((m) => m.id === props.meineId);

  const beginn = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Feldname>Beginn</Feldname>
      <Segmente
        beschriftung="Beginn"
        wert={start}
        onWahl={setStart}
        optionen={haelften.map((m) => ({
          wert: m, label: alsUhrzeit(m), deaktiviert: !f.startzeiten.includes(m),
        }))}
      />
    </View>
  );
  const spielform = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Feldname>Spielform</Feldname>
      <Segmente
        beschriftung="Spielform"
        wert={art}
        onWahl={(neu) => {
          setArt(neu);
          // Wer von Doppel auf Einzel wechselt, hat womoeglich zu viele Leute
          // eingetragen; die ueberzaehligen fallen hinten weg.
          const max = Math.max((props.arten.find((a) => a.code === neu)?.max_players ?? 2) - 1, 0);
          const m = mitglieder.slice(0, max);
          setMitglieder(m);
          setGaeste(gaeste.slice(0, Math.max(0, max - m.length)));
        }}
        optionen={props.arten.map((a) => ({ wert: a.code, label: a.name }))}
      />
    </View>
  );

  return (
    <>
      <Kopf kicker={props.kicker} titel={`${alsUhrzeit(start)} – ${alsUhrzeit(start + dauer)}`} onZu={props.onZu} />

      {/* Zwei Segmente nebeneinander, solange es je zwei Werte sind */}
      {haelften.length <= 2 && props.arten.length <= 2 ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          {beginn}
          {spielform}
        </View>
      ) : (
        <>
          {beginn}
          {spielform}
        </>
      )}

      {/* Sich selbst mitzunehmen weist die Datenbank ab - der Bucher zaehlt
          ohnehin mit. */}
      <Mitspieler
        kopf={{ initialen: initialen(ich?.first_name, ich?.last_name), name: "Du", gelb: true }}
        verzeichnis={props.verzeichnis.filter((m) => m.id !== props.meineId)}
        mitglieder={mitglieder}
        gaeste={gaeste}
        maxWeitere={maxWeitere}
        pflicht={Boolean(gewaehlt?.requires_partner) && !sucht}
        gastgebuehrCents={props.gastgebuehrCents}
        onMitglieder={setMitglieder}
        onGaeste={setGaeste}
      />

      {nochPlatz && <GesuchtKarte an={sucht} onWechsel={setSucht} />}

      <View style={{ gap: 10 }}>
        <Fehlerzeile text={props.fehler} />
        <Hauptknopf
          text={props.laeuft ? "Wird gebucht …" : `${props.fenster.platzName} buchen`}
          gesperrt={props.laeuft || pflichtVerletzt}
          onPress={() => props.onBuchen(f.courtId, start, art, mitglieder, gaeste, sucht)}
        />
        <Fussnote>
          {pflichtVerletzt
            ? `${gewaehlt?.name ?? "Diese Spielform"} braucht einen Mitspieler – oder schalte „Mitspieler gesucht“ ein.`
            : "Stornieren geht bis Spielbeginn"}
        </Fussnote>
      </View>

      {props.istAdmin && <SperrBereich {...props} />}
    </>
  );
}

/**
 * Sperren steht abgesetzt unter dem Buchen: es ist die Ausnahme, nicht der
 * Regelfall. Gesperrt wird der ganze Anzeigeblock, wie im Web.
 */
function SperrBereich(props: Props & { fenster: Extract<Fenster, { modus: "buchen" }> }) {
  const { stil, farben } = useTheme();
  const f = props.fenster;
  const [grund, setGrund] = useState<string | null>(null);
  const [kollisionen, setKollisionen] = useState<number | null>(null);
  const bis = f.stunde + props.anzeigeMinuten;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: farben.line, paddingTop: 16, gap: 10 }}>
      {grund === null ? (
        <Nebenknopf klein text="Stattdessen sperren" onPress={() => setGrund("")} />
      ) : (
        <>
          <Feldname>Grund der Sperrung</Feldname>
          <TextInput
            style={[stil.feld, { marginTop: -8 }]}
            value={grund}
            onChangeText={setGrund}
            placeholder="z. B. Platzpflege nach Regen"
            placeholderTextColor={farben.muted}
            accessibilityLabel="Grund der Sperrung"
          />
          <Text style={stil.leise}>
            Gesperrt wird {alsUhrzeit(f.stunde)}–{alsUhrzeit(bis)} Uhr auf {f.platzName}.
          </Text>
          <Nebenknopf
            gefahr={kollisionen !== null}
            gesperrt={props.laeuft || grund.trim() === ""}
            text={
              kollisionen === null
                ? "Sperren"
                : `${kollisionen} ${kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen`
            }
            onPress={async () => {
              const offen = await props.onSperren(f.courtId, f.stunde, bis, grund, kollisionen !== null);
              setKollisionen(offen);
            }}
          />
          <Nebenknopf
            klein
            text="Doch nicht"
            onPress={() => {
              setGrund(null);
              setKollisionen(null);
            }}
          />
        </>
      )}
    </View>
  );
}

/* --- Bearbeiten, Mitspielen, Stornieren ----------------------------------- */

function VerwaltenInhalt(
  props: Props & { fenster: Extract<Fenster, { modus: "verwalten" }>; kicker: string; onZu: () => void },
) {
  const { stil, farben } = useTheme();
  const b: Belegung = props.fenster.belegung;

  const [mitglieder, setMitglieder] = useState<string[]>(b.player_member_ids ?? []);
  const [gaeste, setGaeste] = useState<string[]>(b.guest_names ?? []);
  const [stornoOffen, setStornoOffen] = useState(false);

  const art = props.arten.find((a) => a.code === b.type_code);
  const maxWeitere = Math.max((art?.max_players ?? 4) - 1, 0);
  const nurStorno = b.kind === "blocking";

  // Drei Rollen an demselben Blatt: der Bucher verwaltet, ein Admin
  // verwaltet fremd, und wer nur eingeladen ist, kann ausschliesslich
  // mitspielen. Ohne diese Trennung koennte ein Fremder ueber die
  // Mitspielersuche die Besetzung des Buchers umwerfen.
  const darfVerwalten = b.is_own === true || props.istAdmin;
  const kannMitspielen =
    b.is_own !== true && b.bin_dabei !== true && b.partner_wanted === true && b.frei > 0;
  const geaendert =
    JSON.stringify([...mitglieder].sort()) !== JSON.stringify([...(b.player_member_ids ?? [])].sort()) ||
    JSON.stringify([...gaeste].sort()) !== JSON.stringify([...(b.guest_names ?? [])].sort());

  const [vorname, ...rest] = (b.owner_name ?? "").split(" ");
  const bucher = {
    initialen: initialen(vorname, rest.at(-1)),
    name: b.is_own ? "Du" : (b.owner_name ?? "Bucher"),
    gelb: b.is_own === true,
  };

  return (
    <>
      <Kopf
        kicker={props.kicker}
        titel={`${alsUhrzeit(lokaleMinuten(b.starts_at))} – ${alsUhrzeit(lokaleMinuten(b.ends_at))}`}
        onZu={props.onZu}
      />

      <View style={{ gap: 4, marginTop: -8 }}>
        <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold" }]}>
          {nurStorno
            ? `Gesperrt · ${b.title?.trim() || "ohne Grund"}`
            : `${b.series_id ? (b.title ?? b.type_name) : b.type_name} · gebucht von ${b.is_own ? "dir" : (b.owner_name ?? "unbekannt")}`}
        </Text>
        {props.istAdmin && !b.is_own && !nurStorno && (
          <Text style={stil.leise}>Du bearbeitest eine fremde Buchung als Administrator.</Text>
        )}
        {b.partner_wanted === true && b.frei > 0 && (
          <Text style={[stil.leise, { color: farben.goldInk, fontFamily: "Barlow_700Bold" }]}>
            Hier {b.frei === 1 ? "wird noch ein Mitspieler" : `werden noch ${b.frei} Mitspieler`} gesucht.
          </Text>
        )}
      </View>

      {!nurStorno && darfVerwalten && (
        <Mitspieler
          kopf={bucher}
          verzeichnis={props.verzeichnis.filter((m) => m.id !== b.owner_member_id)}
          mitglieder={mitglieder}
          gaeste={gaeste}
          maxWeitere={maxWeitere}
          pflicht={Boolean(art?.requires_partner) && b.partner_wanted !== true}
          gastgebuehrCents={props.gastgebuehrCents}
          onMitglieder={setMitglieder}
          onGaeste={setGaeste}
        />
      )}

      {!nurStorno && !darfVerwalten && (
        <View>
          <Feldname>Wer spielt mit?</Feldname>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Chip {...bucher} />
            {b.players.map((p, i) => {
              const [v, ...n] = p.split(" ");
              return <Chip key={`${p}${i}`} initialen={initialen(v, n.at(-1))} name={p} />;
            })}
            {Array.from({ length: b.frei }, (_, i) => (
              <Chip key={`frei${i}`} initialen="" name="frei" leer />
            ))}
          </View>
        </View>
      )}

      {!nurStorno && darfVerwalten && (b.frei > 0 || b.partner_wanted === true) && (
        <GesuchtKarte
          an={b.partner_wanted === true}
          deaktiviert={props.laeuft}
          onWechsel={(an) => props.onAusschreiben(b.booking_id, an)}
        />
      )}

      <View style={{ gap: 10 }}>
        <Fehlerzeile text={props.fehler} />

        {kannMitspielen && (
          <Hauptknopf
            text={props.laeuft ? "Wird eingetragen …" : "Mitspielen"}
            gesperrt={props.laeuft}
            onPress={() => props.onBeitreten(b.booking_id)}
          />
        )}

        {!nurStorno && darfVerwalten && geaendert && (
          <Hauptknopf
            text={props.laeuft ? "Wird gespeichert …" : "Mitspieler speichern"}
            gesperrt={props.laeuft}
            onPress={() => props.onSpeichern(b.booking_id, mitglieder, gaeste)}
          />
        )}

        {darfVerwalten && (
          <Nebenknopf
            gefahr
            gesperrt={props.laeuft}
            text={
              stornoOffen
                ? nurStorno ? "Wirklich aufheben" : "Wirklich stornieren"
                : nurStorno ? "Sperrung aufheben" : "Buchung stornieren"
            }
            onPress={() => (stornoOffen ? props.onStornieren(b.booking_id) : setStornoOffen(true))}
          />
        )}

        {b.is_own === true && !nurStorno && <Fussnote>Stornieren geht bis Spielbeginn</Fussnote>}
      </View>
    </>
  );
}

/* --- Wer spielt mit? ------------------------------------------------------ */

function Chip({
  initialen: kuerzel, name, gelb, gast, leer, onWeg, wegLabel,
}: {
  initialen: string; name: string; gelb?: boolean; gast?: boolean; leer?: boolean;
  onWeg?: () => void; wegLabel?: string;
}) {
  const { farben } = useTheme();
  return (
    <View
      style={{
        height: 40, borderRadius: 20, paddingLeft: 4, paddingRight: onWeg ? 4 : 14,
        flexDirection: "row", alignItems: "center", gap: 8,
        backgroundColor: leer ? "transparent" : farben.surf2,
        borderWidth: leer ? 1.5 : 0, borderStyle: "dashed", borderColor: farben.line2,
      }}
    >
      <View
        style={{
          width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
          backgroundColor: leer ? "transparent" : gelb ? farben.gold : gast ? farben.goldSoft : farben.brand,
        }}
      >
        <Text
          style={{
            fontSize: 12, fontFamily: "Barlow_700Bold",
            color: gelb ? farben.onGold : gast ? farben.goldInk : "#FFFFFF",
          }}
        >
          {kuerzel}
        </Text>
      </View>
      <Text
        style={{ fontSize: 14.5, fontFamily: "Barlow_600SemiBold", color: leer ? farben.muted : farben.ink }}
        numberOfLines={1}
      >
        {name}
      </Text>
      {onWeg && (
        <Pressable
          onPress={onWeg}
          accessibilityRole="button"
          accessibilityLabel={wegLabel}
          hitSlop={6}
          style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" }}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path d="M6 6l12 12M18 6 6 18" stroke={farben.ink2} strokeWidth={2.4} strokeLinecap="round" />
          </Svg>
        </Pressable>
      )}
    </View>
  );
}

const TREFFER_MAX = 6;

/**
 * Mitspieler durch Tippen finden - rund 300 Mitglieder sind als Auswahlliste
 * am Telefon unbenutzbar.
 *
 * Mitglieder kommen ueber "+ Mitglied" und die Suche, Gaeste ueber einen
 * eigenen Knopf: sie kosten Geld, und das soll eine bewusste Handlung sein
 * und kein Nebeneffekt davon, dass die Suche nichts gefunden hat.
 */
function Mitspieler({
  kopf, verzeichnis, mitglieder, gaeste, maxWeitere, pflicht, gastgebuehrCents,
  onMitglieder, onGaeste,
}: {
  /** Der Bucher, fest vorn */
  kopf: { initialen: string; name: string; gelb?: boolean };
  verzeichnis: Mitglied[];
  mitglieder: string[];
  gaeste: string[];
  maxWeitere: number;
  pflicht: boolean;
  gastgebuehrCents: number;
  onMitglieder: (ids: string[]) => void;
  onGaeste: (namen: string[]) => void;
}) {
  const { stil, farben } = useTheme();
  const [suchen, setSuchen] = useState(false);
  const [suche, setSuche] = useState("");

  const voll = mitglieder.length + gaeste.length >= maxWeitere;

  const gewaehlt = useMemo(
    () =>
      mitglieder
        .map((id) => verzeichnis.find((m) => m.id === id))
        .filter((m): m is Mitglied => Boolean(m)),
    [mitglieder, verzeichnis],
  );

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (q.length === 0) return [];
    return verzeichnis
      .filter((m) => !mitglieder.includes(m.id))
      .filter(
        (m) =>
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
          `${m.last_name} ${m.first_name}`.toLowerCase().includes(q),
      )
      .slice(0, TREFFER_MAX);
  }, [suche, verzeichnis, mitglieder]);

  const gestrichelt = {
    flex: 1, height: 46, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed" as const,
    borderColor: farben.line2, flexDirection: "row" as const, alignItems: "center" as const,
    justifyContent: "center" as const, gap: 6,
  };
  const plus = (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path d="M12 5v14M5 12h14" stroke={farben.ink} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );

  return (
    <View>
      <Feldname>Wer spielt mit?{pflicht ? " (mindestens eine Person)" : ""}</Feldname>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip {...kopf} />
        {gewaehlt.map((m) => (
          <Chip
            key={m.id}
            initialen={initialen(m.first_name, m.last_name)}
            name={`${m.first_name} ${m.last_name}`}
            onWeg={() => onMitglieder(mitglieder.filter((x) => x !== m.id))}
            wegLabel={`${m.first_name} ${m.last_name} entfernen`}
          />
        ))}
        {gaeste.map((g, i) => (
          <Chip
            key={`g${i}`}
            initialen="G"
            name={g}
            gast
            onWeg={() => onGaeste(gaeste.filter((_, k) => k !== i))}
            wegLabel={`Gast ${i + 1} entfernen`}
          />
        ))}
      </View>

      {voll ? (
        <Text style={[stil.leise, { marginTop: 10 }]}>Für diese Spielform sind alle Plätze besetzt.</Text>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Pressable
            style={gestrichelt}
            accessibilityRole="button"
            accessibilityState={{ expanded: suchen }}
            onPress={() => setSuchen(!suchen)}
          >
            {plus}
            <Text style={{ fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink }}>Mitglied</Text>
          </Pressable>
          <Pressable
            style={gestrichelt}
            accessibilityRole="button"
            accessibilityLabel={
              gastgebuehrCents > 0 ? `Gast hinzufügen, ${EURO.format(gastgebuehrCents / 100)}` : "Gast hinzufügen"
            }
            onPress={() => onGaeste([...gaeste, GAST])}
          >
            {plus}
            <Text style={{ fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink }}>
              {gastgebuehrCents > 0 ? `Gast · ${EURO.format(gastgebuehrCents / 100)}` : "Gast"}
            </Text>
          </Pressable>
        </View>
      )}

      {suchen && !voll && (
        <View style={{ gap: 6, marginTop: 10 }}>
          <TextInput
            style={stil.feld}
            value={suche}
            onChangeText={setSuche}
            placeholder="Namen tippen …"
            placeholderTextColor={farben.muted}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            accessibilityLabel="Mitspieler suchen"
          />
          {suche.trim().length > 0 &&
            (treffer.length === 0 ? (
              <Text style={stil.leise}>Niemand gefunden.</Text>
            ) : (
              treffer.map((m) => (
                <Pressable
                  key={m.id}
                  style={[stil.trefferzeile, { minHeight: 44, justifyContent: "center" }]}
                  accessibilityRole="button"
                  onPress={() => {
                    onMitglieder([...mitglieder, m.id]);
                    setSuche("");
                    setSuchen(false);
                  }}
                >
                  <Text style={stil.text}>{m.last_name}, {m.first_name}</Text>
                </Pressable>
              ))
            ))}
        </View>
      )}

      {gaeste.length > 0 && gastgebuehrCents > 0 && (
        <Text style={[stil.leise, { marginTop: 10 }]}>
          Für jeden Gast werden {EURO.format(gastgebuehrCents / 100)} berechnet und mit der
          nächsten Lastschrift eingezogen.
        </Text>
      )}
    </View>
  );
}
