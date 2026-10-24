/**
 * Home - der Startbildschirm
 *
 * Was heute zaehlt, auf einen Blick (docs/design/clubhaus, Abschnitt 5):
 * die eigenen naechsten Termine, drei Schnellaktionen, welche Plaetze gerade
 * frei sind, wer Mitspieler sucht, was demnaechst im Verein ansteht, der
 * laufende Monat und die letzten Neuigkeiten.
 *
 * Nur Lesen. Gebucht, mitgespielt und eingetragen wird auf den Bildschirmen,
 * auf die die Knoepfe fuehren.
 *
 * Alle Abschnitte laden parallel und jeder fuer sich: schlaegt einer fehl,
 * steht dort der Fehler, und der Rest bleibt gefuellt.
 *
 * Diese Datei liegt bewusst als (tabs)/home.tsx und nicht als
 * (tabs)/index.tsx - die wuerde mit app/index.tsx um "/" konkurrieren.
 */

import { type ReactNode } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { router, type Href } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import {
  berlinDay, bookingKicker, dayTag, eventDemnaechst, formatCents, notificationZiel, localMinutes, relativeTimeLabel, sumOpenDrinks,
  timelinePosition, timelineSegments, upcomingBookings,
} from "@tcm/core";
import { abstand, radius, schrift } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import { EventKarte } from "@/components/EventKarte";
import { Fehlerzeile } from "@/components/Fehlerzeile";
import { GrosserKopf } from "@/components/GrosserKopf";
import { Leerzustand } from "@/components/Leerzustand";
import { MiniZeitleiste } from "@/components/MiniZeitleiste";
import {
  ladeArbeitsdienst, ladeBenachrichtigungen, ladeBuchungsarten, ladeBuchungseinstellungen,
  ladeEigeneGetraenke, ladeMeineBuchungen, ladeMeinenNamen, ladeOffeneSpiele, ladePlaetze,
  ladeTagesplan, ladeVeranstaltungen,
} from "@/lib/daten";
import { useNachladenBeiFokus } from "@/lib/fokus";
import { abschnitt, ersterFehler, useLaden, type Abschnitt } from "@/lib/laden";
import { alsUhrzeit, jetztFrei, lokaleMinuten, zuMinuten } from "@/lib/plan";
import { SCHRIFT_DECKEL, useGrosseSchrift } from "@/lib/schrift";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

const BERLIN = "Europe/Berlin";
const HEUTE_LANG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long", day: "numeric", month: "long", timeZone: BERLIN,
});
const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: BERLIN });
const heuteInBerlin = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: BERLIN }).format(new Date());

async function ladeHome() {
  const heute = heuteInBerlin();
  const [name, meine, plaetze, plan, einstellungen, arten, offen, getraenke, dienst, neues, events] =
    await Promise.allSettled([
      ladeMeinenNamen(), ladeMeineBuchungen(), ladePlaetze(), ladeTagesplan(heute),
      ladeBuchungseinstellungen(), ladeBuchungsarten(), ladeOffeneSpiele(),
      ladeEigeneGetraenke(), ladeArbeitsdienst(), ladeBenachrichtigungen(3), ladeVeranstaltungen(),
    ]);

  // "Jetzt frei" braucht vier Quellen; fehlt eine, fehlt der Abschnitt.
  const frei: Abschnitt<FreiDaten> =
    plaetze.status === "fulfilled" && plan.status === "fulfilled" &&
    einstellungen.status === "fulfilled" && arten.status === "fulfilled"
      ? {
          wert: {
            heute,
            plaetze: plaetze.value,
            belegung: plan.value,
            einstellungen: einstellungen.value,
            dauer: arten.value[0]?.duration_minutes ?? 60,
          },
          fehler: null,
        }
      : ersterFehler([plaetze, plan, einstellungen, arten]);

  return {
    name: name.status === "fulfilled" ? name.value : null,
    termine: abschnitt(meine),
    frei,
    offen: abschnitt(offen),
    getraenke: abschnitt(getraenke),
    dienst: abschnitt(dienst),
    neues: abschnitt(neues),
    events: abschnitt(events),
  };
}

type FreiDaten = {
  heute: string;
  plaetze: Awaited<ReturnType<typeof ladePlaetze>>;
  belegung: Awaited<ReturnType<typeof ladeTagesplan>>;
  einstellungen: Awaited<ReturnType<typeof ladeBuchungseinstellungen>>;
  dauer: number;
};

