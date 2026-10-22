/**
 * Eine Veranstaltung (Entwurf Detail)
 *
 * Blauer Kopf mit Zurueck, Eckdaten mit Belegung als Zahl (keine Namen),
 * Beschreibung und darunter die eigene Anmeldung: mit Begleitpersonen und
 * Bemerkung anmelden, aendern, abmelden, Stand auf der Warteliste.
 *
 * Ob es klappt, entscheiden die RPCs; die Knoepfe zeigen nur, was gerade
 * geht. Der Betrag kommt aus der eigenen Forderung - so steht hier dasselbe
 * wie im Konto.
 */

import { useCallback, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  EVENT_KIND_LABEL, EVENT_KIND_TON, eventAbmeldbar, eventAbmeldenKnopf, eventAenderbar, eventAnmeldbar,
  eventAnmeldenKnopf, eventBegonnen, eventBelegungAnteil, eventBelegungText, eventGebuehrCents,
  eventGebuehrHinweis, eventLangeZeit, eventNurWarteliste, eventPersonenText, eventSchluss, eventSchlussVorbei,
  eventStatusMarke, eventTagKurz, eventVorbei, eventWartelisteText, eventZeitText, formatCents, stundenText,
} from "@tcm/core";
import { abstand, radius } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import { MarkeKlein } from "@/components/EventKarte";
import { Rundknopf } from "@/components/Rundknopf";
import {
  aendereVeranstaltungsAnmeldung, ladeVeranstaltung, meldeVonVeranstaltungAb, meldeZuVeranstaltungAn,
  type Ergebnis,
} from "@/lib/daten";
import { useLaden } from "@/lib/laden";
import { mitDeckkraft } from "@/lib/stil";
import { useTheme } from "@/lib/theme";

const MAX_BEGLEITUNG = 20;

export default function Veranstaltung() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { stil, farben } = useTheme();
  const laden = useCallback(() => ladeVeranstaltung(id), [id]);
  const zustand = useLaden(laden);
  const d = zustand.daten;
  const e = d?.event;
  const jetzt = new Date();

  return (
    <Bildschirm
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
      kopf={<Kopf titel={e?.title} />}
    >
      {!zustand.laedt && !e && !zustand.fehler && (
        <Text style={stil.leise}>Diese Veranstaltung gibt es nicht (mehr).</Text>
      )}
      {e && d && (
        <>
          {/* Art, Titel und Zeit stehen im blauen Kopf - hier die Marken. */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <MarkeKlein text={EVENT_KIND_LABEL[e.kind]} ton={EVENT_KIND_TON[e.kind]} />
            {(e.status === "cancelled" || eventVorbei(e, jetzt)) && (
              <MarkeKlein {...eventStatusMarke(e, jetzt)} />
            )}
          </View>
          <Text style={[stil.leise, { fontSize: 14 }]}>{eventLangeZeit(e.starts_at, e.ends_at)}</Text>

          <View style={[stil.karte, { gap: 14 }]}>
            <Eckdatum label="Wann" wert={eventZeitText(e.starts_at, e.ends_at)} />
            {e.location && <Eckdatum label="Ort" wert={e.location} />}
            {e.fee_cents ? (
              <Eckdatum
                label="Preis"
                wert={`${formatCents(e.fee_cents)} pro Person`}
                klein={`${e.companions_allowed ? "Auch für Begleitpersonen. " : ""}Mit der Anmeldung steht der Betrag in deinem Konto und wird per Lastschrift eingezogen.`}
              />
            ) : null}
            {e.kind === "arbeitsdienst" && e.work_hours != null && (
              <Eckdatum
                label="Stunden"
                wert={`${stundenText(e.work_hours)} Std. Arbeitsdienst`}
                klein="Werden nach dem Termin für alle Anwesenden gutgeschrieben."
              />
            )}
            {e.registration_enabled && (
              <Eckdatum
                label="Anmeldeschluss"
                wert={eventTagKurz(eventSchluss(e))}
                klein={e.fee_cents ? "Wer sich danach abmeldet, zahlt trotzdem." : undefined}
              />
            )}
            {e.registration_enabled && (
              <Eckdatum label="Belegung" wert={eventBelegungText(e)}>
                {eventBelegungAnteil(e) != null && (
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: farben.surf2, overflow: "hidden", marginTop: 6 }}>
                    <View
                      style={{
                        height: 8, borderRadius: 4, backgroundColor: farben.green,
                        width: `${Math.round(eventBelegungAnteil(e)! * 100)}%`,
                      }}
                    />
                  </View>
                )}
              </Eckdatum>
            )}
          </View>

          {e.description && (
            <View style={stil.karte}>
              <Text style={[stil.text, { lineHeight: 22 }]}>{e.description}</Text>
            </View>
          )}

          <Anmeldung detail={d} nachher={zustand.erneutHolen} />
        </>
      )}
    </Bildschirm>
  );
}

