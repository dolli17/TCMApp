import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path, Rect } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { berlinTime, occupancyKind } from "@tcm/core";
import { abstand, radius, schattenRn, schrift } from "@tcm/ui";
import { haptik } from "@/lib/haptik";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import {
  aendereMitspieler, aendereSperre, bucheplatz, hebeSperreAuf, ladeBlockungsarten,
  ladeBuchungsarten, ladeBuchungseinstellungen, ladeIchSelbst, ladeKontingent, ladePlaetze,
  ladeTagesplan, ladeVerzeichnis, sageSerienterminAb, setzeUm, sperreStunde, spieleMit,
  storniereBuchung, sucheMitspieler,
} from "@/lib/daten";
import {
  alsUhrzeit, jetztFrei, startMoeglich as pruefeStart, zuMinuten,
  type Belegung, type Blockungsart, type Buchungsart, type Fenster, type Mitglied,
} from "@/lib/plan";
import { Bildschirm } from "@/components/Bildschirm";
import { PlaetzeReiter } from "@/components/Bereichsreiter";
import { GrosserKopf } from "@/components/GrosserKopf";
import { Toast, type Meldung } from "@/components/Toast";
import { BuchungsFenster } from "@/components/BuchungsFenster";
import { FreieZeiten, FreieZeitenLegende } from "@/components/plaetze/FreieZeiten";
import { PlatzRaster, RasterLegende, type Auswahl } from "@/components/plaetze/PlatzRaster";
import { mitDeckkraft } from "@/lib/stil";

const heuteInBerlin = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

function verschiebe(datum: string, tage: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j!, (m ?? 1) - 1, t));
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

function lesbar(datum: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long" })
    .format(new Date(j!, (m ?? 1) - 1, t));
}

/**
 * Fuer die Tageszeile: "Heute, 13.10.", "Morgen, 14.10." oder
 * "Do., 15.10.". Heute und Morgen ersetzen den Wochentag - neben den
 * Pfeilen und dem Ansichtsschalter ist fuer beides kein Platz, und auch der
 * Wochentag steht deshalb kurz.
 */
function tageszeile(datum: string, heute: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(j!, (m ?? 1) - 1, t);
  const kurz = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
  if (datum === heute) return `Heute, ${kurz}`;
  if (datum === verschiebe(heute, 1)) return `Morgen, ${kurz}`;
  return `${new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(d)}, ${kurz}`;
}

type Ansicht = "uebersicht" | "freie-zeiten";
const ANSICHT_SPEICHER = "tcm-plaetze-ansicht";

/**
 * Wohin nach einer Aktion der Blick soll: eine bestehende Buchung oder - bei
 * einer neuen, deren ID die Datenbank nicht zurueckgibt - Platz und Beginn.
 */
type Markierung = { bookingId: string } | { courtId: string; startsAt: number };
const MARKIERT_MS = 5000;

/** Fuer die Datums-Kachel: "MO" und "28" */
function kachel(datum: string): { wochentag: string; tag: number } {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(j!, (m ?? 1) - 1, t);
  const wochentag = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(d);
  return { wochentag: wochentag.replace(".", "").toUpperCase(), tag: d.getDate() };
}

type Platz = Awaited<ReturnType<typeof ladePlaetze>>[number];

/**
 * Die Plaetze (docs/design/clubhaus/plaetze, HANDOFF-PLAETZE).
 *
 * Zwei Ansichten derselben Tagesbelegung, umschaltbar ueber den kleinen
 * Schalter Übersicht/Freie Zeiten rechts in der Datumszeile; die Wahl bleibt in
 * AsyncStorage. Ohne gemerkte Wahl beginnt es mit Freie Zeiten: dort sind
 * alle Ziele gross, im Raster muss man eine halbe Stunde treffen (U18). Ein zweites Segment unter "Belegung | Meine & offene Spiele"
 * war eine Leiste zu viel (U34). Die Übersicht
 * ist ein Raster - Plaetze als Zeilen, Stunden zum Wischen -, in dem eine
 * freie Flaeche Platz und Beginn auswaehlt; gebucht wird ueber die Leiste
 * unten. Freie Zeiten listet die Startzeiten mit den freien Plaetzen.
 * Die Feinwahl :00/:30 und die Spielform passieren im Blatt.
 *
 * Ob gebucht werden kann, entscheidet canStartAt (@tcm/core); durchgesetzt
 * wird es ausschliesslich in create_booking.
 */
