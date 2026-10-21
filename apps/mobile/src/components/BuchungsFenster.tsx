/**
 * Das Buchungsblatt
 *
 * Bottom-Sheet nach dem Entwurf AppBuchen (docs/design/clubhaus, Abschnitt
 * 4): oben rund (radius.blatt), Griff, dahinter abgedunkelt. Dasselbe Blatt
 * fuer Buchen, Bearbeiten, Mitspielen, Stornieren und - abgesetzt unten -
 * fuer das Sperren mit Platzrechten. Eine Sperrung laesst sich hier auch
 * bearbeiten (Zeit, Plaetze, Kategorie, Grund) und aufheben.
 *
 * Nur Darstellung. Ob gebucht werden darf, entscheidet create_booking; die
 * Startzeiten, die hier waehlbar sind, kommen aus canStartAt.
 *
 * Das Blatt selbst (Fahrt, Abdunklung, Griff) steht in Blatt.tsx.
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  blockingLabel, bookingActions, bookingTypeInfo, checkPlayers, umsetzZiele, type OccupiedSlot,
} from "@tcm/core";
import { Blatt, BlattKopf } from "@/components/Blatt";
import { Schalter, Segmente } from "@/components/Segmente";
import { Chipwahl } from "@/components/verwaltung/Formular";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";
import {
  alsUhrzeit, lokaleMinuten, sperrZeit,
  type Belegung, type Blockungsart, type Buchungsart, type Fenster, type Mitglied,
} from "@/lib/plan";

interface Props {
  fenster: Fenster;
  /** Die aktiven Plaetze - Ziele beim Umsetzen. */
  plaetze: { id: string; name: string; short_name: string }[];
  /** Die Tage, die der Plan anbietet (JJJJ-MM-TT) - auch die fuers Umsetzen. */
  tage: string[];
  /** Belegung des Tages im Plan; fuer andere Tage laedt das Blatt selbst nach. */
  belegung: Belegung[];
  oeffnungMinuten: number;
  schlussMinuten: number;
  arten: Buchungsart[];
  /** Kategorien einer Sperrung, die erste ist die Vorgabe. */
  blockungsarten: Blockungsart[];
  verzeichnis: Mitglied[];
  /** Eigene Mitglieds-Id, damit man sich nicht selbst als Mitspieler waehlt. */
  meineId: string | null;
  rasterMinuten: number;
  anzeigeMinuten: number;
  /** Vorstand, App Admin oder Platzwart: sperren und fremde Buchungen verwalten. */
  darfPlaetze: boolean;
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
  onStornieren: (bookingId: string, grund?: string) => void;
  /** Ein einzelner Serientermin faellt aus, die Serie bleibt. */
  onTerminAbsagen: (bookingId: string, grund?: string) => void;
  /** Auf einen anderen Platz, Tag oder Beginn - nur mit Platzrechten. */
  onUmsetzen: (bookingId: string, courtId: string, tag: string, minute: number, grund?: string) => void;
  /** Belegung eines anderen Tages, fuer das Umsetzen dorthin. */
  onTagLaden: (tag: string) => Promise<TagesBelegung[]>;
  onAusschreiben: (bookingId: string, gesucht: boolean) => void;
  onBeitreten: (bookingId: string) => void;
  /** Gibt die Zahl der Buchungen zurueck, die verdraengt wuerden - sonst null. */
  onSperren: (
    courtId: string, von: number, bis: number, typCode: string, grund: string, verdraengen: boolean,
  ) => Promise<number | null>;
  /** Wie onSperren, fuer eine bestehende Sperrung. Minuten am Tag des Plans. */
  onSperreAendern: (
    bookingId: string, platzIds: string[], von: number, bis: number, typCode: string, grund: string,
    verdraengen: boolean,
  ) => Promise<number | null>;
  onSperreAufheben: (bookingId: string) => void;
  onSchliessen: () => void;
}