function Kopf({ titel }: { titel?: string }) {
  const { farben } = useTheme();
  const rand = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: farben.brand, paddingTop: rand.top + 10, paddingBottom: 18,
        paddingHorizontal: abstand.rand, overflow: "hidden",
      }}
    >
      <Svg width={350} height={150} viewBox="0 0 350 150" style={{ position: "absolute", right: 0, top: 0 }}>
        <Path d="M200 150 L250 0 M350 40 L260 150 M230 80 H350" stroke={mitDeckkraft(farben.onBrand, 0.12)} strokeWidth={2} fill="none" />
      </Svg>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/verein/veranstaltungen"))}
        accessibilityRole="button"
        accessibilityLabel="Zurück zu den Veranstaltungen"
        hitSlop={12}
        style={{ alignSelf: "flex-start", paddingVertical: 6 }}
      >
        <Text style={{ color: farben.onBrand, opacity: 0.85, fontSize: 15, fontFamily: "Barlow_600SemiBold" }}>
          ‹ Veranstaltungen
        </Text>
      </Pressable>
      <Text
        accessibilityRole="header"
        style={{ color: farben.onBrand, fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 28, lineHeight: 31, marginTop: 6 }}
      >
        {titel ?? " "}
      </Text>
    </View>
  );
}

function Eckdatum({ label, wert, klein, children }: {
  label: string; wert: string; klein?: string; children?: ReactNode;
}) {
  const { stil, farben } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <Text style={[stil.leise, { width: 112 }]}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[stil.text, { fontFamily: "Barlow_700Bold" }]}>{wert}</Text>
        {klein && <Text style={[stil.leise, { fontSize: 13, lineHeight: 18, marginTop: 2, color: farben.muted }]}>{klein}</Text>}
        {children}
      </View>
    </View>
  );
}

/* --- Die eigene Anmeldung ------------------------------------------------- */

