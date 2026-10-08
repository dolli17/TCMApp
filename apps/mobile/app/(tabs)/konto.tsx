import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatCents, sumOpenDrinks, CHARGE_KIND_LABEL, type ChargeKind } from "@tcm/core";
import { abstand, radius } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import { Blatt, BlattKopf } from "@/components/Blatt";
import { Glocke } from "@/components/Glocke";
import { MerkmaleKarte, type MerkmalZeile } from "@/components/MerkmaleKarte";
import { Schalter, Segmente } from "@/components/Segmente";
import { Stammdatenformular } from "@/components/Stammdatenformular";
import {
  abmelden, ladeArbeitsdienst, ladeEigeneGetraenke, ladeMeineForderungen, ladeMeineMannschaft,
  ladeMeineMerkmale, ladeMeineMitgliedschaft, ladeMeineStammdaten, ladeMeinMandat,
  speichereNotfallkontakt, speichereStammdaten,
  type Notfallkontakt, type Stammdaten,
} from "@/lib/daten";
import { abschnitt, useLaden } from "@/lib/laden";
import { istAngemeldet, meldeGeraetAb, registriereGeraet } from "@/lib/push";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme, type ThemeWahl } from "@/lib/theme";

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "Europe/Berlin" });

type Blattart = "daten" | "notfall" | "einwilligungen" | "bank";

/**
 * Konto (Entwurf AppKonto, docs/design/clubhaus)
 *
 * Oben wer man ist, darunter was offen ist und der Arbeitsdienst. Die
 * Einstellungen stehen als gruppierte Liste; Stammdaten, Notfallkontakt,
 * Einwilligungen und das Mandat oeffnen je ein eigenes Blatt, statt als
 * lange Formulare die Seite zu fuellen. Inhaltlich sind die Formulare
 * dieselben wie vorher.
 */
