import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import {
  berlinTime, courtStatusAt, nextSlotMinute, timelinePosition, timelineSegments,
  type CourtStatus, type TimelineKind,
} from "@tcm/core";
import { abstand, radius } from "@tcm/ui";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import {
  aendereMitspieler, bucheplatz, ladeBuchungsarten, ladeBuchungseinstellungen,
  ladeIchSelbst, ladeKontingent, ladePlaetze, ladeTagesplan,
  ladeVerzeichnis, sperreStunde, spieleMit, storniereBuchung, sucheMitspieler,
} from "@/lib/daten";
import {
  alsUhrzeit, jetztFrei, startMoeglich as pruefeStart, zuMinuten,
  type Belegung, type Buchungsart, type Fenster, type Mitglied,
} from "@/lib/plan";
import { Bildschirm } from "@/components/Bildschirm";
import { BuchungsFenster } from "@/components/BuchungsFenster";
import { MiniZeitleiste, Schraffur } from "@/components/MiniZeitleiste";
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

/** Fuer die Datums-Kachel: "MO" und "28" */
function kachel(datum: string): { wochentag: string; tag: number } {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(j!, (m ?? 1) - 1, t);
  const wochentag = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(d);
  return { wochentag: wochentag.replace(".", "").toUpperCase(), tag: d.getDate() };
}

type Platz = Awaited<ReturnType<typeof ladePlaetze>>[number];

/**
 * Die Plaetze - Zeit zuerst (Entwurf AppPlaetze, docs/design/clubhaus).
 *
 * Oben der Tag (heute bis lead_days), darunter "Wann willst du spielen?" mit
 * den Startzeiten im Raster slot_minutes. Die Liste zeigt fuer alle Plaetze,
 * was zu dieser Zeit los ist - frei, belegt, eigene Buchung, Mitspieler
 * gesucht, Training, gesperrt -, darunter die Zeitleiste des ganzen Tages.
 * Die Feinwahl :00/:30 und die Spielform passieren im Blatt.
 *
 * Ob gebucht werden kann, entscheidet canStartAt (@tcm/core); durchgesetzt
 * wird es ausschliesslich in create_booking.
 */