function Anmeldung({
  detail, nachher,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof ladeVeranstaltung>>>;
  nachher: () => Promise<void>;
}) {
  const { stil, farben } = useTheme();
  const { event: e, wartePlatz, forderung } = detail;
  const jetzt = new Date();
  // Abgesagt ist abgesagt: dann zaehlt die Anmeldung nicht mehr, es gibt nur den Hinweis.
  const dabei = e.status !== "cancelled" && (e.mein_status === "registered" || e.mein_status === "waitlisted");
  const [begleitung, setBegleitung] = useState(dabei ? e.meine_begleitpersonen ?? 0 : 0);
  const [bemerkung, setBemerkung] = useState(dabei ? e.meine_bemerkung ?? "" : "");
  const [bearbeiten, setBearbeiten] = useState(false);
  const [frage, setFrage] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  async function tue(arbeit: () => Promise<Ergebnis>, danach?: () => void) {
    setLaeuft(true);
    const r = await arbeit();
    setLaeuft(false);
    setMeldung({ ok: r.ok, text: r.meldung });
    if (r.ok) {
      danach?.();
      await nachher();
    }
  }

  const hinweis = meldung && (
    <Text style={meldung.ok ? stil.hinweisErfolg : stil.hinweisFehler} accessibilityLiveRegion="polite">
      {meldung.text}
    </Text>
  );

  const formular = (aendern: boolean) => (
    <View style={{ gap: 14 }}>
      {e.companions_allowed && (
        <View style={[stil.zeile, { gap: 12 }]}>
          <View style={{ flexShrink: 1 }}>
            <Text style={[stil.text, { fontFamily: "Barlow_700Bold" }]}>Begleitpersonen</Text>
            <Text style={stil.leise}>{e.fee_cents ? `je ${formatCents(e.fee_cents)}` : "Familie, Freunde"}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Rundknopf
              zeichen="minus" beschriftung="Eine Begleitperson weniger" deaktiviert={begleitung <= 0}
              onPress={() => setBegleitung((b) => Math.max(0, b - 1))}
            />
            <Text
              style={{ minWidth: 28, textAlign: "center", fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 22, color: farben.ink }}
              accessibilityLabel={`${begleitung} ${begleitung === 1 ? "Begleitperson" : "Begleitpersonen"}`}
            >
              {begleitung}
            </Text>
            <Rundknopf
              zeichen="plus" gelb beschriftung="Eine Begleitperson mehr" deaktiviert={begleitung >= MAX_BEGLEITUNG}
              onPress={() => setBegleitung((b) => Math.min(MAX_BEGLEITUNG, b + 1))}
            />
          </View>
        </View>
      )}
      <View>
        <Text style={stil.feldLabel}>Bemerkung</Text>
        <TextInput
          style={stil.feld} value={bemerkung} onChangeText={setBemerkung} maxLength={500}
          placeholder="z. B. vegetarisch" placeholderTextColor={farben.muted} accessibilityLabel="Bemerkung"
        />
      </View>
      {!aendern && eventNurWarteliste(e, begleitung) && (
        <Text style={stil.leise}>
          Für {begleitung > 0 ? "euch alle" : "dich"} ist gerade kein Platz frei – du kommst auf die Warteliste
          und rückst automatisch nach, wenn etwas frei wird.
        </Text>
      )}
      <Pressable
        disabled={laeuft}
        accessibilityRole="button"
        onPress={() => void tue(
          () => aendern
            ? aendereVeranstaltungsAnmeldung(e.id, begleitung, bemerkung)
            : meldeZuVeranstaltungAn(e.id, begleitung, bemerkung),
          () => setBearbeiten(false),
        )}
        style={[stil.knopf, stil.knopfGold, { opacity: laeuft ? 0.6 : 1 }]}
      >
        <Text style={[stil.knopfText, stil.knopfGoldText]}>
          {aendern
            ? e.fee_cents && e.mein_status === "registered"
              ? `Änderung sichern · ${formatCents(eventGebuehrCents(e.fee_cents, begleitung))}`
              : "Änderung sichern"
            : eventAnmeldenKnopf(e, begleitung)}
        </Text>
      </Pressable>
      {aendern && (
        <Pressable accessibilityRole="button" onPress={() => setBearbeiten(false)} style={stil.knopfLeise}>
          <Text style={stil.knopfLeiseText}>Abbrechen</Text>
        </Pressable>
      )}
    </View>
  );

  // --- Schon dabei -----------------------------------------------------------
  if (dabei) {
    const wartet = e.mein_status === "waitlisted";
    const offen = forderung && ["open", "notified", "returned"].includes(forderung.status);
    return (
      <View
        style={[
          stil.karte,
          wartet
            ? { backgroundColor: farben.goldSoft, borderColor: farben.goldLine }
            : { backgroundColor: mitDeckkraft(farben.green, 0.1), borderColor: mitDeckkraft(farben.green, 0.35) },
        ]}
      >
        <Text style={[stil.abschnitt, { marginTop: 0 }]} accessibilityRole="header">
          {wartet ? "Du stehst auf der Warteliste" : "Du bist angemeldet"}
        </Text>
        {hinweis}
        {bearbeiten ? formular(true) : (
          <>
            <Text style={[stil.text, { fontFamily: "Barlow_700Bold" }]}>
              {eventPersonenText(e.meine_begleitpersonen ?? 0)}
            </Text>
            {wartet ? (
              <Text style={stil.leise}>{eventWartelisteText(wartePlatz, e.warteliste)}</Text>
            ) : forderung ? (
              <Text style={stil.text}>
                <Text style={{ fontFamily: "BarlowSemiCondensed_700Bold", fontSize: 20 }}>
                  {formatCents(forderung.amount_cents)}
                </Text>{" "}
                {offen ? "steht in deinem Konto unter „Offen“" : "ist im Einzug"}
              </Text>
            ) : null}
            {e.meine_bemerkung && <Text style={stil.leise}>Bemerkung: {e.meine_bemerkung}</Text>}

            {frage ? (
              <View style={{ gap: 8, marginTop: 6 }}>
                <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold" }]}>
                  {!wartet && e.fee_cents && eventSchlussVorbei(e, jetzt)
                    ? "Der Anmeldeschluss ist vorbei – die Gebühr bleibt trotzdem fällig. Wirklich abmelden?"
                    : "Wirklich abmelden?"}
                </Text>
                <Pressable
                  disabled={laeuft}
                  accessibilityRole="button"
                  onPress={() => void tue(() => meldeVonVeranstaltungAb(e.id), () => {
                    setFrage(false);
                    setBegleitung(0);
                    setBemerkung("");
                  })}
                  style={[stil.knopf, { backgroundColor: farben.red, opacity: laeuft ? 0.6 : 1 }]}
                >
                  <Text style={stil.knopfText}>Ja, abmelden</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setFrage(false)} style={stil.knopfLeise}>
                  <Text style={stil.knopfLeiseText}>Nein</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 8, marginTop: 6 }}>
                {eventAenderbar(e, jetzt) && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => { setMeldung(null); setBearbeiten(true); }}
                    style={stil.knopfLeise}
                  >
                    <Text style={stil.knopfLeiseText}>Anmeldung ändern</Text>
                  </Pressable>
                )}
                {eventAbmeldbar(e, jetzt) && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setFrage(true)}
                    style={[stil.knopfLeise, { borderColor: mitDeckkraft(farben.red, 0.5) }]}
                  >
                    <Text style={[stil.knopfLeiseText, { color: farben.redInk }]}>{eventAbmeldenKnopf(e, jetzt)}</Text>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </View>
    );
  }

  // --- Anmelden --------------------------------------------------------------
  if (eventAnmeldbar(e, jetzt)) {
    const gebuehr = eventGebuehrHinweis(e);
    return (
      <View style={stil.karte}>
        <Text style={[stil.abschnitt, { marginTop: 0 }]} accessibilityRole="header">Anmelden</Text>
        {hinweis}
        {formular(false)}
        {gebuehr && <Text style={[stil.leise, { fontSize: 13, lineHeight: 19, marginTop: 4 }]}>{gebuehr}</Text>}
      </View>
    );
  }

  // --- Nichts zu tun ---------------------------------------------------------
  const text = e.status === "cancelled"
    ? "Diese Veranstaltung ist abgesagt."
    : eventVorbei(e, jetzt)
      ? "Diese Veranstaltung ist vorbei."
      : !e.registration_enabled
        ? "Ohne Anmeldung – komm einfach vorbei."
        : eventBegonnen(e, jetzt)
          ? "Die Veranstaltung läuft schon."
          : "Der Anmeldeschluss ist vorbei.";
  return (
    <View style={[stil.karte, { borderRadius: radius.karte }]}>
      {hinweis}
      <Text style={stil.leise}>{text}</Text>
    </View>
  );
}
