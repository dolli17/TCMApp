import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { berlinTime, occupancyKind } from "@tcm/core";
import { abstand } from "@tcm/ui";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import {
  aendereMitspieler, bucheplatz, ladeBuchungsarten, ladeBuchungseinstellungen,
  ladeIchSelbst, ladeKontingent, ladePlaetze, ladeTagesplan,
  ladeVerzeichnis, sageSerienterminAb, sperreStunde, spieleMit, storniereBuchung, sucheMitspieler,
} from "@/lib/daten";
import {
  alsUhrzeit, jetztFrei, startMoeglich as pruefeStart, zuMinuten,
  type Belegung, type Buchungsart, type Fenster, type Mitglied,
} from "@/lib/plan";
import { Bildschirm } from "@/components/Bildschirm";
import { BuchungsFenster } from "@/components/BuchungsFenster";
import { Segmente } from "@/components/Segmente";
import { FreieZeiten, FreieZeitenLegende } from "@/components/plaetze/FreieZeiten";
import { PlatzRaster, RasterLegende, type Auswahl } from "@/components/plaetze/PlatzRaster";
import { LEISTE_ABSTAND_UNTEN, LEISTE_HOEHE, LEISTE_RAND } from "@/lib/masse";
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

/** Fuer die Tageszeile: "Heute, Dienstag 13.10." */
function tageszeile(datum: string, heute: string): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(j!, (m ?? 1) - 1, t);
  const wochentag = new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(d);
  const kurz = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
  const vorsatz = datum === heute ? "Heute, " : datum === verschiebe(heute, 1) ? "Morgen, " : "";
  return `${vorsatz}${wochentag} ${kurz}`;
}