export default function Plan() {
  const { stil, farben } = useTheme();
  const parameter = useLocalSearchParams<{ buchen?: string }>();
  const [datum, setDatum] = useState(heuteInBerlin());
  const [zeit, setZeit] = useState<number | null>(null);
  const [plaetze, setPlaetze] = useState<Platz[]>([]);
  const [belegung, setBelegung] = useState<Belegung[]>([]);
  const [arten, setArten] = useState<Buchungsart[]>([]);
  const [verzeichnis, setVerzeichnis] = useState<Mitglied[]>([]);
  const [kontingent, setKontingent] = useState({ used: 0, allowed: 0 });
  const [einstellungen, setEinstellungen] =
    useState<Awaited<ReturnType<typeof ladeBuchungseinstellungen>>>(null);
  const [admin, setAdmin] = useState(false);
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
    setArten(a); setVerzeichnis(v); setAdmin(ich.admin); setMeineId(ich.id);
    setGeladenFuer(tag);
    setLaedt(false);
  }, []);

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

  /**
   * Die waehlbaren Startzeiten des Tages. Heute ab der naechsten Startzeit im
   * Raster; ist der Tag vorbei, bleibt die letzte, damit die Liste nicht
   * leer steht und eigene Buchungen erreichbar bleiben.
   */
  const zeiten = useMemo(() => {
    const ab = datum === heute ? nextSlotMinute({ openingMinutes: oeffnung, slotMinutes: raster }) : oeffnung;
    const out: number[] = [];
    for (let m = ab; m + dauer <= schluss; m += raster) out.push(m);
    if (out.length === 0) {
      out.push(oeffnung + Math.floor((schluss - dauer - oeffnung) / raster) * raster);
    }
    return out;
  }, [datum, heute, oeffnung, schluss, raster, dauer]);

  /** Kann auf diesem Platz um genau diese Minute eine Buchung beginnen? */
  const startMoeglich = useCallback(
    (courtId: string, minute: number) =>
      pruefeStart({
        day: datum, courtId, minute, durationMinutes: dauer, closingMinutes: schluss,
        occupied: belegung,
      }),
    [belegung, datum, dauer, schluss],
  );

  // Vorauswahl: die erste Zeit, zu der irgendein Platz frei ist.
  useEffect(() => {
    if (zeit !== null && zeiten.includes(zeit)) return;
    const frei = zeiten.find((m) => plaetze.some((p) => startMoeglich(p.id, m)));
    setZeit(frei ?? zeiten[0] ?? null);
  }, [zeiten, plaetze, startMoeglich, zeit]);

  const gewaehlt = zeit ?? zeiten[0] ?? oeffnung;

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
    setZeit(erster.fromMinute);
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
   * geaendert werden darf, entscheidet das Blatt. Sperrungen nur fuer Admins.
   */
  function oeffnebar(st: CourtStatus<Belegung>): boolean {
    if (!st.belegung) return false;
    if (st.art === "gesperrt") return admin;
    return st.art === "eigen" || st.art === "sucht" || st.art === "belegt" || st.art === "serie";
  }

  function tippen(platz: Platz, st: CourtStatus<Belegung>) {
    if (st.art === "frei") {
      if (kontingentAus) {
        setMeldung({ ok: false, text: "Dein Kontingent ist ausgeschöpft." });
        return;
      }
      oeffneBuchen(platz, gewaehlt, datum);
      return;
    }
    if (oeffnebar(st) && st.belegung) {
      setFensterFehler(null);
      setFenster({ modus: "verwalten", belegung: st.belegung, platzName: platz.name, tag: datum });
    }
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
  const stornieren = (id: string) => mitLauf(async () => ergebnis(await storniereBuchung(id)));

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

  // Beschriftung der Zeitleiste: alle drei Stunden ab der Oeffnung
  const skala = useMemo(() => {
    const out: { text: string; links: number }[] = [];
    for (let m = Math.ceil(oeffnung / 60) * 60; m < schluss; m += 180) {
      out.push({ text: alsUhrzeit(m).slice(0, 2), links: timelinePosition(m, oeffnung, schluss) });
    }
    return out;
  }, [oeffnung, schluss]);

  return (
    <>
      <Bildschirm laedt={laedt} aktualisiert={aktualisiert} onAktualisieren={vonHand}>
        {/* Datums-Kacheln, bis an den Rand wischbar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -abstand.rand }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: abstand.rand }}
        >
          {tage.map((t) => {
            const aktiv = t === datum;
            const k = kachel(t);
            return (
              <Pressable
                key={t}
                onPress={() => setDatum(t)}
                accessibilityRole="button"
                accessibilityState={{ selected: aktiv }}
                accessibilityLabel={lesbar(t)}
                style={{
                  width: 58, height: 70, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 2,
                  backgroundColor: aktiv ? farben.gold : farben.surf2,
                }}
              >
                <Text style={{ fontSize: 11, letterSpacing: 0.9, fontFamily: "Barlow_700Bold", color: aktiv ? farben.onGold : farben.ink2 }}>
                  {k.wochentag}
                </Text>
                <Text style={{ fontSize: 26, lineHeight: 28, fontFamily: "BarlowSemiCondensed_700Bold", color: aktiv ? farben.onGold : farben.ink2 }}>
                  {k.tag}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[stil.kicker, { marginTop: 6 }]}>Wann willst du spielen?</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -abstand.rand, marginTop: -2 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: abstand.rand }}
        >
          {zeiten.map((m) => {
            const aktiv = m === gewaehlt;
            return (
              <Pressable
                key={m}
                onPress={() => setZeit(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: aktiv }}
                accessibilityLabel={`${alsUhrzeit(m)} Uhr`}
                style={{
                  height: 38, paddingHorizontal: 15, borderRadius: 19, justifyContent: "center",
                  backgroundColor: aktiv ? farben.ink : farben.surf2,
                }}
              >
                <Text style={{ fontSize: 14.5, fontFamily: aktiv ? "Barlow_700Bold" : "Barlow_500Medium", fontVariant: ["tabular-nums"], color: aktiv ? farben.bg : farben.ink2 }}>
                  {alsUhrzeit(m)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

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

        {/* Eine gruppierte Karte mit allen Plaetzen */}
        <View
          style={{
            backgroundColor: farben.surf, borderWidth: 1, borderColor: farben.line,
            borderRadius: radius.karteGross - 2, overflow: "hidden", marginTop: 4,
          }}
        >
          <View style={{ height: 30, marginHorizontal: 16, borderBottomWidth: 1, borderBottomColor: farben.line }}>
            {skala.map((s, i) => (
              <Text
                key={s.text}
                style={{
                  position: "absolute", top: 9, left: `${s.links}%`,
                  transform: [{ translateX: i === 0 ? 0 : -7 }],
                  fontSize: 11, fontFamily: "Barlow_600SemiBold", color: farben.muted,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {s.text}
              </Text>
            ))}
          </View>

          {plaetze.map((platz, i) => {
            const st = courtStatusAt({
              day: datum, courtId: platz.id, minute: gewaehlt, durationMinutes: dauer,
              closingMinutes: schluss, occupied: belegung,
            });
            return (
              <Platzzeile
                key={platz.id}
                platz={platz}
                status={st}
                letzte={i === plaetze.length - 1}
                oeffnebar={st.art === "frei" || oeffnebar(st)}
                segmente={timelineSegments(belegung.filter((b) => b.court_id === platz.id), oeffnung, schluss)}
                markierung={timelinePosition(gewaehlt, oeffnung, schluss)}
                onTippen={() => tippen(platz, st)}
              />
            );
          })}
        </View>

        <Legende />
      </Bildschirm>

      {fenster && (
        <BuchungsFenster
          fenster={fenster}
          arten={arten}
          verzeichnis={verzeichnis}
          meineId={meineId}
          rasterMinuten={raster}
          anzeigeMinuten={anzeige}
          gastgebuehrCents={einstellungen?.guest_fee_cents ?? 0}
          istAdmin={admin}
          laeuft={laeuft}
          fehler={fensterFehler}
          onBuchen={buchen}
          onSpeichern={speichern}
          onStornieren={stornieren}
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

/* --- Eine Zeile der Platzliste -------------------------------------------- */

function Platzzeile({
  platz, status, letzte, oeffnebar, segmente, markierung, onTippen,
}: {
  platz: Platz;
  status: CourtStatus<Belegung>;
  letzte: boolean;
  oeffnebar: boolean;
  segmente: ReturnType<typeof timelineSegments>;
  markierung: number;
  onTippen: () => void;
}) {
  const { farben } = useTheme();
  const b = status.belegung;
  const mitspielbar = status.art === "sucht" && b?.bin_dabei !== true;

  const textfarbe =
    status.art === "frei" ? farben.greenInk
      : status.art === "eigen" || status.art === "sucht" ? farben.goldInk
        : farben.muted;

  const aktion = status.art === "frei" ? (
    <View style={{ height: 38, paddingHorizontal: 16, borderRadius: 19, justifyContent: "center", backgroundColor: farben.gold }}>
      <Text style={{ color: farben.onGold, fontSize: 14, fontFamily: "Barlow_700Bold" }}>Buchen</Text>
    </View>
  ) : mitspielbar ? (
    <View style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: "center", borderWidth: 1.5, borderColor: farben.goldLine }}>
      <Text style={{ color: farben.goldInk, fontSize: 14, fontFamily: "Barlow_700Bold" }}>Mitspielen</Text>
    </View>
  ) : status.art === "gesperrt" ? (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3" stroke={farben.muted} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ) : oeffnebar ? (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" stroke={farben.muted} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ) : null;

  const hinweis =
    status.art === "frei" ? "Buchen"
      : mitspielbar ? "Mitspielen"
        : oeffnebar ? "Details" : undefined;

  return (
    <Pressable
      onPress={onTippen}
      disabled={!oeffnebar}
      accessibilityRole={oeffnebar ? "button" : undefined}
      accessibilityLabel={`${platz.name}, ${status.text}`}
      accessibilityHint={hinweis}
      style={({ pressed }) => ({
        paddingTop: 13, paddingBottom: 14, paddingHorizontal: 16,
        borderBottomWidth: letzte ? 0 : 1, borderBottomColor: farben.line,
        backgroundColor: pressed && oeffnebar ? mitDeckkraft(farben.ink, 0.04) : "transparent",
      })}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, minHeight: 40 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 19, lineHeight: 21, color: farben.ink }}>
            {platz.name}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: "Barlow_600SemiBold", marginTop: 2, color: textfarbe }}>
            {status.text}
          </Text>
        </View>
        {aktion}
      </View>
      <View style={{ marginTop: 10 }}>
        <MiniZeitleiste segmente={segmente} markierung={markierung} hoehe={10} ueberstand={4} />
      </View>
    </Pressable>
  );
}

/* --- Legende -------------------------------------------------------------- */

function Legende() {
  const { farben } = useTheme();
  const eintraege: { name: string; art: TimelineKind }[] = [
    { name: "Deine", art: "eigen" },
    { name: "Belegt", art: "belegt" },
    { name: "Sucht Mitspieler", art: "sucht" },
    { name: "Training", art: "serie" },
    { name: "Gesperrt", art: "gesperrt" },
  ];
  const flaeche: Record<TimelineKind, object> = {
    eigen: { backgroundColor: farben.gold },
    belegt: { backgroundColor: farben.blue },
    sucht: { backgroundColor: farben.goldSoft, borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine },
    serie: { backgroundColor: farben.surf3 },
    gesperrt: { backgroundColor: farben.surf3 },
  };

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8, marginTop: 2 }}>
      {eintraege.map((e) => (
        <View key={e.art} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[{ width: 18, height: 10, borderRadius: 4, overflow: "hidden" }, flaeche[e.art]]}>
            {e.art === "serie" && <Schraffur farbe={mitDeckkraft(farben.ink, 0.18)} />}
          </View>
          <Text style={{ fontSize: 12.5, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>{e.name}</Text>
        </View>
      ))}
    </View>
  );
}