/** Was an einem Tag belegt ist - genug fuer umsetzZiele. */
type TagesBelegung = OccupiedSlot & { booking_id: string };

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
  const f = props.fenster;
  const kicker = `${f.platzName} · ${tagText(f.tag)}`;

  return (
    <Blatt onSchliessen={props.onSchliessen}>
      {(schliessen) =>
        f.modus === "buchen" ? (
          <BuchenInhalt {...props} fenster={f} kicker={kicker} onZu={schliessen} />
        ) : (
          <VerwaltenInhalt {...props} fenster={f} kicker={kicker} onZu={schliessen} />
        )
      }
    </Blatt>
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
        // Mindesthoehe statt fester Hoehe: mit grosser Schrift bricht der Text um.
        minHeight: 58, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18,
        alignItems: "center", justifyContent: "center",
        backgroundColor: farben.gold, opacity: gesperrt ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: farben.onGold, fontSize: 17, fontFamily: "Barlow_800ExtraBold", textAlign: "center" }}>{text}</Text>
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
        minHeight: klein ? 40 : 52, borderRadius: klein ? 20 : 16, paddingHorizontal: 16, paddingVertical: 6,
        alignItems: "center", justifyContent: "center",
        alignSelf: klein ? "flex-start" : "stretch",
        backgroundColor: gefahr ? "transparent" : farben.surf2,
        borderWidth: 1.5, borderColor: gefahr ? mitDeckkraft(farben.red, 0.4) : farben.line,
        opacity: gesperrt ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: gefahr ? farben.red : farben.ink, fontSize: klein ? 14 : 16, fontFamily: "Barlow_700Bold", textAlign: "center" }}>
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
  // Dieselbe Besetzungsregel wie create_booking: ein Doppel braucht drei
  // Spieler, wer Mitspieler sucht, darf unterbesetzt buchen - genau dafuer ist
  // der Schalter da.
  const besetzung = gewaehlt
    ? checkPlayers(bookingTypeInfo(gewaehlt), mitglieder.length, gaeste.length, sucht && nochPlatz)
    : null;
  const besetzungFehlt = besetzung !== null && !besetzung.ok ? besetzung.reason : null;
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
      <BlattKopf zahlen kicker={props.kicker} titel={`${alsUhrzeit(start)} – ${alsUhrzeit(start + dauer)}`} onZu={props.onZu} />

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
          gesperrt={props.laeuft || besetzungFehlt !== null}
          onPress={() => props.onBuchen(f.courtId, start, art, mitglieder, gaeste, sucht)}
        />
        <Fussnote>
          {besetzungFehlt
            ? `${besetzungFehlt}${nochPlatz ? " Oder schalte „Mitspieler gesucht“ ein." : ""}`
            : "Stornieren geht bis Spielbeginn"}
        </Fussnote>
      </View>

      {props.darfPlaetze && <SperrBereich {...props} />}
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
  // Vorgabe bleibt die Platzpflege, wie vor der Kategoriewahl; sonst die erste.
  const [art, setArt] = useState(
    props.blockungsarten.find((a) => a.code === "platzpflege")?.code ?? props.blockungsarten[0]?.code ?? "platzpflege",
  );
  const [kollisionen, setKollisionen] = useState<number | null>(null);
  const bis = f.stunde + props.anzeigeMinuten;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: farben.line, paddingTop: 16, gap: 10 }}>
      {grund === null ? (
        <Nebenknopf klein text="Stattdessen sperren" onPress={() => setGrund("")} />
      ) : (
        <>
          <View>
            <Feldname>Kategorie</Feldname>
            <Chipwahl
              optionen={props.blockungsarten.map((a) => ({ wert: a.code, label: a.name }))}
              wert={art}
              onWahl={(neu) => {
                setArt(neu);
                setKollisionen(null);
              }}
            />
          </View>
          <View>
            <Feldname>Grund (freiwillig)</Feldname>
            <TextInput
              style={stil.feld}
              value={grund}
              onChangeText={setGrund}
              placeholder="z. B. nach Regen"
              placeholderTextColor={farben.muted}
              accessibilityLabel="Grund der Sperrung, freiwillig"
            />
          </View>
          <Text style={stil.leise}>
            Gesperrt wird {alsUhrzeit(f.stunde)}–{alsUhrzeit(bis)} Uhr auf {f.platzName}.
          </Text>
          <Nebenknopf
            gefahr={kollisionen !== null}
            gesperrt={props.laeuft}
            text={
              kollisionen === null
                ? "Sperren"
                : `${kollisionen} ${kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen`
            }
            onPress={async () => {
              const offen = await props.onSperren(f.courtId, f.stunde, bis, art, grund, kollisionen !== null);
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
  const [umsetzOffen, setUmsetzOffen] = useState(false);
  const [bearbeitenOffen, setBearbeitenOffen] = useState(false);
  const [grund, setGrund] = useState("");

  const art = props.arten.find((a) => a.code === b.type_code);
  const maxWeitere = Math.max((art?.max_players ?? 4) - 1, 0);
  const nurStorno = b.kind === "blocking";
  // Serientermine (Training) legt die Datenbank als Blockung an. Abgesagt
  // werden sie ueber cancel_series_occurrence - nicht per Storno.
  const serientermin = Boolean(b.series_id);
  // Umsetzen nur fuer normale Buchungen, die noch nicht vorbei sind - so eng
  // wie move_booking. Sperrungen und Serientermine haben eigene Wege.
  const kannUmsetzen =
    props.darfPlaetze && b.kind === "booking" && !serientermin &&
    new Date(b.ends_at).getTime() > Date.now();
  // Eine Sperrung aendert, wer sperren darf (update_blocking). Serientermine
  // gehoeren zur Serie und werden dort geaendert.
  const kannSperreAendern = props.darfPlaetze && nurStorno && !serientermin;
  const sperre = blockingLabel(b);

  // Drei Rollen an demselben Blatt: der Bucher verwaltet, wer
  // Platzrechte hat, verwaltet fremd, und wer nur eingeladen ist, kann ausschliesslich
  // mitspielen. Ohne diese Trennung koennte ein Fremder ueber die
  // Mitspielersuche die Besetzung des Buchers umwerfen. Ab Spielbeginn
  // bleibt nur, wer Platzrechte hat - so eng wie die RPCs (bookingActions).
  const [jetzt] = useState(() => new Date());
  const laeuftSchon = new Date(b.starts_at).getTime() <= jetzt.getTime();
  const darf = bookingActions({
    startsAt: b.starts_at,
    own: b.is_own === true,
    joined: b.bin_dabei === true,
    partnerWanted: b.partner_wanted === true,
    free: b.frei,
    managesCourts: props.darfPlaetze,
    now: jetzt,
  });
  const darfVerwalten = darf.cancel;
  // Ein Serientermin faellt aus, eine Blockung wird aufgehoben, eine fremde
  // Buchung wird storniert - wie im Web. Nur beim Storno einer fremden Buchung
  // ist ein Grund Pflicht: dort sitzt jemand, der eine Erklaerung verdient.
  // Hinter einer Blockung sitzt niemand.
  const grundNoetig = props.darfPlaetze && b.is_own !== true && b.kind === "booking";
  const grundFeld = darfVerwalten && stornoOffen && (serientermin || !nurStorno);
  const kannMitspielen = darf.join;
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
      <BlattKopf
        zahlen
        kicker={props.kicker}
        titel={`${alsUhrzeit(lokaleMinuten(b.starts_at))} – ${alsUhrzeit(lokaleMinuten(b.ends_at))}`}
        onZu={props.onZu}
      />

      <View style={{ gap: 4, marginTop: -8 }}>
        <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold" }]}>
          {serientermin
            ? `${b.title?.trim() || b.type_name} · Serientermin`
            : nurStorno
              ? `Gesperrt · ${sperre.kategorie}`
              : `${b.type_name} · gebucht von ${b.is_own ? "dir" : (b.owner_name ?? "unbekannt")}`}
        </Text>
        {nurStorno && !serientermin && sperre.grund && <Text style={stil.leise}>{sperre.grund}</Text>}
        {props.darfPlaetze && !b.is_own && !nurStorno && (
          <Text style={stil.leise}>Du bearbeitest eine fremde Buchung mit Platzrechten.</Text>
        )}
        {laeuftSchon && (
          <Text style={stil.leise}>Die Spielzeit läuft bereits – Änderungen nur mit Platzrechten.</Text>
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

      {bearbeitenOffen && kannSperreAendern ? (
        <SperreBearbeiten {...props} sperre={b} onZurueck={() => setBearbeitenOffen(false)} />
      ) : (
      <View style={{ gap: 10 }}>
        {/* Beim Umsetzen steht der Fehler dort, wo getippt wurde. */}
        <Fehlerzeile text={umsetzOffen ? null : props.fehler} />

        {kannSperreAendern && !stornoOffen && (
          <Hauptknopf
            text="Sperrung bearbeiten"
            gesperrt={props.laeuft}
            onPress={() => setBearbeitenOffen(true)}
          />
        )}

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

        {grundFeld && (
          <View>
            <Feldname>{grundNoetig ? "Grund" : "Grund (freiwillig)"}</Feldname>
            <TextInput
              style={[stil.feld, { marginTop: -8 }]}
              value={grund}
              onChangeText={setGrund}
              placeholder={serientermin ? "z. B. Ferien" : "Steht in der Nachricht an die Betroffenen"}
              placeholderTextColor={farben.muted}
              accessibilityLabel="Grund"
            />
          </View>
        )}

        {darfVerwalten && (
          <Nebenknopf
            gefahr
            gesperrt={props.laeuft || (stornoOffen && grundNoetig && grund.trim() === "")}
            text={
              stornoOffen
                ? serientermin ? "Termin wirklich absagen" : nurStorno ? "Wirklich aufheben" : "Wirklich stornieren"
                : serientermin ? "Fällt diese Woche aus" : nurStorno ? "Sperrung aufheben" : "Buchung stornieren"
            }
            onPress={() => {
              if (!stornoOffen) {
                setStornoOffen(true);
                setUmsetzOffen(false);
              }
              else if (serientermin) props.onTerminAbsagen(b.booking_id, grund);
              else if (nurStorno) props.onSperreAufheben(b.booking_id);
              else props.onStornieren(b.booking_id, grund);
            }}
          />
        )}

        {b.is_own === true && !nurStorno && !laeuftSchon && <Fussnote>Stornieren geht bis Spielbeginn</Fussnote>}
      </View>
      )}

      {/* Abgesetzt wie das Sperren: Umsetzen ist die Ausnahme, wenn ein Platz
          ausfaellt - nicht das, was man an einer Buchung gewoehnlich tut. */}
      {kannUmsetzen && (
        <View style={{ borderTopWidth: 1, borderTopColor: farben.line, paddingTop: 16, gap: 10 }}>
          {umsetzOffen ? (
            <UmsetzBereich {...props} onZurueck={() => setUmsetzOffen(false)} />
          ) : (
            <Nebenknopf
              klein
              text="Umsetzen"
              onPress={() => {
                setUmsetzOffen(true);
                setStornoOffen(false);
              }}
            />
          )}
        </View>
      )}
    </>
  );
}

/* --- Sperrung bearbeiten ------------------------------------------------- */

/**
 * Zeit, Plaetze, Kategorie und Grund einer Sperrung - wie beim Sperren
 * zweistufig: liegen Buchungen im Weg, nennt der erste Versuch ihre Zahl,
 * und erst der zweite verdraengt sie. Der Tag bleibt der des Plans.
 */
function SperreBearbeiten(
  props: Props & { sperre: Belegung; onZurueck: () => void },
) {
  const { stil, farben } = useTheme();
  const b = props.sperre;
  const anfang = sperrZeit(b);
  const [plaetze, setPlaetze] = useState<string[]>([b.court_id]);
  const [von, setVon] = useState(anfang.von);
  const [bis, setBis] = useState(anfang.bis);
  // Eine abgeschaltete Kategorie bleibt waehlbar, solange die Sperrung sie traegt.
  const [art, setArt] = useState(b.type_code ?? props.blockungsarten[0]?.code ?? "platzpflege");
  const [grund, setGrund] = useState(b.title?.trim() ?? "");
  const [kollisionen, setKollisionen] = useState<number | null>(null);

  const arten = props.blockungsarten.some((a) => a.code === b.type_code) || !b.type_code
    ? props.blockungsarten
    : [{ code: b.type_code, name: b.type_name ?? b.type_code }, ...props.blockungsarten];
  const schritt = props.rasterMinuten;

  /** Jede Aenderung macht eine alte Kollisionszahl ungueltig. */
  function neu<T>(setzen: (w: T) => void) {
    return (w: T) => {
      setzen(w);
      setKollisionen(null);
    };
  }

  return (
    <View style={{ gap: 16 }}>
      <View>
        <Feldname>Plätze</Feldname>
        <Chipwahl
          mehrfach
          optionen={props.plaetze.map((p) => ({ wert: p.id, label: p.name }))}
          wert={plaetze}
          onWahl={(id) =>
            neu(setPlaetze)(plaetze.includes(id) ? plaetze.filter((x) => x !== id) : [...plaetze, id])}
        />
      </View>

      <View style={{ gap: 8 }}>
        <Feldname>Zeit</Feldname>
        <Zeitschritt
          name="Von" minute={von} schritt={schritt}
          min={0} max={bis - schritt} onWert={neu(setVon)}
        />
        <Zeitschritt
          name="Bis" minute={bis} schritt={schritt}
          min={von + schritt} max={24 * 60} onWert={neu(setBis)}
        />
      </View>

      <View>
        <Feldname>Kategorie</Feldname>
        <Chipwahl
          optionen={arten.map((a) => ({ wert: a.code, label: a.name }))}
          wert={art}
          onWahl={neu(setArt)}
        />
      </View>

      <View>
        <Feldname>Grund (freiwillig)</Feldname>
        <TextInput
          style={stil.feld}
          value={grund}
          onChangeText={setGrund}
          placeholder="z. B. nach Regen"
          placeholderTextColor={farben.muted}
          accessibilityLabel="Grund der Sperrung, freiwillig"
        />
      </View>

      <View style={{ gap: 10 }}>
        <Fehlerzeile text={props.fehler} />
        {kollisionen !== null && (
          <Text style={stil.leise}>
            {kollisionen === 1
              ? "1 Buchung liegt im Weg. Sie wird abgesagt, die Mitglieder bekommen Bescheid."
              : `${kollisionen} Buchungen liegen im Weg. Sie werden abgesagt, die Mitglieder bekommen Bescheid.`}
          </Text>
        )}
        {kollisionen === null ? (
          <Hauptknopf
            text={props.laeuft ? "Wird gespeichert …" : "Änderungen speichern"}
            gesperrt={props.laeuft || plaetze.length === 0}
            onPress={async () =>
              setKollisionen(await props.onSperreAendern(b.booking_id, plaetze, von, bis, art, grund, false))}
          />
        ) : (
          <Nebenknopf
            gefahr
            gesperrt={props.laeuft}
            text={`${kollisionen} ${kollisionen === 1 ? "Buchung" : "Buchungen"} verdrängen`}
            onPress={async () =>
              setKollisionen(await props.onSperreAendern(b.booking_id, plaetze, von, bis, art, grund, true))}
          />
        )}
        <Nebenknopf klein text="Doch nicht" onPress={props.onZurueck} />
      </View>
    </View>
  );
}

/** Eine Uhrzeit mit Minus und Plus, im Raster des Plans. */
function Zeitschritt({
  name, minute, schritt, min, max, onWert,
}: {
  name: string;
  minute: number;
  schritt: number;
  min: number;
  max: number;
  onWert: (m: number) => void;
}) {
  const { farben } = useTheme();
  const runter = () => minute - schritt >= min && onWert(minute - schritt);
  const hoch = () => minute + schritt <= max && onWert(minute + schritt);
  const knopf = (zeichen: "−" | "+", aus: boolean, onPress: () => void, label: string) => (
    <Pressable
      onPress={onPress}
      disabled={aus}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: aus }}
      style={({ pressed }) => ({
        width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
        backgroundColor: farben.surf3, opacity: aus ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: 22, lineHeight: 24, fontFamily: "Barlow_700Bold", color: farben.ink }}>{zeichen}</Text>
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, padding: 6, paddingLeft: 16,
        borderRadius: 18, backgroundColor: farben.surf2,
      }}
    >
      <Text style={{ flex: 1, fontSize: 15, fontFamily: "Barlow_600SemiBold", color: farben.ink2 }}>{name}</Text>
      {knopf("−", minute - schritt < min, runter, `${name} ${schritt} Minuten früher`)}
      <Text
        accessibilityLabel={`${name} ${alsUhrzeit(minute)} Uhr`}
        style={{
          minWidth: 64, textAlign: "center", fontSize: 20, fontFamily: "BarlowSemiCondensed_700Bold",
          color: farben.ink, fontVariant: ["tabular-nums"],
        }}
      >
        {alsUhrzeit(minute)}
      </Text>
      {knopf("+", minute + schritt > max, hoch, `${name} ${schritt} Minuten später`)}
    </View>
  );
}

/* --- Umsetzen ------------------------------------------------------------- */

const berlinTag = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

/** Fuer die Tageskachel: "MO" und "28" */
function kachel(tag: string): { wochentag: string; zahl: number } {
  const d = new Date(`${tag}T12:00:00Z`);
  const wochentag = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(d);
  return { wochentag: wochentag.replace(".", "").toUpperCase(), zahl: d.getUTCDate() };
}

/**
 * Wohin mit der Buchung? Platz, Tag und Beginn - wie im Web.
 *
 * Was waehlbar ist, rechnet umsetzZiele (@tcm/core) aus der Belegung des
 * Zieltags; fuer einen anderen Tag als den im Plan wird day_schedule
 * nachgeladen. Eine laufende Buchung wechselt nur den Platz - dann gibt es
 * keinen Tag zu waehlen und als Beginn nur den, der schon gilt.
 */
function UmsetzBereich(
  props: Props & { fenster: Extract<Fenster, { modus: "verwalten" }>; onZurueck: () => void },
) {
  const { stil, farben } = useTheme();
  const b = props.fenster.belegung;
  const planTag = props.fenster.tag;
  // Einmal beim Aufklappen: die Uhr soll nicht unter dem Finger Ziele wegnehmen.
  const [jetzt] = useState(() => new Date());
  const laeuftSchon = new Date(b.starts_at).getTime() <= jetzt.getTime();

  const [tag, setTag] = useState(planTag);
  const [andererTag, setAndererTag] = useState<{ tag: string; belegung: TagesBelegung[] } | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [platzWahl, setPlatzWahl] = useState<string | null>(null);
  const [minuteWahl, setMinuteWahl] = useState<number | null>(null);
  const [grund, setGrund] = useState("");
  // Nur die letzte Anfrage zaehlt, wenn schnell durch die Tage getippt wird.
  const angefragt = useRef(planTag);

  async function tagWaehlen(neu: string) {
    setTag(neu);
    setLadeFehler(null);
    angefragt.current = neu;
    if (neu === planTag) return;
    try {
      const belegung = await props.onTagLaden(neu);
      if (angefragt.current === neu) setAndererTag({ tag: neu, belegung });
    } catch (f) {
      if (angefragt.current === neu) setLadeFehler((f as Error).message);
    }
  }

  const belegung: readonly TagesBelegung[] | null =
    tag === planTag ? props.belegung : andererTag?.tag === tag ? andererTag.belegung : null;

  const ziele = useMemo(
    () =>
      belegung
        ? umsetzZiele({
            booking: b,
            day: tag,
            courtIds: props.plaetze.map((p) => p.id),
            openingMinutes: props.oeffnungMinuten,
            closingMinutes: props.schlussMinuten,
            slotMinutes: props.rasterMinuten,
            occupied: belegung,
            now: jetzt,
          })
        : [],
    [b, belegung, tag, props.plaetze, props.oeffnungMinuten, props.schlussMinuten, props.rasterMinuten, jetzt],
  );

  // Die Wahl bleibt, solange sie noch ein Ziel ist; sonst rueckt die naechste
  // nach. Vorgewaehlt wird ein anderer Platz zur selben Zeit - der Regelfall,
  // wenn ein Platz unter Wasser steht.
  const mitZiel = props.plaetze.filter((p) => ziele.some((z) => z.courtId === p.id));
  const platz =
    mitZiel.find((p) => p.id === platzWahl) ??
    mitZiel.find((p) => p.id !== b.court_id) ??
    mitZiel[0];
  const zeiten = ziele.filter((z) => z.courtId === platz?.id).map((z) => z.minute);
  const eigeneMinute = lokaleMinuten(b.starts_at);
  const minute =
    minuteWahl !== null && zeiten.includes(minuteWahl)
      ? minuteWahl
      : zeiten.includes(eigeneMinute) ? eigeneMinute : (zeiten[0] ?? null);
  const dauer = lokaleMinuten(b.ends_at) - eigeneMinute;

  const grundNoetig = b.is_own !== true;
  const bereit = platz !== undefined && minute !== null && !(grundNoetig && grund.trim() === "");
  // Der Tag der Buchung steht immer zur Wahl, auch wenn er vor heute laege.
  const tage = [...new Set([planTag, ...props.tage])].filter((t) => t >= berlinTag(jetzt)).sort();

  return (
    <>
      {laeuftSchon ? (
        <Text style={stil.leise}>Die Buchung läuft schon – sie kann nur noch den Platz wechseln.</Text>
      ) : (
        <View>
          <Feldname>Tag</Feldname>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {tage.map((t) => {
              const aktiv = t === tag;
              const k = kachel(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => void tagWaehlen(t)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: aktiv }}
                  accessibilityLabel={tagText(t)}
                  style={{
                    width: 50, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 1,
                    backgroundColor: aktiv ? farben.gold : farben.surf2,
                  }}
                >
                  <Text style={{ fontSize: 10.5, letterSpacing: 0.6, fontFamily: "Barlow_700Bold", color: aktiv ? farben.onGold : farben.ink2 }}>
                    {k.wochentag}
                  </Text>
                  <Text style={{ fontSize: 21, lineHeight: 23, fontFamily: "BarlowSemiCondensed_700Bold", color: aktiv ? farben.onGold : farben.ink2 }}>
                    {k.zahl}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {ladeFehler ? (
        <Text style={stil.hinweisFehler}>{ladeFehler}</Text>
      ) : belegung === null ? (
        <Text style={stil.leise}>Belegung wird geladen …</Text>
      ) : ziele.length === 0 ? (
        <Text style={stil.leise}>An diesem Tag ist kein Platz frei, auf den die Buchung passt.</Text>
      ) : (
        <>
          <View>
            <Feldname>Platz</Feldname>
            <Segmente
              beschriftung="Platz"
              wert={platz?.id ?? ""}
              onWahl={setPlatzWahl}
              optionen={props.plaetze.map((p) => ({
                wert: p.id, label: p.short_name || p.name, deaktiviert: !mitZiel.includes(p),
              }))}
            />
          </View>
          <View>
            <Feldname>Beginn</Feldname>
            <View accessibilityRole="radiogroup" accessibilityLabel="Beginn" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {zeiten.map((m) => {
                const aktiv = m === minute;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMinuteWahl(m)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: aktiv }}
                    style={{
                      height: 40, minWidth: 64, paddingHorizontal: 12, borderRadius: 20,
                      alignItems: "center", justifyContent: "center",
                      backgroundColor: aktiv ? farben.gold : farben.surf2,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontFamily: "Barlow_700Bold", color: aktiv ? farben.onGold : farben.ink }}>
                      {alsUhrzeit(m)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}

      <View>
        <Feldname>{grundNoetig ? "Grund" : "Grund (freiwillig)"}</Feldname>
        <TextInput
          style={[stil.feld, { marginTop: -8 }]}
          value={grund}
          onChangeText={setGrund}
          placeholder="z. B. Platz 3 steht unter Wasser"
          placeholderTextColor={farben.muted}
          accessibilityLabel="Grund fürs Umsetzen"
        />
      </View>

      {platz && minute !== null && (
        <Text style={stil.leise}>
          Neu: {platz.name} · {tagText(tag)} · {alsUhrzeit(minute)}–{alsUhrzeit(minute + dauer)} Uhr.
          Bucher und Mitspieler werden benachrichtigt.
        </Text>
      )}

      <Fehlerzeile text={props.fehler} />
      <Nebenknopf
        text={props.laeuft ? "Wird umgesetzt …" : "Hierhin umsetzen"}
        gesperrt={props.laeuft || !bereit}
        onPress={() => {
          if (!platz || minute === null) return;
          props.onUmsetzen(b.booking_id, platz.id, tag, minute, grund);
        }}
      />
      <Nebenknopf klein text="Doch nicht" onPress={props.onZurueck} />
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