type Ansicht = "uebersicht" | "freie-zeiten";
const ANSICHT_SPEICHER = "tcm-plaetze-ansicht";

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
 * Zwei Ansichten derselben Tagesbelegung, umschaltbar ueber das Segment
 * "Übersicht | Freie Zeiten"; die Wahl bleibt in AsyncStorage. Die Übersicht
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
  const parameter = useLocalSearchParams<{ buchen?: string }>();
  const rand = useSafeAreaInsets();
  const [datum, setDatum] = useState(heuteInBerlin());
  const [ansicht, setAnsicht] = useState<Ansicht>("uebersicht");
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const [tagwahlOffen, setTagwahlOffen] = useState(false);
  const [plaetze, setPlaetze] = useState<Platz[]>([]);
  const [belegung, setBelegung] = useState<Belegung[]>([]);
  const [arten, setArten] = useState<Buchungsart[]>([]);
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
  const [buchenWartet, setBuchenWartet] = useState(false);
  const [aktualisiert, setAktualisiert] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  /**
   * still: ohne Ladekreis nachladen.
   *
   * Das Nachladen durch Realtime oder durch Herunterziehen darf den Inhalt
   * nicht gegen einen Ladekreis tauschen - bei einer Serienanlage flackerte
   * sonst der ganze Bildschirm, obwohl sich nur eine Zeile geaendert hat.
   */
  const laden = useCallback(async (tag: string, still = false) => {
    if (!still) setLaedt(true);
    const [p, b, k, e, a, v, ich] = await Promise.all([
      ladePlaetze(), ladeTagesplan(tag), ladeKontingent(), ladeBuchungseinstellungen(),
      ladeBuchungsarten(), ladeVerzeichnis(""), ladeIchSelbst(),
    ]);
    setPlaetze(p); setBelegung(b); setKontingent(k); setEinstellungen(e);
    setArten(a); setVerzeichnis(v); setDarfPlaetze(ich.platzRechte); setMeineId(ich.id);
    setGeladenFuer(tag);
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
      setMeldung({ ok: false, text: f.message });
      setLaedt(false);
    });
  }, [datum, laden]);

  /** Herunterziehen laedt nach, ohne den Plan gegen einen Ladekreis zu tauschen. */
  const vonHand = useCallback(() => {
    setAktualisiert(true);
    laden(datum, true)
      .catch((f: Error) => setMeldung({ ok: false, text: f.message }))
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
  const tage = useMemo(() => {
    const vorlauf = einstellungen?.lead_days ?? 7;
    return Array.from({ length: vorlauf + 1 }, (_, i) => verschiebe(heute, i));
  }, [heute, einstellungen?.lead_days]);

  /** Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? */
  const startMoeglich = useCallback(
    (courtId: string, minute: number) =>
      pruefeStart({
        day: datum, courtId, minute, durationMinutes: dauer, closingMinutes: schluss,
        occupied: belegung,
      }),
    [belegung, datum, dauer, schluss],
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
   * Der gelbe "+"-Knopf und "Platz buchen" auf Home kommen mit ?buchen=jetzt
   * hierher: das Blatt geht mit der naechsten freien Zeit auf - heute, auf
   * dem ersten Platz aus freeCourtsNow.
   */
  useEffect(() => {
    if (parameter.buchen !== "jetzt") return;
    router.setParams({ buchen: undefined });
    setDatum(heute);
    setBuchenWartet(true);
  }, [parameter.buchen, heute]);

  useEffect(() => {
    if (!buchenWartet || laedt || geladenFuer !== heute || datum !== heute) return;
    setBuchenWartet(false);
    if (kontingentAus) {
      setMeldung({ ok: false, text: "Dein Kontingent ist ausgeschöpft." });
      return;
    }
    const [erster] = jetztFrei({
      day: heute, courtIds: plaetze.map((p) => p.id), openingMinutes: oeffnung,
      closingMinutes: schluss, slotMinutes: raster, durationMinutes: dauer, occupied: belegung,
    });
    const platz = erster && plaetze.find((p) => p.id === erster.courtId);
    if (!erster || !platz) {
      setMeldung({ ok: false, text: "Heute ist gerade kein Platz mehr frei – wähle einen anderen Tag." });
      return;
    }
    oeffneBuchen(platz, erster.fromMinute, heute);
  }, [
    buchenWartet, laedt, geladenFuer, datum, heute, kontingentAus, plaetze, oeffnung, schluss,
    raster, dauer, belegung, oeffneBuchen,
  ]);

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
   * Ergebnis einer Aenderung: klappt es, schliesst das Blatt und die Meldung
   * steht ueber der Liste. Scheitert es, bleibt das Blatt offen und der Grund
   * der Datenbank steht ueber dem Knopf.
   */
  async function ergebnis(r: { ok: boolean; meldung: string }) {
    if (r.ok) {
      setMeldung({ ok: true, text: r.meldung });
      setFenster(null);
      setAuswahl(null);
      setFensterFehler(null);
      await laden(datum, true);
    } else {
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
      ergebnis(await bucheplatz(courtId, zeitpunkt(fenster?.tag ?? datum, start), typ, mitglieder, gaeste, sucht)),
    );
  const ausschreiben = (id: string, gesucht: boolean) =>
    mitLauf(async () => ergebnis(await sucheMitspieler(id, gesucht)));
  const beitreten = (id: string) => mitLauf(async () => ergebnis(await spieleMit(id)));
  const speichern = (id: string, mitglieder: string[], gaeste: string[]) =>
    mitLauf(async () => ergebnis(await aendereMitspieler(id, mitglieder, gaeste)));
  const stornieren = (id: string, grund?: string) =>
    mitLauf(async () => ergebnis(await storniereBuchung(id, grund)));
  const terminAbsagen = (id: string, grund?: string) =>
    mitLauf(async () => ergebnis(await sageSerienterminAb(id, grund)));

  async function sperren(
    courtId: string, von: number, bis: number, grund: string, verdraengen: boolean,
  ): Promise<number | null> {
    const tag = fenster?.tag ?? datum;
    const r = await mitLauf(() =>
      sperreStunde({
        platzId: courtId, von: zeitpunkt(tag, von), bis: zeitpunkt(tag, bis), grund, verdraengen,
      }),
    );
    await ergebnis(r);
    return r.kollisionen ?? null;
  }

  const gewaehlterPlatz = auswahl ? plaetze.find((p) => p.id === auswahl.courtId) : undefined;
  const tagIndex = tage.indexOf(datum);

  return (
    <>
      <Bildschirm laedt={laedt} aktualisiert={aktualisiert} onAktualisieren={vonHand}>
        <Segmente<Ansicht>
          beschriftung="Darstellung"
          wert={ansicht}
          onWahl={waehleAnsicht}
          optionen={[
            { wert: "uebersicht", label: "Übersicht" },
            { wert: "freie-zeiten", label: "Freie Zeiten" },
          ]}
        />

        {ansicht === "uebersicht" ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
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
              style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 8 }}
            >
              <Text style={{ fontSize: 17, fontFamily: "Barlow_700Bold", color: farben.ink }}>
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
          </View>
        ) : null}

        {(ansicht === "freie-zeiten" || tagwahlOffen) && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -abstand.rand, marginTop: ansicht === "uebersicht" ? -6 : 0 }}
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
                  <Text style={{ fontSize: 10.5, letterSpacing: 0.6, fontFamily: "Barlow_700Bold", color: aktiv ? farben.onGold : farben.ink2 }}>
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

        {meldung && (
          <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler} accessibilityLiveRegion="polite">
            {meldung.text}
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
              auswahl={auswahl}
              oeffnebar={oeffnebar}
              onAuswahl={setAuswahl}
              onOeffnen={oeffneBelegung}
            />
            <RasterLegende />
            {/* Luft, damit die Leiste unten die Legende nicht verdeckt */}
            {auswahl && <View style={{ height: 76 }} />}
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
              onBuchen={buchenAuf}
              onOeffnen={oeffneBelegung}
            />
            <FreieZeitenLegende />
          </>
        )}
      </Bildschirm>

      {ansicht === "uebersicht" && auswahl && gewaehlterPlatz && !fenster && (
        <View
          style={{
            position: "absolute", left: LEISTE_RAND, right: LEISTE_RAND,
            bottom: LEISTE_ABSTAND_UNTEN + rand.bottom + LEISTE_HOEHE + 14,
            height: 64, borderRadius: 22, paddingLeft: 18, paddingRight: 8,
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
            <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: "Barlow_500Medium", color: mitDeckkraft(farben.bg, 0.7) }}>
              frei bis {alsUhrzeit(auswahl.bis)}
            </Text>
          </View>
          <Pressable
            onPress={() => buchenAuf(gewaehlterPlatz, auswahl.minute)}
            accessibilityRole="button"
            accessibilityLabel={`${gewaehlterPlatz.name} um ${alsUhrzeit(auswahl.minute)} Uhr buchen`}
            style={({ pressed }) => ({
              height: 48, paddingHorizontal: 22, borderRadius: 16, justifyContent: "center",
              backgroundColor: farben.gold, opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontSize: 15.5, fontFamily: "Barlow_800ExtraBold", color: farben.onGold }}>Buchen</Text>
          </Pressable>
        </View>
      )}

      {fenster && (
        <BuchungsFenster
          fenster={fenster}
          arten={arten}
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
          onAusschreiben={ausschreiben}
          onBeitreten={beitreten}
          onSperren={sperren}
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
        width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
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