export default function Home() {
  const { stil } = useTheme();
  const zustand = useLaden(ladeHome);
  const d = zustand.daten;

  // Zurueck auf Home, etwa nach dem Buchen: still nachladen, ohne Ladekreis.
  useNachladenBeiFokus(zustand.stillNachladen);

  const vorname = d?.name?.vorname;
  const erneut = { onErneut: zustand.neuLaden, laeuft: zustand.aktualisiert };

  return (
    <Bildschirm
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
      kopf={
        <GrosserKopf
          kicker={HEUTE_LANG.format(new Date())}
          titel={vorname ? `Hallo, ${vorname}` : "Hallo"}
        />
      }
    >
      {d && (
        <>
          <AlsNaechstes termine={d.termine} erneut={erneut} />
          <Schnellaktionen />
          <JetztFrei frei={d.frei} erneut={erneut} />
          <OffeneSpiele offen={d.offen} erneut={erneut} />
          <DemnaechstImVerein events={d.events} erneut={erneut} />
          <DeinStand getraenke={d.getraenke} dienst={d.dienst} />
          <Neuigkeiten neues={d.neues} erneut={erneut} />
        </>
      )}
      {!d && !zustand.laedt && <Text style={stil.leise}>Die Startseite konnte nicht geladen werden.</Text>}
    </Bildschirm>
  );
}

/* --- Bausteine ------------------------------------------------------------ */