export default function Plan() {
  const { stil, farben } = useTheme();
  const parameter = useLocalSearchParams<{ buchen?: string; platz?: string; buchung?: string; tag?: string }>();
  const [datum, setDatum] = useState(heuteInBerlin());
  const [ansicht, setAnsicht] = useState<Ansicht>("freie-zeiten");
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const [tagwahlOffen, setTagwahlOffen] = useState(false);
  const [plaetze, setPlaetze] = useState<Platz[]>([]);
  const [belegung, setBelegung] = useState<Belegung[]>([]);
  const [arten, setArten] = useState<Buchungsart[]>([]);
  const [blockungsarten, setBlockungsarten] = useState<Blockungsart[]>([]);
  const [verzeichnis, setVerzeichnis] = useState<Mitglied[]>([]);
  const [kontingent, setKontingent] = useState({ used: 0, allowed: 0 });
  const [einstellungen, setEinstellungen] =
    useState<Awaited<ReturnType<typeof ladeBuchungseinstellungen>>>(null);
  const [darfPlaetze, setDarfPlaetze] = useState(false);
  const [meineId, setMeineId] = useState<string | null>(null);
  const [fenster, setFenster] = useState<Fenster | null>(null);
  const [fensterFehler, setFensterFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  /** Fuer welchen Tag die Daten gerade stehen - erst danach darf das Blatt aufgehen. */
  const [geladenFuer, setGeladenFuer] = useState<string | null>(null);
  /** Von Home: Blatt oeffnen, sobald der Tag geladen ist - mit Wunschplatz oder fuer eine Buchung. */
  const [buchenWartet, setBuchenWartet] = useState<{ platz?: string } | null>(null);
  const [buchungWartet, setBuchungWartet] = useState<string | null>(null);
  const [aktualisiert, setAktualisiert] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  /** Plan nicht ladbar: steht oben mit "Erneut versuchen" statt als Toast (U3). */
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [markiert, setMarkiert] = useState<Markierung | null>(null);
  /** Hoehe der Buchen-Leiste, fuer den Toast darueber */
  const [leisteHoehe, setLeisteHoehe] = useState(0);

  /**
   * still: ohne Ladekreis nachladen.
   *
   * Das Nachladen durch Realtime oder durch Herunterziehen darf den Inhalt
   * nicht gegen einen Ladekreis tauschen - bei einer Serienanlage flackerte
   * sonst der ganze Bildschirm, obwohl sich nur eine Zeile geaendert hat.
   */
  const laden = useCallback(async (tag: string, still = false) => {
    if (!still) setLaedt(true);
    const [p, b, k, e, a, ba, v, ich] = await Promise.all([
      ladePlaetze(), ladeTagesplan(tag), ladeKontingent(), ladeBuchungseinstellungen(),
      ladeBuchungsarten(), ladeBlockungsarten(), ladeVerzeichnis(""), ladeIchSelbst(),
    ]);
    setPlaetze(p); setBelegung(b); setKontingent(k); setEinstellungen(e);
    setArten(a); setBlockungsarten(ba); setVerzeichnis(v); setDarfPlaetze(ich.platzRechte);
    setMeineId(ich.id);
    setGeladenFuer(tag);
    setLadeFehler(null);
    setLaedt(false);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(ANSICHT_SPEICHER).then((a) => {
      if (a === "uebersicht" || a === "freie-zeiten") setAnsicht(a);
    }).catch(() => {});
  }, []);

  function waehleAnsicht(a: Ansicht) {
    setAnsicht(a);
    setAuswahl(null);
    void AsyncStorage.setItem(ANSICHT_SPEICHER, a);
  }

  function waehleTag(t: string) {
    setDatum(t);
    setAuswahl(null);
  }

  useEffect(() => {
    laden(datum).catch((f: Error) => {
      setLadeFehler(f.message);
      setLaedt(false);
    });
  }, [datum, laden]);

  /** Herunterziehen laedt nach, ohne den Plan gegen einen Ladekreis zu tauschen. */
  const vonHand = useCallback(() => {
    setAktualisiert(true);
    laden(datum, true)
      .catch((f: Error) => setLadeFehler(f.message))
      .finally(() => setAktualisiert(false));
  }, [datum, laden]);

  /**
   * Der Plan hält sich selbst aktuell.
   *
   * Zwei Dinge sind hier anders als im Web:
   *
   * Erstens geht die App in den Hintergrund. Ein Kanal, der das verschläft,
   * bleibt danach stumm - die Verbindung ist tot, aber niemand merkt es. Beim
   * Zurückkommen wird deshalb neu geladen und neu abonniert.
   *
   * Zweitens die Drosselung: eine Serienanlage mit sechzig Terminen löst
   * sechzig Ereignisse in Sekunden aus. Höchstens ein Nachladen pro Sekunde.
   */
  useEffect(() => {
    let letzte = 0;
    let wartet: ReturnType<typeof setTimeout> | null = null;

    function auffrischen() {
      const jetzt = Date.now();
      const rest = 1000 - (jetzt - letzte);
      if (rest <= 0) {
        letzte = jetzt;
        laden(datum, true).catch(() => {});
        return;
      }
      if (wartet) return;
      wartet = setTimeout(() => {
        wartet = null;
        letzte = Date.now();
        laden(datum, true).catch(() => {});
      }, rest);
    }

    const kanal = supabase
      .channel(`plan-${datum}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, auffrischen)
      .subscribe();

    const abo = AppState.addEventListener("change", (zustand) => {
      if (zustand === "active") {
        // Was während des Schlafs passiert ist, hat der Kanal nicht gesehen.
        // Die Verbindung baut Supabase selbst wieder auf; die Lücke schließt
        // dieses Nachladen.
        laden(datum, true).catch(() => {});
      }
    });

    return () => {
      if (wartet) clearTimeout(wartet);
      abo.remove();
      void supabase.removeChannel(kanal);
    };
  }, [datum, laden]);

  const oeffnung = zuMinuten(String(einstellungen?.opening_time ?? "08:00"));
  const schluss = zuMinuten(String(einstellungen?.closing_time ?? "21:00"));
  const raster = einstellungen?.slot_minutes ?? 30;
  const anzeige = einstellungen?.display_minutes ?? 60;
  const dauer = arten[0]?.duration_minutes ?? 60;
  // 0 heisst unbegrenzt - die Regel bleibt in der Datenbank, nur abgeschaltet.
  const unbegrenzt = (kontingent.allowed ?? 0) <= 0;
  const kontingentAus = !unbegrenzt && kontingent.used >= kontingent.allowed;
  const heute = heuteInBerlin();

  /**
   * Die buchbaren Tage.
   *
   * lead_days kommt aus booking_settings - dieselbe Zahl, gegen die
   * create_booking prueft. Ein Kalender waere der uebliche Griff, wuerde aber
   * Tage anbieten, die die Datenbank ohnehin abweist.
   */
  const vorlauf = einstellungen?.lead_days ?? 7;
  const tage = useMemo(
    () => Array.from({ length: vorlauf + 1 }, (_, i) => verschiebe(heute, i)),
    [heute, vorlauf],
  );

  /**
   * Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? Am
   * letzten Vorlauftag nur bis zur jetzigen Uhrzeit - wie create_booking.
   */
  const startMoeglich = useCallback(
    (courtId: string, minute: number) =>
      pruefeStart({
        day: datum, courtId, minute, durationMinutes: dauer, closingMinutes: schluss,
        occupied: belegung, leadDays: vorlauf,
      }),
    [belegung, datum, dauer, schluss, vorlauf],
  );

  const startzeitenIn = useCallback(
    (courtId: string, stunde: number) => {
      const out: number[] = [];
      for (let m = stunde; m < stunde + anzeige; m += raster) {
        if (startMoeglich(courtId, m)) out.push(m);
      }
      return out;
    },
    [anzeige, raster, startMoeglich],
  );

  const oeffneBuchen = useCallback(
    (platz: Platz, minute: number, tag: string) => {
      const stunde = oeffnung + Math.floor((minute - oeffnung) / anzeige) * anzeige;
      setFensterFehler(null);
      setFenster({
        modus: "buchen", courtId: platz.id, platzName: platz.name, tag,
        stunde, startzeiten: startzeitenIn(platz.id, stunde), start: minute,
      });
    },
    [anzeige, oeffnung, startzeitenIn],
  );

  /**
   * "Platz buchen" auf Home (Kachel und Leerkarte) kommt mit ?buchen=jetzt
   * hierher: das Blatt geht mit der naechsten freien Zeit auf - heute, auf
   * dem ersten Platz aus freeCourtsNow. Eine Karte unter "Jetzt frei" gibt
   * mit &platz= ihren Platz mit (U54); ist der inzwischen belegt, gilt
   * wieder der erste freie.
   */
  useEffect(() => {
    if (parameter.buchen !== "jetzt") return;
    const platz = parameter.platz;
    router.setParams({ buchen: undefined, platz: undefined });
    setDatum(heute);
    setBuchenWartet({ platz });
  }, [parameter.buchen, parameter.platz, heute]);

  useEffect(() => {
    if (!buchenWartet || laedt || geladenFuer !== heute || datum !== heute) return;
    const wunsch = buchenWartet.platz;
    setBuchenWartet(null);
    if (kontingentAus) {
      setMeldung({ ok: false, text: "Dein Kontingent ist ausgeschöpft." });
      return;
    }
    const freie = jetztFrei({
      day: heute, courtIds: plaetze.map((p) => p.id), openingMinutes: oeffnung,
      closingMinutes: schluss, slotMinutes: raster, durationMinutes: dauer, occupied: belegung,
      leadDays: vorlauf,
    });
    const erster = freie.find((f) => f.courtId === wunsch) ?? freie[0];
    const platz = erster && plaetze.find((p) => p.id === erster.courtId);
    if (!erster || !platz) {
      setMeldung({ ok: false, text: "Heute ist gerade kein Platz mehr frei – wähle einen anderen Tag." });
      return;
    }
    oeffneBuchen(platz, erster.fromMinute, heute);
  }, [
    buchenWartet, laedt, geladenFuer, datum, heute, kontingentAus, plaetze, oeffnung, schluss,
    raster, dauer, belegung, oeffneBuchen, vorlauf,
  ]);

  /**
   * "Als Nächstes" auf Home kommt mit ?buchung=…&tag=… hierher (U54): der Plan
   * springt auf den Tag, und die Buchung geht im Blatt auf - dort, wo sie
   * sich auch aendern und stornieren laesst, statt nur in der Spiele-Liste.
   */
  useEffect(() => {
    const id = parameter.buchung;
    const tag = parameter.tag;
    if (!id || !tag) return;
    router.setParams({ buchung: undefined, tag: undefined });
    setDatum(tag);
    setAuswahl(null);
    setBuchungWartet(id);
  }, [parameter.buchung, parameter.tag]);

  useEffect(() => {
    if (!buchungWartet || laedt || geladenFuer !== datum) return;
    setBuchungWartet(null);
    const b = belegung.find((x) => x.booking_id === buchungWartet);
    const platz = b && plaetze.find((p) => p.id === b.court_id);
    if (!b || !platz) {
      setMeldung({ ok: false, text: "Die Buchung steht nicht mehr im Plan." });
      return;
    }
    setFensterFehler(null);
    setFenster({ modus: "verwalten", belegung: b, platzName: platz.name, tag: datum });
  }, [buchungWartet, laedt, geladenFuer, datum, belegung, plaetze]);

  /**
   * Welche Belegung laesst sich im Blatt oeffnen?
   *
   * Neben eigener Buchung auch jede, die Mitspieler sucht - eine Einladung
   * muss antippbar sein - und fremde Buchungen zum Ansehen. Was darin
   * geaendert werden darf, entscheidet das Blatt. Sperrungen nur mit Platzrechten.
   */
  function oeffnebar(b: Belegung): boolean {
    const art = occupancyKind(b);
    if (art === "gesperrt") return darfPlaetze;
    return true;
  }

  function oeffneBelegung(platz: Platz, b: Belegung) {
    if (!oeffnebar(b)) return;
    setFensterFehler(null);
    setFenster({ modus: "verwalten", belegung: b, platzName: platz.name, tag: datum });
  }

  function buchenAuf(platz: Platz, minute: number) {
    if (kontingentAus) {
      setMeldung({ ok: false, text: "Dein Kontingent ist ausgeschöpft." });
      return;
    }
    oeffneBuchen(platz, minute, datum);
  }

  /**
   * Ergebnis einer Aenderung: klappt es, schliesst das Blatt, die Meldung
   * kommt unten als Toast und die betroffene Belegung ist kurz hervorgehoben
   * (U16). Scheitert es, bleibt das Blatt offen und der Grund der Datenbank
   * steht ueber dem Knopf.
   */
  async function ergebnis(r: { ok: boolean; meldung: string }, ziel?: Markierung) {
    if (r.ok) {
      haptik.erfolg();
      setMeldung({ ok: true, text: r.meldung });
      setMarkiert(ziel ?? null);
      setFenster(null);
      setAuswahl(null);
      setFensterFehler(null);
      await laden(datum, true);
    } else {
      haptik.fehler();
      setFensterFehler(r.meldung);
    }
  }

  async function mitLauf<T>(arbeit: () => Promise<T>): Promise<T> {
    setLaeuft(true);
    try {
      return await arbeit();
    } finally {
      setLaeuft(false);
    }
  }

  // Der Zeitpunkt wird in Europe/Berlin gebildet, nicht in der Zeitzone des
  // Telefons. Steht das Geraet auf einer anderen Zone - Urlaub, Dienstreise,
  // falsch gestellte Uhr -, war die abgeschickte Startzeit vorher um Stunden
  // verschoben, und die Datenbank hat sie entweder abgewiesen oder still auf
  // dem falschen Platz eingetragen.
  const zeitpunkt = (tag: string, minute: number) => berlinTime(tag, minute);

  const buchen = (
    courtId: string, start: number, typ: string, mitglieder: string[], gaeste: string[], sucht: boolean,
  ) =>
    mitLauf(async () =>
      ergebnis(
        await bucheplatz(courtId, zeitpunkt(fenster?.tag ?? datum, start), typ, mitglieder, gaeste, sucht),
        { courtId, startsAt: zeitpunkt(fenster?.tag ?? datum, start).getTime() },
      ),
    );
  const ausschreiben = (id: string, gesucht: boolean) =>
    mitLauf(async () => ergebnis(await sucheMitspieler(id, gesucht), { bookingId: id }));
  const beitreten = (id: string) => mitLauf(async () => ergebnis(await spieleMit(id), { bookingId: id }));
  const speichern = (id: string, mitglieder: string[], gaeste: string[]) =>
    mitLauf(async () => ergebnis(await aendereMitspieler(id, mitglieder, gaeste), { bookingId: id }));
  const stornieren = (id: string, grund?: string) =>
    mitLauf(async () => ergebnis(await storniereBuchung(id, grund)));
  const terminAbsagen = (id: string, grund?: string) =>
    mitLauf(async () => ergebnis(await sageSerienterminAb(id, grund)));
  const umsetzen = (id: string, courtId: string, tag: string, minute: number, grund?: string) =>
    mitLauf(async () =>
      ergebnis(await setzeUm({ bookingId: id, platzId: courtId, tag, minute, grund }), { bookingId: id }),
    );

  async function sperren(
    courtId: string, von: number, bis: number, typCode: string, grund: string, verdraengen: boolean,
  ): Promise<number | null> {
    const tag = fenster?.tag ?? datum;
    const r = await mitLauf(() =>
      sperreStunde({
        platzId: courtId, von: zeitpunkt(tag, von), bis: zeitpunkt(tag, bis), typCode, grund, verdraengen,
      }),
    );
    return kollisionOderErgebnis(r, { courtId, startsAt: zeitpunkt(tag, von).getTime() });
  }

  async function sperreAendern(
    bookingId: string, platzIds: string[], von: number, bis: number, typCode: string, grund: string,
    verdraengen: boolean,
  ): Promise<number | null> {
    const tag = fenster?.tag ?? datum;
    const r = await mitLauf(() =>
      aendereSperre({
        bookingId, platzIds, von: zeitpunkt(tag, von), bis: zeitpunkt(tag, bis), typCode, grund, verdraengen,
      }),
    );
    return kollisionOderErgebnis(r, { bookingId });
  }

  /**
   * Liegen Buchungen im Weg, fragt das Blatt selbst nach ("1 Buchung
   * verdraengen"). Die Meldung der Datenbank dazu waere doppelt.
   */
  async function kollisionOderErgebnis(
    r: { ok: boolean; meldung: string; kollisionen?: number }, ziel?: Markierung,
  ) {
    if (r.kollisionen !== undefined) {
      setFensterFehler(null);
      return r.kollisionen;
    }
    await ergebnis(r, ziel);
    return null;
  }

  const sperreAufheben = (id: string) => mitLauf(async () => ergebnis(await hebeSperreAuf(id)));

  useEffect(() => {
    if (!markiert) return;
    const uhr = setTimeout(() => setMarkiert(null), MARKIERT_MS);
    return () => clearTimeout(uhr);
  }, [markiert]);

  /** Gehoert diese Belegung zur letzten erfolgreichen Aktion? */
  const istMarkiert = (b: Belegung) => {
    if (!markiert) return false;
    if ("bookingId" in markiert) return b.booking_id === markiert.bookingId;
    return b.court_id === markiert.courtId && Date.parse(b.starts_at) === markiert.startsAt;
  };

  const gewaehlterPlatz = auswahl ? plaetze.find((p) => p.id === auswahl.courtId) : undefined;
  const tagIndex = tage.indexOf(datum);
  const buchenLeiste = ansicht === "uebersicht" && auswahl && gewaehlterPlatz && !fenster;

  return (
    <>
      <Bildschirm
        laedt={laedt}
        aktualisiert={aktualisiert}
        onAktualisieren={vonHand}
        fehler={ladeFehler}
        kopf={<GrosserKopf titel="Plätze" />}
        reiter={<PlaetzeReiter wert="/plaetze" />}
        fuss={
          buchenLeiste ? (
            <View
              onLayout={(e) => setLeisteHoehe(e.nativeEvent.layout.height)}
              style={{
                minHeight: 64, borderRadius: 22, paddingLeft: 18, paddingRight: 8,
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                backgroundColor: farben.ink,
                shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.35, shadowRadius: 20,
                elevation: 8,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityLiveRegion="polite">
                <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: "Barlow_800ExtraBold", color: farben.bg }}>
                  {gewaehlterPlatz.name} · {alsUhrzeit(auswahl.minute)} – {alsUhrzeit(auswahl.minute + dauer)}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: schrift.groesse.klein, fontFamily: "Barlow_500Medium", color: mitDeckkraft(farben.bg, 0.7) }}>
                  frei bis {alsUhrzeit(auswahl.bis)}
                </Text>
              </View>
              <Pressable
                onPress={() => buchenAuf(gewaehlterPlatz, auswahl.minute)}
                accessibilityRole="button"
                accessibilityLabel={`${gewaehlterPlatz.name} um ${alsUhrzeit(auswahl.minute)} Uhr buchen`}
                style={({ pressed }) => ({
                  minHeight: 48, paddingHorizontal: 22, borderRadius: 16, justifyContent: "center",
                  backgroundColor: farben.gold, opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ fontSize: 15.5, fontFamily: "Barlow_800ExtraBold", color: farben.onGold }}>Buchen</Text>
              </Pressable>
            </View>
          ) : undefined
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Rundknopf
            richtung="zurueck"
            beschriftung="Vortag"
            aus={tagIndex <= 0}
            onPress={() => waehleTag(tage[tagIndex - 1]!)}
          />
          <Pressable
            onPress={() => setTagwahlOffen((o) => !o)}
            accessibilityRole="button"
            accessibilityLabel={`${lesbar(datum)}, Tag wählen`}
            accessibilityState={{ expanded: tagwahlOffen }}
            style={{
              flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", justifyContent: "center",
              gap: 6, minHeight: 44,
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
              style={{ flexShrink: 1, fontSize: 17, fontFamily: "Barlow_700Bold", color: farben.ink }}
            >
              {tageszeile(datum, heute)}
            </Text>
            <Svg width={14} height={14} viewBox="0 0 24 24" style={{ transform: [{ rotate: tagwahlOffen ? "180deg" : "0deg" }] }}>
              <Path d="M6 9l6 6 6-6" stroke={farben.muted} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
          <Rundknopf
            richtung="vor"
            beschriftung="Folgetag"
            aus={tagIndex < 0 || tagIndex >= tage.length - 1}
            onPress={() => waehleTag(tage[tagIndex + 1]!)}
          />
          <AnsichtSchalter wert={ansicht} onWahl={waehleAnsicht} />
        </View>

        {tagwahlOffen && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -abstand.rand, marginTop: -6 }}
            contentContainerStyle={{ gap: 6, paddingHorizontal: abstand.rand }}
          >
            {tage.map((t) => {
              const aktiv = t === datum;
              const k = kachel(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => {
                    waehleTag(t);
                    setTagwahlOffen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: aktiv }}
                  accessibilityLabel={lesbar(t)}
                  style={{
                    width: 50, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 1,
                    backgroundColor: aktiv ? farben.gold : farben.surf2,
                  }}
                >
                  <Text style={{ fontSize: schrift.groesse.kicker, letterSpacing: 0.6, fontFamily: "BarlowSemiCondensed_700Bold", color: aktiv ? farben.onGold : farben.ink2 }}>
                    {t === heute ? "HEUTE" : k.wochentag}
                  </Text>
                  <Text style={{ fontSize: 21, lineHeight: 23, fontFamily: "BarlowSemiCondensed_700Bold", color: aktiv ? farben.onGold : farben.ink2 }}>
                    {k.tag}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!unbegrenzt && (
          <Text style={stil.leise}>
            Kontingent: {kontingent.used} von {kontingent.allowed} offenen Buchungen. Buchungen,
            bei denen du als Mitspieler eingetragen bist, zählen mit.
          </Text>
        )}

        {ansicht === "uebersicht" ? (
          <>
            <PlatzRaster
              datum={datum}
              istHeute={datum === heute}
              plaetze={plaetze}
              belegung={belegung}
              oeffnung={oeffnung}
              schluss={schluss}
              raster={raster}
              dauer={dauer}
              vorlaufTage={vorlauf}
              auswahl={auswahl}
              oeffnebar={oeffnebar}
              markiert={istMarkiert}
              onAuswahl={setAuswahl}
              onOeffnen={oeffneBelegung}
            />
            <RasterLegende />
          </>
        ) : (
          <>
            <FreieZeiten
              datum={datum}
              plaetze={plaetze}
              belegung={belegung}
              oeffnung={oeffnung}
              schluss={schluss}
              raster={raster}
              dauer={dauer}
              vorlaufTage={vorlauf}
              onBuchen={buchenAuf}
              oeffnebar={oeffnebar}
              markiert={istMarkiert}
              onOeffnen={oeffneBelegung}
              onNaechsterTag={
                tagIndex >= 0 && tagIndex < tage.length - 1 ? () => waehleTag(tage[tagIndex + 1]!) : undefined
              }
            />
            <FreieZeitenLegende />
          </>
        )}
      </Bildschirm>

      <Toast
        meldung={meldung}
        onSchliessen={() => setMeldung(null)}
        leisteHoehe={buchenLeiste ? leisteHoehe : 0}
      />

      {fenster && (
        <BuchungsFenster
          fenster={fenster}
          plaetze={plaetze}
          tage={tage}
          belegung={belegung}
          oeffnungMinuten={oeffnung}
          schlussMinuten={schluss}
          arten={arten}
          blockungsarten={blockungsarten}
          verzeichnis={verzeichnis}
          meineId={meineId}
          rasterMinuten={raster}
          anzeigeMinuten={anzeige}
          gastgebuehrCents={einstellungen?.guest_fee_cents ?? 0}
          darfPlaetze={darfPlaetze}
          laeuft={laeuft}
          fehler={fensterFehler}
          onBuchen={buchen}
          onSpeichern={speichern}
          onStornieren={stornieren}
          onTerminAbsagen={terminAbsagen}
          onUmsetzen={umsetzen}
          onTagLaden={ladeTagesplan}
          onAusschreiben={ausschreiben}
          onBeitreten={beitreten}
          onSperren={sperren}
          onSperreAendern={sperreAendern}
          onSperreAufheben={sperreAufheben}
          onSchliessen={() => {
            setFenster(null);
            setFensterFehler(null);
          }}
        />
      )}
    </>
  );
}

/* --- Runder Knopf fuer Vortag und Folgetag ------------------------------- */

function Rundknopf({
  richtung, beschriftung, aus, onPress,
}: {
  richtung: "zurueck" | "vor";
  beschriftung: string;
  aus: boolean;
  onPress: () => void;
}) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={aus}
      accessibilityRole="button"
      accessibilityLabel={beschriftung}
      accessibilityState={{ disabled: aus }}
      style={{
        width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
        backgroundColor: farben.surf2, opacity: aus ? 0.4 : 1,
      }}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path
          d={richtung === "zurueck" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
          stroke={farben.ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

/* --- Raster oder Liste --------------------------------------------------- */

/**
 * Rechts in der Datumszeile: Übersicht (Raster) oder Freie Zeiten (Liste).
 * Zwei Knoepfe statt eines Wechselknopfs, damit man sieht, was gerade gilt.
 *
 * U55 hatte den Schalter mit Namen in eine eigene Zeile gestellt; mit Segment
 * und Datumszeile waren das drei Stufen vor dem ersten Platz (U75). Jetzt
 * steht er wieder in der Datumszeile, als Segment mit erkennbar aktivem
 * Feld - fuer beide Namen ist dort kein Platz. Der Name steht im Label, und
 * die Tabelle darunter sagt, was gilt: Raster mit Plaetzen oder Liste mit
 * Uhrzeiten.
 */
function AnsichtSchalter({ wert, onWahl }: { wert: Ansicht; onWahl: (a: Ansicht) => void }) {
  const { farben, theme } = useTheme();
  const knopf = (a: Ansicht, label: string, symbol: (farbe: string) => ReactNode) => {
    const aktiv = wert === a;
    const farbe = aktiv ? farben.ink : farben.ink2;
    return (
      <Pressable
        onPress={() => onWahl(a)}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ selected: aktiv }}
        // 36 sichtbar, mit hitSlop 44 zum Tippen (U18)
        hitSlop={4}
        style={[
          { width: 36, height: 36, borderRadius: radius.knopf - 6, alignItems: "center", justifyContent: "center" },
          aktiv && { backgroundColor: farben.segAktiv },
          aktiv && theme === "hell" && schattenRn.hell.klein,
        ]}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24">{symbol(farbe)}</Svg>
      </Pressable>
    );
  };
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Darstellung"
      style={{
        flexDirection: "row", gap: 2, padding: 4,
        borderRadius: radius.knopf - 2, backgroundColor: farben.surf2,
      }}
    >
      {knopf("uebersicht", "Übersicht", (f) => (
        <>
          <Rect x={3.5} y={3.5} width={7} height={7} rx={1.8} stroke={f} strokeWidth={2} fill="none" />
          <Rect x={13.5} y={3.5} width={7} height={7} rx={1.8} stroke={f} strokeWidth={2} fill="none" />
          <Rect x={3.5} y={13.5} width={7} height={7} rx={1.8} stroke={f} strokeWidth={2} fill="none" />
          <Rect x={13.5} y={13.5} width={7} height={7} rx={1.8} stroke={f} strokeWidth={2} fill="none" />
        </>
      ))}
      {knopf("freie-zeiten", "Freie Zeiten", (f) => (
        <Path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke={f} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      ))}
    </View>
  );
}