export default function Konto() {
  const { stil, farben } = useTheme();
  const rand = useSafeAreaInsets();
  const [blatt, setBlatt] = useState<Blattart | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const laden = useCallback(async () => {
    // Jede Quelle fuer sich: schlaegt eine fehl (etwa das Mandat), zeigt nur
    // ihr Abschnitt den Fehler, und der Rest der Seite bleibt gefuellt.
    const [forderungen, dienst, stammdaten, merkmale, mannschaft, mitgliedschaft, mandat, getraenke] =
      await Promise.allSettled([
        ladeMeineForderungen(),
        ladeArbeitsdienst(),
        ladeMeineStammdaten(),
        ladeMeineMerkmale(),
        ladeMeineMannschaft(),
        ladeMeineMitgliedschaft(),
        ladeMeinMandat(),
        ladeEigeneGetraenke(),
      ]);
    return {
      forderungen: abschnitt(forderungen),
      dienst: abschnitt(dienst),
      stammdaten: abschnitt(stammdaten),
      merkmale: abschnitt(merkmale),
      mannschaft: abschnitt(mannschaft),
      mitgliedschaft: abschnitt(mitgliedschaft),
      mandat: abschnitt(mandat),
      getraenke: abschnitt(getraenke),
    };
  }, []);

  const zustand = useLaden(laden);
  const d = zustand.daten;
  const stammdaten = d?.stammdaten.wert ?? null;
  const merkmale = (d?.merkmale.wert ?? []) as unknown as MerkmalZeile[];
  const mannschaft = d?.mannschaft.wert ?? null;
  const mitgliedschaft = d?.mitgliedschaft.wert ?? null;
  // Forderungen und Getraenke bilden zusammen einen Abschnitt.
  const forderungsFehler = d?.forderungen.fehler ?? d?.getraenke.fehler ?? null;

  // Offen ist, was noch eingezogen oder bezahlt werden muss. "returned" zaehlt
  // mit: eine zurueckgebuchte Lastschrift ist Geld, das der Verein nicht
  // bekommen hat - die Forderung steht wieder offen.
  const offen = (d?.forderungen.wert ?? []).filter(
    (f) => f.status === "open" || f.status === "notified" || f.status === "returned",
  );
  const zurueck = offen.filter((f) => f.status === "returned");
  // Die Getraenke des laufenden Monats sind noch keine Forderung - sie stehen
  // trotzdem da, damit "Zusammen" die ehrliche Zahl ist.
  const getraenkeLaufend = sumOpenDrinks(d?.getraenke.wert ?? []);
  const summe = offen.reduce((s, f) => s + f.amount_cents, 0) + getraenkeLaufend;

  const vorname = stammdaten?.first_name ?? "";
  const nachname = stammdaten?.last_name ?? "";
  const initialen = `${vorname.charAt(0)}${nachname.charAt(0)}`.toUpperCase();

  const dienst = d?.dienst.wert ?? null;
  const ist = Number(dienst?.completed_hours ?? 0);
  const soll = Number(dienst?.required_hours ?? 0);

  async function gespeichert() {
    setBlatt(null);
    await zustand.erneutHolen();
  }

  return (
    <>
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
        kopf={
          // Kein grosser Titel: oben steht, wer man ist. Die Glocke bleibt rechts.
          <View style={{ paddingTop: rand.top + 12, paddingHorizontal: abstand.rand, alignItems: "flex-end" }}>
            <Glocke />
          </View>
        }
      >
        {/* --- Profilkopf -------------------------------------------------- */}
        <View style={{ alignItems: "center", marginTop: -8 }}>
          <View
            style={{
              width: 88, height: 88, borderRadius: 44, backgroundColor: farben.brand,
              alignItems: "center", justifyContent: "center",
            }}
            accessibilityElementsHidden
          >
            <Text style={{ color: "#FFFFFF", fontSize: 30, fontFamily: "Barlow_800ExtraBold" }}>{initialen}</Text>
          </View>
          <Text
            accessibilityRole="header"
            style={{ marginTop: 14, fontSize: 28, lineHeight: 32, fontFamily: "Barlow_800ExtraBold", color: farben.ink, textAlign: "center" }}
          >
            {vorname} {nachname}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 }}>
            {mitgliedschaft && <Marke>Mitglied seit {mitgliedschaft.seit.slice(0, 4)}</Marke>}
            {mannschaft && <Marke>{mannschaft.name}</Marke>}
            {mannschaft?.mannschaftsfuehrer && <Marke gelb>Mannschaftsführer</Marke>}
          </View>
          {d?.stammdaten.fehler && (
            <Text style={[stil.hinweisFehler, { marginTop: 10 }]}>{d.stammdaten.fehler}</Text>
          )}
        </View>

        {meldung && <Text style={stil.hinweisErfolg} accessibilityLiveRegion="polite">{meldung}</Text>}

        {/* --- Offene Forderungen ----------------------------------------- */}
        <Abschnitt titel="Offene Forderungen" />
        {forderungsFehler && <Text style={stil.hinweisFehler}>{forderungsFehler}</Text>}
        {zurueck.length > 0 && (
          <Text style={stil.hinweisFehler}>
            {zurueck.length === 1 ? "Eine Lastschrift kam zurück" : `${zurueck.length} Lastschriften kamen zurück`}
            {" – die Beträge sind wieder offen. Bitte melde dich beim Verein."}
          </Text>
        )}
        <Gruppe>
          {offen.map((f, i) => (
            <Zeile key={f.id} erste={i === 0} hoehe={64}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15.5, fontFamily: "Barlow_600SemiBold", color: farben.ink }} numberOfLines={1}>
                  {CHARGE_KIND_LABEL[f.kind as ChargeKind] ?? f.kind}
                  {f.period_label ? ` ${f.period_label}` : ""}
                  {f.is_for_other ? ` · für ${f.member_name}` : ""}
                </Text>
                {f.description ? (
                  <Text style={[stil.leise, { fontSize: 12.5, marginTop: 2 }]} numberOfLines={2}>{f.description}</Text>
                ) : null}
                <Statusmarke status={f.status} faellig={f.due_date} />
              </View>
              <Betrag>{formatCents(f.amount_cents)}</Betrag>
            </Zeile>
          ))}
          {getraenkeLaufend > 0 && (
            <Zeile erste={offen.length === 0} hoehe={64}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15.5, fontFamily: "Barlow_600SemiBold", color: farben.ink }}>
                  Getränke {MONAT.format(new Date())}
                </Text>
                <Statusmarke status="laufend" />
              </View>
              <Betrag>{formatCents(getraenkeLaufend)}</Betrag>
            </Zeile>
          )}
          {offen.length === 0 && getraenkeLaufend === 0 ? (
            <Zeile erste>
              <Text style={stil.leise}>Nichts offen.</Text>
            </Zeile>
          ) : (
            <View
              style={{
                flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                paddingVertical: 14, paddingHorizontal: 16, backgroundColor: farben.surf2,
              }}
            >
              <Text style={{ fontSize: 14, fontFamily: "Barlow_700Bold", color: farben.ink2 }}>Zusammen</Text>
              <Text style={{ fontSize: 21, fontFamily: "BarlowSemiCondensed_700Bold", color: farben.ink }}>
                {formatCents(summe)}
              </Text>
            </View>
          )}
        </Gruppe>

        {/* --- Arbeitsdienst ----------------------------------------------- */}
        {d?.dienst.fehler && <Text style={stil.hinweisFehler}>Arbeitsdienst: {d.dienst.fehler}</Text>}
        {dienst && (
          <View style={[stil.listenkarte, { borderRadius: radius.karte, padding: 16, gap: 0 }]}>
            <View style={[stil.zeile, { alignItems: "baseline" }]}>
              <Text style={{ fontSize: 15.5, fontFamily: "Barlow_700Bold", color: farben.ink }}>
                Arbeitsdienst {dienst.year}
              </Text>
              <Betrag>{soll > 0 ? `${ist} / ${soll} h` : `${ist} h`}</Betrag>
            </View>
            {soll > 0 && (
              <View
                style={{ height: 8, borderRadius: 4, backgroundColor: farben.surf2, marginTop: 12, overflow: "hidden" }}
                accessibilityLabel={`${ist} von ${soll} Stunden geleistet`}
              >
                <View style={{ width: `${Math.min(100, (ist / soll) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: farben.green }} />
              </View>
            )}
            <Text style={[stil.leise, { marginTop: 10, lineHeight: 18 }]}>
              {soll === 0
                ? "Für dieses Jahr ist kein Arbeitsdienst vorgesehen."
                : ist >= soll
                  ? "Erledigt – danke für deinen Einsatz."
                  : "Fehlende Stunden werden zum Jahresende als Ausgleich berechnet."}
            </Text>
          </View>
        )}

        {/* --- Einstellungen ----------------------------------------------- */}
        <Abschnitt titel="Einstellungen" />
        <Gruppe>
          <Eintrag erste symbol={SYMBOL.person} titel="Meine Daten" onPress={() => setBlatt("daten")} />
          <Eintrag symbol={SYMBOL.telefon} titel="Notfallkontakt" onPress={() => setBlatt("notfall")} />
          {merkmale.some((z) => z.self_editable) && (
            <Eintrag symbol={SYMBOL.haken} titel="Einwilligungen" onPress={() => setBlatt("einwilligungen")} />
          )}
          <Eintrag symbol={SYMBOL.bank} titel="Bankverbindung & Mandat" onPress={() => setBlatt("bank")} />
          <PushZeile />
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, borderTopWidth: 1, borderTopColor: farben.line, gap: 10 }}>
            <Text style={{ fontSize: 15.5, fontFamily: "Barlow_600SemiBold", color: farben.ink }}>Erscheinungsbild</Text>
            <ThemeWahl />
          </View>
        </Gruppe>

        {/* --- Rechtliches und Abmelden ----------------------------------- */}
        <Gruppe>
          {SITE_URL !== "" && (
            <>
              <Verweis erste titel="Datenschutz" onPress={() => Linking.openURL(`${SITE_URL}/datenschutz`)} />
              <Verweis titel="Impressum" onPress={() => Linking.openURL(`${SITE_URL}/impressum`)} />
            </>
          )}
          <Verweis
            erste={SITE_URL === ""}
            titel="Abmelden"
            rot
            onPress={async () => {
              // Erst das Geraet abmelden, dann die Sitzung: danach fehlt die
              // Berechtigung, und die Marke bliebe beim Vorbesitzer stehen.
              await meldeGeraetAb().catch(() => {});
              await abmelden();
              router.replace("/anmelden");
            }}
          />
        </Gruppe>
      </Bildschirm>

      {/* --- Die Blaetter ---------------------------------------------------- */}
      {blatt && (
        <Blatt onSchliessen={() => setBlatt(null)}>
          {(zu) => (
            <>
              {(blatt === "daten" || blatt === "notfall") && !stammdaten && (
                <>
                  <BlattKopf titel={blatt === "daten" ? "Meine Daten" : "Notfallkontakt"} onZu={zu} />
                  <Text style={stil.hinweisFehler}>
                    {d?.stammdaten.fehler ?? "Deine Daten konnten nicht geladen werden."}
                  </Text>
                </>
              )}
              {blatt === "daten" && stammdaten && (
                <>
                  <BlattKopf titel="Meine Daten" onZu={zu} />
                  <Stammdatenformular
                    imBlatt
                    titel="Person und Kontakt"
                    erklaerung="Änderungen sind sofort für den Verein sichtbar. E-Mail und Geburtsdatum ändert der Vorstand."
                    felder={[
                      { name: "first_name", label: "Vorname" },
                      { name: "last_name", label: "Nachname" },
                      { name: "title", label: "Titel" },
                      { name: "phone", label: "Telefon", art: "telefon" },
                      { name: "mobile", label: "Mobil", art: "telefon" },
                      { name: "street", label: "Straße" },
                      { name: "postcode", label: "PLZ" },
                      { name: "city", label: "Ort" },
                    ]}
                    werte={stammdaten}
                    onSpeichern={async (neu) => {
                      const r = await speichereStammdaten(neu as Stammdaten, stammdaten);
                      if (r.ok) setMeldung(r.meldung);
                      return r;
                    }}
                    onGespeichert={gespeichert}
                  />
                </>
              )}
              {blatt === "notfall" && stammdaten && (
                <>
                  <BlattKopf titel="Notfallkontakt" onZu={zu} />
                  <Stammdatenformular
                    imBlatt
                    titel="Notfallkontakt"
                    erklaerung="Wen sollen wir anrufen, wenn auf der Anlage etwas passiert?"
                    felder={[
                      { name: "emergency_contact_name", label: "Name" },
                      { name: "emergency_contact_phone", label: "Telefon", art: "telefon" },
                      { name: "emergency_contact_relation", label: "Verhältnis" },
                    ]}
                    werte={stammdaten}
                    onSpeichern={async (neu) => {
                      const r = await speichereNotfallkontakt(neu as unknown as Notfallkontakt);
                      if (r.ok) setMeldung(r.meldung);
                      return r;
                    }}
                    onGespeichert={gespeichert}
                  />
                </>
              )}
              {blatt === "einwilligungen" && (
                <>
                  <BlattKopf titel="Einwilligungen" onZu={zu} />
                  {d?.merkmale.fehler ? (
                    <Text style={stil.hinweisFehler}>{d.merkmale.fehler}</Text>
                  ) : (
                    <MerkmaleKarte imBlatt zeilen={merkmale} onGeaendert={zustand.erneutHolen} />
                  )}
                </>
              )}
              {blatt === "bank" && (
                <>
                  <BlattKopf titel="Bankverbindung & Mandat" onZu={zu} />
                  {d?.mandat.fehler ? (
                    <Text style={stil.hinweisFehler}>{d.mandat.fehler}</Text>
                  ) : (
                    <MandatAnsicht mandat={d?.mandat.wert ?? null} />
                  )}
                </>
              )}
            </>
          )}
        </Blatt>
      )}
    </>
  );
}

/**
 * Datenschutz und Impressum liegen im Web, nicht in der App: ein Text, den
 * der Vorstand pflegt, ohne dass ein neuer Build in den Store muss. Die
 * Basisadresse kommt aus EXPO_PUBLIC_SITE_URL (eas.json); solange sie fehlt -
 * lokal, ohne Domain - bleiben die Zeilen weg, statt ins Leere zu zeigen.
 */
const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

const SYMBOL = {
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  telefon: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  haken: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  bank: "M2 7h20v12H2zM2 11h20M6 15h4",
  glocke: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
};

/* --- Bausteine ------------------------------------------------------------ */

function Abschnitt({ titel }: { titel: string }) {
  const { stil } = useTheme();
  return (
    <Text style={[stil.abschnitt, { marginTop: abstand.abschnitt - abstand.m }]} accessibilityRole="header">
      {titel}
    </Text>
  );
}

function Gruppe({ children }: { children: ReactNode }) {
  const { stil } = useTheme();
  return (
    <View style={[stil.listenkarte, { padding: 0, borderRadius: radius.karte, overflow: "hidden" }]}>{children}</View>
  );
}

function Zeile({ children, erste, hoehe = 52 }: { children: ReactNode; erste?: boolean; hoehe?: number }) {
  const { farben } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, minHeight: hoehe,
        paddingVertical: 12, paddingHorizontal: 16,
        borderTopWidth: erste ? 0 : 1, borderTopColor: farben.line,
      }}
    >
      {children}
    </View>
  );
}

function Betrag({ children }: { children: ReactNode }) {
  const { farben } = useTheme();
  return (
    <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 19, color: farben.ink, fontVariant: ["tabular-nums"] }}>
      {children}
    </Text>
  );
}

function Marke({ children, gelb }: { children: ReactNode; gelb?: boolean }) {
  const { farben } = useTheme();
  return (
    <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: "center", backgroundColor: gelb ? farben.goldSoft : farben.surf2 }}>
      <Text style={{ fontSize: 12.5, fontFamily: "Barlow_600SemiBold", color: gelb ? farben.goldInk : farben.ink2 }}>{children}</Text>
    </View>
  );
}

/** Der Stand einer Forderung - zurueckgebucht in rot, denn da muss das Mitglied etwas tun. */
function Statusmarke({ status, faellig }: { status: string; faellig?: string | null }) {
  const { farben } = useTheme();
  const art =
    status === "notified"
      ? { text: faellig ? `Einzug am ${DATUM.format(new Date(faellig))}` : "angekündigt", bg: farben.goldSoft, fg: farben.goldInk }
      : status === "returned"
        ? { text: "zurückgebucht", bg: mitDeckkraft(farben.red, 0.14), fg: farben.red }
        : status === "laufend"
          ? { text: "läuft noch", bg: farben.surf2, fg: farben.ink2 }
          : { text: "offen", bg: farben.surf2, fg: farben.ink2 };
  return (
    <View style={{ alignSelf: "flex-start", height: 22, paddingHorizontal: 8, borderRadius: 11, marginTop: 5, justifyContent: "center", backgroundColor: art.bg }}>
      <Text style={{ fontSize: 11.5, fontFamily: "Barlow_700Bold", color: art.fg }}>{art.text}</Text>
    </View>
  );
}

function Symbolkachel({ d }: { d: string }) {
  const { farben } = useTheme();
  return (
    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: farben.surf2, alignItems: "center", justifyContent: "center" }}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d={d} stroke={farben.ink2} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function Eintrag({ titel, symbol, onPress, erste }: { titel: string; symbol: string; onPress: () => void; erste?: boolean }) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16,
        borderTopWidth: erste ? 0 : 1, borderTopColor: farben.line,
        backgroundColor: pressed ? mitDeckkraft(farben.ink, 0.04) : "transparent",
      })}
    >
      <Symbolkachel d={symbol} />
      <Text style={{ flex: 1, fontSize: 15.5, fontFamily: "Barlow_600SemiBold", color: farben.ink }}>{titel}</Text>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Path d="M9 6l6 6-6 6" stroke={farben.muted} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

function Verweis({ titel, onPress, rot, erste }: { titel: string; onPress: () => void; rot?: boolean; erste?: boolean }) {
  const { farben } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={rot ? "button" : "link"}
      style={({ pressed }) => ({
        minHeight: 52, justifyContent: "center", paddingHorizontal: 16,
        borderTopWidth: erste ? 0 : 1, borderTopColor: farben.line,
        backgroundColor: pressed ? mitDeckkraft(farben.ink, 0.04) : "transparent",
      })}
    >
      <Text style={{ fontSize: 15.5, fontFamily: rot ? "Barlow_700Bold" : "Barlow_600SemiBold", color: rot ? farben.red : farben.ink }}>
        {titel}
      </Text>
    </Pressable>
  );
}

/**
 * An- und Abmelden fuer Push.
 *
 * Das ist zugleich der Widerruf: ein zusaetzliches Ja/Nein in der Datenbank
 * waere eine Attrappe, denn abgeschaltet wird ohnehin ueber das Geraet oder
 * hier. Ein Fehlschlag steht als Satz da und haelt nichts anderes auf - auf
 * dem Simulator etwa gibt es gar keine Kennung.
 */
function PushZeile() {
  const { stil, farben } = useTheme();
  const [an, setAn] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  useEffect(() => {
    istAngemeldet().then(setAn).catch(() => setAn(false));
  }, []);

  async function umschalten(ziel: boolean) {
    setLaeuft(true);
    const r = ziel ? await registriereGeraet() : await meldeGeraetAb();
    setLaeuft(false);
    setMeldung(r.meldung || null);
    if (r.ok) setAn(ziel);
  }

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: farben.line, paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 36 }}>
        <Symbolkachel d={SYMBOL.glocke} />
        <Text style={{ flex: 1, fontSize: 15.5, fontFamily: "Barlow_600SemiBold", color: farben.ink }}>
          Mitteilungen aufs Handy
        </Text>
        <Schalter an={an} onWechsel={umschalten} deaktiviert={laeuft} beschriftung="Mitteilungen aufs Handy" />
      </View>
      {meldung && <Text style={[stil.leise, { marginLeft: 44 }]}>{meldung}</Text>}
    </View>
  );
}

/** Systemeinstellung als Vorgabe, die Wahl ueberlebt den Neustart. */
function ThemeWahl() {
  const { wahl, setzeWahl } = useTheme();
  return (
    <Segmente<ThemeWahl>
      beschriftung="Erscheinungsbild"
      wert={wahl}
      onWahl={setzeWahl}
      hoehe={38}
      optionen={[
        { wert: "system", label: "System" },
        { wert: "hell", label: "Hell" },
        { wert: "dunkel", label: "Dunkel" },
      ]}
    />
  );
}

/** Das Mandat, nur zum Lesen - geaendert wird es ueber den Vorstand. */
function MandatAnsicht({ mandat }: { mandat: Awaited<ReturnType<typeof ladeMeinMandat>> }) {
  const { stil, farben } = useTheme();
  if (!mandat) {
    return (
      <Text style={stil.text}>
        Es liegt kein SEPA-Mandat vor. Beiträge zahlst du per Überweisung. Wenn du am
        Lastschriftverfahren teilnehmen möchtest, wende dich an den Vorstand.
      </Text>
    );
  }
  const konto = Array.isArray(mandat.bank_accounts) ? mandat.bank_accounts[0] : mandat.bank_accounts;
  const zeilen: [string, string][] = [
    ["Kontoinhaber", konto?.holder ?? "–"],
    ["IBAN", konto?.iban_last4 ? `•••• ${konto.iban_last4}` : "–"],
    ["Bank", konto?.bank_name ?? "–"],
    ["Mandatsreferenz", mandat.reference],
    ["Unterschrieben am", DATUM.format(new Date(mandat.signed_on))],
  ];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: radius.karte, backgroundColor: farben.surf2, overflow: "hidden" }}>
        {zeilen.map(([k, v], i) => (
          <View
            key={k}
            style={{
              flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 12, paddingHorizontal: 16,
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: farben.line,
            }}
          >
            <Text style={stil.leise}>{k}</Text>
            <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold", flexShrink: 1, textAlign: "right" }]}>{v}</Text>
          </View>
        ))}
      </View>
      <Text style={stil.leise}>
        Die Bankverbindung ändert der Vorstand – schreib ihm, wenn sich etwas geändert hat.
      </Text>
    </View>
  );
}