/** link.label sagt dem Screenreader, was "Alle" meint (U6). */
function Kopfzeile({ titel, link }: { titel: string; link?: { text: string; ziel: Href; label?: string } }) {
  const { stil, farben } = useTheme();
  return (
    <View style={[stil.zeile, { marginTop: abstand.abschnitt - abstand.m, alignItems: "baseline" }]}>
      <Text style={[stil.abschnitt, { marginTop: 0 }]} accessibilityRole="header">{titel}</Text>
      {link && (
        <Pressable
          onPress={() => router.navigate(link.ziel)}
          accessibilityRole="link"
          accessibilityLabel={link.label}
          hitSlop={12}
        >
          <Text style={{ color: farben.blueInk, fontSize: 14, fontFamily: "Barlow_600SemiBold" }}>
            {link.text}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Was ein Abschnitt braucht, um nach einem Fehler neu zu laden. */
type Erneut = { onErneut: () => void; laeuft: boolean };

/** Waagerecht wischbar, bis an den Bildschirmrand - der Inhalt hat 20 Rand. */
function Wischreihe({ children, abstandZwischen = 12 }: { children: ReactNode; abstandZwischen?: number }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -abstand.rand }}
      contentContainerStyle={{ paddingHorizontal: abstand.rand, gap: abstandZwischen }}
    >
      {children}
    </ScrollView>
  );
}

function Symbolpfad({ d, farbe, groesse = 24, staerke = 1.8 }: {
  d: string; farbe: string; groesse?: number; staerke?: number;
}) {
  return (
    <Svg width={groesse} height={groesse} viewBox="0 0 24 24">
      <Path d={d} stroke={farbe} strokeWidth={staerke} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const PFAD = {
  buchen: "M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM12 12v6M9 15h6",
  getraenk: "M6 3h12l-1.5 5.5a5 5 0 0 1-9 0zM12 14v7M8 21h8",
  mitspielen: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6",
  glocke: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
};

/* --- Als Naechstes -------------------------------------------------------- */

type Termine = Awaited<ReturnType<typeof ladeMeineBuchungen>>;

function AlsNaechstes({ termine, erneut }: { termine: Abschnitt<Termine>; erneut: Erneut }) {
  const { stil, farben } = useTheme();
  const { width } = useWindowDimensions();
  const breite = Math.min(318, width - 2 * abstand.rand - 32);

  const kommende = termine.wert ? upcomingBookings(termine.wert) : [];

  return (
    <>
      <Kopfzeile titel="Als Nächstes" link={kommende.length > 0 ? { text: "Alle", ziel: "/plaetze/spiele", label: "Alle Termine" } : undefined} />
      {termine.fehler && <Fehlerzeile text={termine.fehler} {...erneut} />}
      {termine.wert && kommende.length === 0 && (
        <Leerzustand
          titel="Noch nichts geplant"
          text="Such dir einen Platz – heute ist noch einiges frei."
          // Sekundaer: die gelbe Kachel "Platz buchen" steht direkt darunter,
          // und Gelb gibt es je Screen nur einmal (U43).
          handlung={{
            text: "Platz buchen",
            onPress: () => router.navigate({ pathname: "/plaetze", params: { buchen: "jetzt" } }),
          }}
        />
      )}
      {kommende.length > 0 && (
        <Wischreihe>
          {kommende.map((t, i) => {
            const erste = i === 0;
            const zeit = `${alsUhrzeit(lokaleMinuten(t.starts_at))} – ${alsUhrzeit(lokaleMinuten(t.ends_at))}`;
            const mit = t.players.filter((p) => p && p !== t.owner_name);
            const tinte = erste ? farben.onBrand : farben.ink;
            return (
              <Pressable
                key={t.booking_id}
                // Direkt in die Buchung im Blatt, nicht in die Spiele-Liste (U54)
                onPress={() =>
                  router.navigate({
                    pathname: "/plaetze",
                    params: { buchung: t.booking_id, tag: berlinDay(new Date(t.starts_at)) },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`${bookingKicker(t.starts_at, t.ends_at)}, ${zeit}, ${t.court_name}, Details`}
                style={{
                  width: breite, minHeight: 216, borderRadius: radius.karteGross, padding: 20,
                  overflow: "hidden",
                  backgroundColor: erste ? farben.brand : farben.surf,
                  borderWidth: erste ? 0 : 1, borderColor: farben.line,
                }}
              >
                {erste && (
                  <Svg
                    width={breite} height={216} viewBox={`0 0 ${breite} 216`}
                    style={{ position: "absolute", left: 0, top: 0 }}
                  >
                    {/* Platzlinien in Perspektive, dezent */}
                    <Path
                      d={`M${breite * 0.47} 216 L${breite * 0.66} 0 M${breite} 60 L${breite * 0.6} 216 M${breite * 0.57} 100 H${breite} M${breite * 0.63} 40 H${breite}`}
                      stroke={mitDeckkraft(farben.onBrand, 0.13)} strokeWidth={2} fill="none"
                    />
                    <Circle cx={breite - 33} cy={33} r={13} fill={farben.gold} />
                  </Svg>
                )}
                <Text
                  style={[
                    stil.kicker,
                    erste ? { color: farben.onBrand, opacity: 0.85 } : null,
                    { paddingRight: erste ? 40 : 0 },
                  ]}
                >
                  {bookingKicker(t.starts_at, t.ends_at)}
                </Text>
                <Text
                  style={{
                    fontFamily: "BarlowSemiCondensed_700Bold", fontSize: schrift.groesse.hero,
                    lineHeight: schrift.groesse.hero * 1.05, marginTop: 8, color: tinte,
                    fontVariant: ["tabular-nums"],
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {zeit}
                </Text>
                <Text
                  style={{ fontSize: 16, fontFamily: "Barlow_600SemiBold", marginTop: 6, color: tinte, opacity: erste ? 0.92 : 1 }}
                  numberOfLines={1}
                >
                  {t.court_name} · {t.type_name}
                </Text>
                <View style={{ marginTop: "auto", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <Text
                    style={{ flex: 1, fontSize: 13, color: erste ? farben.onBrand : farben.ink2, opacity: erste ? 0.9 : 1, fontFamily: "Barlow_400Regular" }}
                    numberOfLines={1}
                  >
                    {mit.length > 0 ? `mit ${mit.join(", ")}` : t.bin_bucher ? "Du hast gebucht" : `von ${t.owner_name}`}
                  </Text>
                  <View
                    style={{
                      minHeight: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: "center",
                      backgroundColor: erste ? mitDeckkraft(farben.onBrand, 0.18) : farben.surf2,
                    }}
                  >
                    <Text style={{ color: tinte, fontSize: 14, fontFamily: "Barlow_700Bold" }}>Details</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </Wischreihe>
      )}
    </>
  );
}

/* --- Schnellaktionen ------------------------------------------------------ */

function Schnellaktionen() {
  const { farben } = useTheme();
  // Bei grosser Schrift untereinander, Symbol neben dem Text: nebeneinander
  // braeche "eintragen" sonst mitten im Wort (U5).
  const gestapelt = useGrosseSchrift();
  const kacheln: { text: string; pfad: string; ziel: Href; gelb?: boolean }[] = [
    { text: "Platz buchen", pfad: PFAD.buchen, ziel: { pathname: "/plaetze", params: { buchen: "jetzt" } }, gelb: true },
    { text: "Getränk eintragen", pfad: PFAD.getraenk, ziel: "/verein/getraenke" },
    { text: "Mitspielen", pfad: PFAD.mitspielen, ziel: "/plaetze/spiele" },
  ];

  return (
    <View style={{ flexDirection: gestapelt ? "column" : "row", gap: 10, marginTop: abstand.s }}>
      {kacheln.map((k) => {
        const tinte = k.gelb ? farben.onGold : farben.ink;
        return (
          <Pressable
            key={k.text}
            onPress={() => router.navigate(k.ziel)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flex: gestapelt ? undefined : 1, minHeight: gestapelt ? 56 : 96, borderRadius: radius.karte, padding: 14,
              flexDirection: gestapelt ? "row" : "column",
              alignItems: gestapelt ? "center" : undefined,
              gap: gestapelt ? 12 : undefined,
              justifyContent: gestapelt ? "flex-start" : "space-between",
              backgroundColor: k.gelb ? farben.gold : farben.surf,
              borderWidth: k.gelb ? 0 : 1, borderColor: farben.line,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Symbolpfad d={k.pfad} farbe={tinte} staerke={k.gelb ? 2 : 1.8} />
            <Text style={{ color: tinte, fontSize: 15, fontFamily: "Barlow_700Bold", flexShrink: 1 }}>{k.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* --- Jetzt frei ----------------------------------------------------------- */

function JetztFrei({ frei, erneut }: { frei: Abschnitt<FreiDaten>; erneut: Erneut }) {
  const { stil, farben } = useTheme();

  const karten = (() => {
    if (!frei.wert) return [];
    const { heute, plaetze, belegung, einstellungen, dauer } = frei.wert;
    const auf = zuMinuten(String(einstellungen?.opening_time ?? "08:00"));
    const zu = zuMinuten(String(einstellungen?.closing_time ?? "21:00"));
    const jetzt = timelinePosition(localMinutes(new Date()), auf, zu);
    return jetztFrei({
      day: heute,
      courtIds: plaetze.map((p) => p.id),
      openingMinutes: auf,
      closingMinutes: zu,
      slotMinutes: einstellungen?.slot_minutes ?? 30,
      durationMinutes: dauer,
      occupied: belegung,
      leadDays: einstellungen?.lead_days,
    }).map((f) => ({
      id: f.courtId,
      name: plaetze.find((p) => p.id === f.courtId)?.name ?? "",
      bis: alsUhrzeit(f.untilMinute),
      segmente: timelineSegments(belegung.filter((b) => b.court_id === f.courtId), auf, zu),
      jetzt,
    }));
  })();

  return (
    <>
      <Kopfzeile titel="Jetzt frei" link={{ text: "Alle Plätze", ziel: "/plaetze" }} />
      {frei.fehler && <Fehlerzeile text={frei.fehler} {...erneut} />}
      {frei.wert && karten.length === 0 && (
        <Leerzustand
          text="Gerade ist kein Platz frei."
          handlung={{ text: "Belegung ansehen", onPress: () => router.navigate("/plaetze") }}
        />
      )}
      {karten.length > 0 && (
        <Wischreihe abstandZwischen={10}>
          {karten.map((k) => (
            <Pressable
              key={k.id}
              // Das Blatt fuer genau diesen Platz zur naechsten Halbstunde (U54)
              onPress={() => router.navigate({ pathname: "/plaetze", params: { buchen: "jetzt", platz: k.id } })}
              accessibilityRole="button"
              accessibilityLabel={`${k.name}, frei bis ${k.bis}, buchen`}
              style={[stil.listenkarte, { width: 150, borderRadius: radius.karte, padding: 14, gap: 10 }]}
            >
              <View style={stil.zeile}>
                <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 20, color: farben.ink }} numberOfLines={1}>
                  {k.name}
                </Text>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: farben.green }} />
              </View>
              <Text style={{ fontSize: 13, color: farben.greenInk, fontFamily: "Barlow_600SemiBold" }}>
                frei bis {k.bis}
              </Text>
              <MiniZeitleiste segmente={k.segmente} markierung={k.jetzt} />
            </Pressable>
          ))}
        </Wischreihe>
      )}
    </>
  );
}

/* --- Offene Spiele -------------------------------------------------------- */

type Offen = Awaited<ReturnType<typeof ladeOffeneSpiele>>;

function OffeneSpiele({ offen, erneut }: { offen: Abschnitt<Offen>; erneut: Erneut }) {
  const { stil, farben } = useTheme();
  const liste = (offen.wert ?? []).slice(0, 3);

  return (
    <>
      <Kopfzeile titel="Offene Spiele" link={{ text: "Alle", ziel: "/plaetze/spiele", label: "Alle offenen Spiele" }} />
      {offen.fehler && <Fehlerzeile text={offen.fehler} {...erneut} />}
      {offen.wert && liste.length === 0 && (
        <Leerzustand text="Gerade sucht niemand Mitspieler." />
      )}
      {liste.map((o) => (
        <View key={o.booking_id} style={[stil.listenkarte, { borderRadius: radius.karte, padding: 14, flexDirection: "row", alignItems: "center", gap: 14 }]}>
          <View
            style={{
              width: 56, height: 60, borderRadius: 16, alignItems: "center", justifyContent: "center",
              backgroundColor: farben.goldSoft, borderWidth: 1.5, borderStyle: "dashed", borderColor: farben.goldLine,
            }}
          >
            <Text
              maxFontSizeMultiplier={SCHRIFT_DECKEL.form}
              style={{ fontSize: schrift.groesse.kicker, fontFamily: "BarlowSemiCondensed_700Bold", letterSpacing: 0.8, color: farben.ink2 }}
            >
              {dayTag(o.starts_at)}
            </Text>
            <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 19, color: farben.ink }}>
              {alsUhrzeit(lokaleMinuten(o.starts_at))}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[stil.text, { fontFamily: "Barlow_700Bold" }]} numberOfLines={1}>
              {o.type_name} · sucht {o.frei}
            </Text>
            <Text style={[stil.leise, { marginTop: 2 }]} numberOfLines={1}>
              {o.court_name} · {o.owner_name}
            </Text>
          </View>
          {o.bin_dabei ? (
            <Text style={[stil.leise, { fontFamily: "Barlow_700Bold" }]}>Dabei</Text>
          ) : (
            <Pressable
              onPress={() => router.navigate("/plaetze/spiele")}
              accessibilityRole="button"
              accessibilityLabel={`Mitspielen: ${o.type_name} um ${alsUhrzeit(lokaleMinuten(o.starts_at))}`}
              style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: "center", backgroundColor: farben.gold }}
            >
              <Text style={{ color: farben.onGold, fontSize: 14, fontFamily: "Barlow_700Bold" }}>Mitspielen</Text>
            </Pressable>
          )}
        </View>
      ))}
    </>
  );
}

/* --- Demnaechst im Verein ------------------------------------------------- */

type Events = Awaited<ReturnType<typeof ladeVeranstaltungen>>;

function DemnaechstImVerein({ events, erneut }: { events: Abschnitt<Events>; erneut: Erneut }) {
  const liste = eventDemnaechst(events.wert ?? [], new Date());

  return (
    <>
      <Kopfzeile titel="Demnächst im Verein" link={{ text: "Alle", ziel: "/verein/veranstaltungen", label: "Alle Veranstaltungen" }} />
      {events.fehler && <Fehlerzeile text={events.fehler} {...erneut} />}
      {events.wert && liste.length === 0 && <Leerzustand text="Gerade ist nichts geplant." />}
      {liste.map((e) => <EventKarte key={e.id} e={e} aufforderung />)}
    </>
  );
}

/* --- Dein Stand ----------------------------------------------------------- */

type Getraenke = Awaited<ReturnType<typeof ladeEigeneGetraenke>>;
type Dienst = Awaited<ReturnType<typeof ladeArbeitsdienst>>;

function DeinStand({ getraenke, dienst }: { getraenke: Abschnitt<Getraenke>; dienst: Abschnitt<Dienst> }) {
  const { stil, farben } = useTheme();
  const monat = MONAT.format(new Date());
  const ist = Number(dienst.wert?.completed_hours ?? 0);
  const soll = Number(dienst.wert?.required_hours ?? 0);
  // Der Arbeitsdienst zaehlt aufs Jahr, nicht auf den Monat (U55) - darum
  // traegt jede Kachel ihren Zeitraum selbst und die Ueberschrift keinen (U76).
  const jahr = dienst.wert?.year ?? new Date().getFullYear();
  const anteil = soll > 0 ? Math.min(1, ist / soll) : 0;

  const kachel = { flex: 1, borderRadius: radius.karte, padding: 16, gap: 4 } as const;
  const titel = { fontSize: 13, color: farben.muted, fontFamily: "Barlow_600SemiBold" } as const;
  const wert = { fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 28, color: farben.ink } as const;

  return (
    <>
      <Kopfzeile titel="Dein Stand" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={() => router.navigate("/verein/getraenke")}
          accessibilityRole="button"
          accessibilityLabel={
            getraenke.fehler
              ? `Getränke: ${getraenke.fehler}`
              : `Getränke im ${monat}: ${formatCents(sumOpenDrinks(getraenke.wert ?? []))}, läuft noch. Zu den Getränken`
          }
          style={[stil.listenkarte, kachel]}
        >
          <Text style={titel}>Getränke {monat}</Text>
          {getraenke.fehler ? (
            <Text style={[stil.leise, { color: farben.redInk }]}>{getraenke.fehler}</Text>
          ) : (
            <>
              <Text style={wert}>{formatCents(sumOpenDrinks(getraenke.wert ?? []))}</Text>
              <Text style={stil.leise}>läuft noch</Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={() => router.navigate("/konto")}
          accessibilityRole="button"
          accessibilityLabel={
            dienst.fehler
              ? `Arbeitsdienst: ${dienst.fehler}`
              : soll > 0
                ? `Arbeitsdienst ${jahr}: ${ist} von ${soll} Stunden. Zum Konto`
                : `Arbeitsdienst ${jahr}: kein Soll. Zum Konto`
          }
          style={[stil.listenkarte, kachel]}
        >
          <Text style={titel}>Arbeitsdienst {jahr}</Text>
          {dienst.fehler ? (
            <Text style={[stil.leise, { color: farben.redInk }]}>{dienst.fehler}</Text>
          ) : dienst.wert && soll > 0 ? (
            <>
              <Text style={wert}>{ist} / {soll} h</Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: farben.surf2, marginTop: 6, overflow: "hidden" }}>
                <View style={{ width: `${anteil * 100}%`, height: 6, borderRadius: 3, backgroundColor: farben.green }} />
              </View>
            </>
          ) : (
            <Text style={[stil.leise, { marginTop: 4 }]}>Kein Soll für dieses Jahr.</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

/* --- Neuigkeiten ---------------------------------------------------------- */

type Neues = Awaited<ReturnType<typeof ladeBenachrichtigungen>>;

function Neuigkeiten({ neues, erneut }: { neues: Abschnitt<Neues>; erneut: Erneut }) {
  const { stil, farben } = useTheme();
  const liste = (neues.wert ?? []).slice(0, 3);

  return (
    <>
      <Kopfzeile titel="Neuigkeiten" link={liste.length > 0 ? { text: "Alle", ziel: "/nachrichten", label: "Alle Neuigkeiten" } : undefined} />
      {neues.fehler && <Fehlerzeile text={neues.fehler} {...erneut} />}
      {neues.wert && liste.length === 0 && <Leerzustand text="Keine Neuigkeiten." />}
      {liste.length > 0 && (
        <View style={[stil.listenkarte, { borderRadius: radius.karte, padding: 0, overflow: "hidden" }]}>
          {liste.map((n, i) => {
            const ungelesen = !n.read_at;
            const ziel = notificationZiel(n);
            return (
              <Pressable
                key={n.id}
                disabled={!ziel}
                onPress={ziel ? () => router.push(ziel.app as Href) : undefined}
                accessibilityRole={ziel ? "link" : undefined}
                accessibilityLabel={`${ungelesen ? "Neu: " : ""}${n.title}. ${n.body}. ${relativeTimeLabel(n.created_at)}`}
                accessibilityHint={ziel ? "Öffnet die Veranstaltung" : undefined}
                style={{
                  flexDirection: "row", gap: 12, paddingVertical: 14, paddingHorizontal: 16,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: farben.line,
                }}
              >
                <View
                  style={{
                    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
                    backgroundColor: ungelesen ? farben.goldSoft : farben.surf2,
                  }}
                >
                  <Symbolpfad d={PFAD.glocke} farbe={ungelesen ? farben.ink : farben.ink2} groesse={20} staerke={1.9} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 15, fontFamily: "Barlow_700Bold", color: farben.ink }} numberOfLines={2}>
                      {n.title}
                    </Text>
                    <Text style={{ fontSize: schrift.groesse.klein, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
                      {relativeTimeLabel(n.created_at)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13.5, lineHeight: 19, color: farben.ink2, marginTop: 2, fontFamily: "Barlow_400Regular" }} numberOfLines={3}>
                    {n.body}
                  </Text>
                  {ziel && (
                    <Text style={{ fontSize: 13.5, marginTop: 4, color: farben.blueInk, fontFamily: "Barlow_600SemiBold" }}>
                      Zur Veranstaltung ›
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </>
  );
}
