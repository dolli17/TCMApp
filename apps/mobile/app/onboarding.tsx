/**
 * Onboarding nach dem ersten Login
 *
 * Derselbe Assistent wie im Web, in der Optik der App: Reihenfolge, Titel
 * und welche Schritte Pflicht sind, kommen aus @tcm/core (onboardingSchritte),
 * was erledigt ist, aus my_onboarding(). Gespeichert wird je Schritt ueber
 * die Onboarding-RPCs; die Datenbank prueft alles noch einmal selbst.
 *
 * Mit dem SEPA-Mandat ruft der Assistent complete_onboarding() - dann ist
 * das Konto freigeschaltet. Einwilligungen, Tennis und App-Einstellungen
 * folgen danach, lassen sich ueberspringen und bleiben im Konto erreichbar.
 *
 * Erreichbar bleiben waehrenddessen nur Abmelden, Datenschutz, Impressum und
 * die Rechtstexte selbst - alles uebrige sperren Weiche, Tab-Schutz und
 * Datenbank.
 */

import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import {
  LETZTER_PFLICHTSCHRITT, mandatstext, onboardingSchritte, naechsterPflichtschritt,
  type OnboardingSchrittKey, type OnboardingZustand,
} from "@tcm/core";
import { abstand, radius } from "@tcm/ui";
import { Bildschirm, useKompakterTitel } from "@/components/Bildschirm";
import {
  Chipwahl, FormDatum, FormFeld, FormGruppe, FormSchalter, Knopf, Meldung,
} from "@/components/verwaltung/Formular";
import {
  abmelden, akzeptiereDokumente, entferneMerkmal, erteileMandat, ladeOnboarding, passwortSetzen,
  schliesseOnboardingAb, setzeMerkmal, speichereErziehungsberechtigte,
  speichereOnboardingNotfallkontakt, speichereOnboardingStammdaten, speichereTennis,
  type Ergebnis, type Geschlecht, type OnboardingStammdaten,
} from "@/lib/daten";
import { istAngemeldet, meldeGeraetAb, registriereGeraet } from "@/lib/push";
import { useTheme } from "@/lib/theme";
import { isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import { webLink } from "@/lib/web";

const OK: Ergebnis = { ok: true, meldung: "" };

/** Was unter dem Titel steht - je Schritt ein Satz, warum es ihn gibt. */
function einleitung(key: OnboardingSchrittKey, minderjaehrig: boolean): string {
  switch (key) {
    case "passwort":
      return "Lege ein Passwort für dein Konto fest.";
    case "stammdaten":
      return "Bitte prüfe deine Angaben und korrigiere, was nicht stimmt. Geburtsdatum und Geschlecht kannst du nur jetzt selbst ändern, später über den Vorstand.";
    case "rechtliches":
      return "Satzung und Beitragsordnung gelten für alle Mitglieder. Wir speichern, welcher Fassung du wann zugestimmt hast.";
    case "erziehungsberechtigte":
      return "Du bist noch nicht volljährig. Deshalb brauchen wir die Angaben einer erziehungsberechtigten Person und ihre Zustimmung zur Mitgliedschaft.";
    case "notfallkontakt":
      return minderjaehrig
        ? "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert? Bei Minderjährigen ist das Pflicht; vorbelegt sind die Erziehungsberechtigten."
        : "Wen sollen wir anrufen, wenn auf der Anlage etwas passiert? Freiwillig – du kannst den Schritt überspringen.";
    case "sepa":
      return "Der Verein zieht Beiträge per Lastschrift ein. Mit dem Mandat ist dein Konto freigeschaltet.";
    case "einwilligungen":
      return "Freiwillig. Nichts ist vorausgewählt, und du kannst alles später im Konto ändern.";
    case "tennis":
      return "Freiwillig. Das hilft bei der Planung der Mannschaften.";
    case "einstellungen":
      return "Freiwillig. Wie wir dich über deine Buchungen informieren – auch das kannst du später im Konto ändern.";
  }
}

export default function Onboarding() {
  const { stil, farben } = useTheme();
  const [daten, setDaten] = useState<OnboardingZustand | null | undefined>(undefined);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [schritt, setSchritt] = useState<OnboardingSchrittKey | null>(null);
  // In dieser Sitzung freigeschaltet: die freiwilligen Schritte folgen noch,
  // obwohl abgeschlossen_am schon gesetzt ist.
  const [freigeschaltet, setFreigeschaltet] = useState(false);
  const [hinweis, setHinweis] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    ladeOnboarding()
      .then(setDaten)
      .catch((f: unknown) => setLadeFehler(f instanceof Error ? f.message : "Konnte nicht geladen werden."));
  }, []);

  if (ladeFehler) {
    return (
      <Rahmen kopf={<Kopf kicker="Konto einrichten" titel="Das hat nicht geklappt" />}>
        <Text style={stil.hinweisFehler}>{ladeFehler}</Text>
        <Knopf text="Erneut versuchen" onPress={() => router.replace("/")} />
      </Rahmen>
    );
  }

  if (daten === undefined) {
    return (
      <View style={[stil.seite, { justifyContent: "center" }]}>
        <ActivityIndicator color={farben.blue} />
      </View>
    );
  }

  // Kein Mitglied (etwa der Kiosk) oder schon fertig: die Weiche weiss weiter.
  if (daten === null || (daten.abgeschlossen_am && !freigeschaltet)) return <Redirect href="/" />;

  const schritte = onboardingSchritte(daten);
  const aktuell = schritt ?? naechsterPflichtschritt(daten) ?? LETZTER_PFLICHTSCHRITT;
  const index = Math.max(0, schritte.findIndex((s) => s.key === aktuell));
  const info = schritte[index]!;
  const indexSepa = schritte.findIndex((s) => s.key === LETZTER_PFLICHTSCHRITT);
  // Nach der Freischaltung fuehrt kein Weg zurueck in die Pflicht: die RPCs
  // dort lehnen dann ab (Geburtsdatum aendert jetzt der Vorstand).
  const erster = freigeschaltet ? indexSepa + 1 : 0;

  /**
   * Nach dem Speichern eines Schritts: neu laden, beim Verlassen des Mandats
   * freischalten, dann zum naechsten Schritt. Der Zustand wird neu gelesen,
   * weil sich mit dem Geburtsdatum die Schritte aendern koennen.
   */
  async function weiter(): Promise<Ergebnis> {
    let neu: OnboardingZustand | null;
    try {
      neu = await ladeOnboarding();
    } catch (f) {
      return { ok: false, meldung: f instanceof Error ? f.message : "Konnte nicht geladen werden." };
    }
    if (!neu) {
      router.replace("/");
      return OK;
    }
    setDaten(neu);
    setHinweis(null);

    const liste = onboardingSchritte(neu);
    const hier = liste.findIndex((s) => s.key === aktuell);
    const sepaHier = liste.findIndex((s) => s.key === LETZTER_PFLICHTSCHRITT);

    let frei = freigeschaltet;
    if (!frei && hier >= sepaHier) {
      const r = await schliesseOnboardingAb();
      if (!r.ok) {
        const ziel = r.fehlt?.[0];
        if (!ziel) return r;
        setSchritt(ziel);
        setHinweis({ ok: false, text: r.meldung });
        return OK;
      }
      frei = true;
      setFreigeschaltet(true);
      setHinweis({
        ok: true,
        text: "Dein Konto ist freigeschaltet. Die nächsten Schritte sind freiwillig.",
      });
    }

    const naechster = liste[hier + 1];
    if (!naechster) {
      router.replace(frei ? "/home" : "/");
      return OK;
    }
    setSchritt(naechster.key);
    return OK;
  }

  const zurueck = index > erster ? () => {
    setHinweis(null);
    setSchritt(schritte[index - 1]!.key);
  } : undefined;
  const ueberspringen = info.pflicht ? undefined : weiter;
  const letzter = index === schritte.length - 1;
  const gemeinsam = { daten, weiter, zurueck, ueberspringen, letzter };

  return (
    <Rahmen
      key={aktuell}
      kopf={
        <Kopf
          kicker={`Konto einrichten · Schritt ${index + 1} von ${schritte.length}`}
          titel={info.titel}
          fortschritt={schritte.map((s, i) => (i === index ? "jetzt" : s.erledigt ? "erledigt" : "offen"))}
        />
      }
    >
      <Text style={[stil.text, { lineHeight: 22 }]}>{einleitung(aktuell, daten.minderjaehrig)}</Text>
      {hinweis && <Meldung meldung={hinweis} />}

      {aktuell === "passwort" && <SchrittPasswort {...gemeinsam} />}
      {aktuell === "stammdaten" && <SchrittStammdaten {...gemeinsam} />}
      {aktuell === "rechtliches" && <SchrittRechtliches {...gemeinsam} />}
      {aktuell === "erziehungsberechtigte" && <SchrittErziehungsberechtigte {...gemeinsam} />}
      {aktuell === "notfallkontakt" && <SchrittNotfallkontakt {...gemeinsam} />}
      {aktuell === "sepa" && <SchrittSepa {...gemeinsam} />}
      {aktuell === "einwilligungen" && <SchrittEinwilligungen {...gemeinsam} />}
      {aktuell === "tennis" && <SchrittTennis {...gemeinsam} />}
      {aktuell === "einstellungen" && <SchrittEinstellungen {...gemeinsam} />}

      <Fusszeile />
    </Rahmen>
  );
}

type SchrittEigenschaften = {
  daten: OnboardingZustand;
  weiter: () => Promise<Ergebnis>;
  zurueck?: () => void;
  ueberspringen?: () => Promise<Ergebnis>;
  letzter: boolean;
};

/* --- Rahmen ----------------------------------------------------------------- */

function Rahmen({ kopf, children }: { kopf: ReactNode; children: ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <Bildschirm ohneFussleiste kopf={kopf}>
        {children}
      </Bildschirm>
    </KeyboardAvoidingView>
  );
}

function Kopf({
  kicker,
  titel,
  fortschritt,
}: {
  kicker: string;
  titel: string;
  fortschritt?: ("erledigt" | "jetzt" | "offen")[];
}) {
  const { stil, farben } = useTheme();
  useKompakterTitel(titel);
  // Den Sicherheitsabstand oben zieht Bildschirm ein.
  return (
    <View style={{ backgroundColor: farben.bg, paddingTop: 16, paddingHorizontal: abstand.rand, paddingBottom: abstand.m, gap: 6 }}>
      <Text style={stil.kicker}>{kicker}</Text>
      <Text accessibilityRole="header" style={[stil.titel, { fontSize: 30, lineHeight: 34 }]}>{titel}</Text>
      {fortschritt && (
        <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {fortschritt.map((f, i) => (
            <View
              key={i}
              style={{
                flex: 1, height: 5, borderRadius: 3,
                backgroundColor: f === "jetzt" ? farben.blue : f === "erledigt" ? farben.green : farben.surf3,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Weiter, Ueberspringen, Zurueck. Ein Fehler beim Speichern bleibt hier
 * stehen; geht es weiter, verschwindet der Schritt ohnehin.
 */
function Aktionen({
  speichern,
  weiterText,
  zurueck,
  ueberspringen,
  gesperrt,
}: {
  speichern: () => Promise<Ergebnis>;
  weiterText?: string;
  zurueck?: () => void;
  ueberspringen?: () => Promise<Ergebnis>;
  gesperrt?: boolean;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  async function los(tun: () => Promise<Ergebnis>) {
    setLaeuft(true);
    setMeldung(null);
    const r = await tun();
    setLaeuft(false);
    if (!r.ok) setMeldung(r.meldung);
  }

  return (
    <View style={{ gap: abstand.s, marginTop: abstand.s }}>
      {meldung && <Meldung meldung={{ ok: false, text: meldung }} />}
      <Knopf
        text={weiterText ?? "Weiter"}
        art="gold"
        gross
        laeuft={laeuft}
        laeuftText="Wird gespeichert…"
        deaktiviert={gesperrt}
        onPress={() => void los(speichern)}
      />
      {(zurueck || ueberspringen) && (
        <View style={{ flexDirection: "row", gap: abstand.s }}>
          {zurueck && (
            <View style={{ flex: 1 }}>
              <Knopf text="Zurück" art="leise" deaktiviert={laeuft} onPress={zurueck} />
            </View>
          )}
          {ueberspringen && (
            <View style={{ flex: 1 }}>
              <Knopf text="Überspringen" art="leise" deaktiviert={laeuft} onPress={() => void los(ueberspringen)} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Datenschutz und Impressum, und vor allem: Abmelden. */
function Fusszeile() {
  const { farben } = useTheme();
  const datenschutz = webLink("/datenschutz");
  const impressum = webLink("/impressum");
  const verweise: { text: string; onPress: () => void; rot?: boolean }[] = [];
  if (datenschutz) verweise.push({ text: "Datenschutz", onPress: () => void Linking.openURL(datenschutz) });
  if (impressum) verweise.push({ text: "Impressum", onPress: () => void Linking.openURL(impressum) });
  verweise.push({
    text: "Abmelden",
    rot: true,
    onPress: async () => {
      // Erst das Geraet abmelden, dann die Sitzung - wie im Konto.
      await meldeGeraetAb().catch(() => {});
      await abmelden();
      router.replace("/anmelden");
    },
  });

  return (
    <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap", gap: 20, marginTop: abstand.l }}>
      {verweise.map((v) => (
        <Pressable key={v.text} onPress={v.onPress} accessibilityRole={v.rot ? "button" : "link"} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={{ fontSize: 14, fontFamily: "Barlow_600SemiBold", color: v.rot ? farben.redInk : farben.ink2 }}>{v.text}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Welches Feld der letzte Speicherversuch beanstandet hat (Ergebnis.feld).
 * Die Meldung steht dann rot am Feld; sobald man dort tippt, verschwindet sie.
 */
function useFeldfehler() {
  const [fehler, setFehler] = useState<{ feld: string; meldung: string } | null>(null);
  return {
    fuer: (feld: string) => (fehler?.feld === feld ? fehler.meldung : null),
    merke: (r: Ergebnis): Ergebnis => {
      setFehler(!r.ok && r.feld ? { feld: r.feld, meldung: r.meldung } : null);
      return r;
    },
    /** Haengt an onAendern: Tippen nimmt den Fehler am Feld zurueck. */
    leeren:
      <T,>(feld: string, setze: (w: T) => void) =>
      (w: T) => {
        setFehler((f) => (f?.feld === feld ? null : f));
        setze(w);
      },
  };
}

/* --- Die Schritte ------------------------------------------------------------ */

function SchrittPasswort({ daten, weiter, zurueck }: SchrittEigenschaften) {
  const { stil } = useTheme();
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const f = useFeldfehler();

  if (daten.status.passwort) {
    return (
      <>
        <Text style={stil.hinweisErfolg}>Dein Passwort ist gesetzt.</Text>
        <Aktionen speichern={weiter} zurueck={zurueck} />
      </>
    );
  }

  return (
    <>
      <FormGruppe>
        <FormFeld
          label="Passwort"
          wert={passwort}
          onAendern={f.leeren("passwort", setPasswort)}
          sicher
          inhalt="passwort-neu"
          fehler={f.fuer("passwort")}
        />
        <FormFeld
          label="Noch einmal"
          wert={wiederholung}
          onAendern={f.leeren("wiederholung", setWiederholung)}
          sicher
          inhalt="passwort-neu"
          fehler={f.fuer("wiederholung")}
        />
      </FormGruppe>
      <Aktionen
        zurueck={zurueck}
        speichern={async () => {
          // Dieselben Regeln wie in app/passwort-setzen.tsx.
          if (passwort.length < 8) {
            return f.merke({ ok: false, meldung: "Das Passwort braucht mindestens acht Zeichen.", feld: "passwort" });
          }
          if (passwort !== wiederholung) {
            return f.merke({ ok: false, meldung: "Die beiden Eingaben stimmen nicht überein.", feld: "wiederholung" });
          }
          const r = f.merke(await passwortSetzen(passwort));
          return r.ok ? weiter() : r;
        }}
      />
    </>
  );
}

const GESCHLECHTER: { wert: Geschlecht; label: string }[] = [
  { wert: "female", label: "weiblich" },
  { wert: "male", label: "männlich" },
  { wert: "diverse", label: "divers" },
];

function SchrittStammdaten({ daten, weiter, zurueck }: SchrittEigenschaften) {
  const { stil } = useTheme();
  const s = daten.stammdaten;
  const [form, setForm] = useState<OnboardingStammdaten>({
    first_name: s.first_name ?? "",
    last_name: s.last_name ?? "",
    title: s.title ?? "",
    birthday: isoZuDeutsch(s.birthday),
    gender: s.gender ?? "",
    street: s.street ?? "",
    postcode: s.postcode ?? "",
    city: s.city ?? "",
    phone: s.phone ?? "",
    mobile: s.mobile ?? "",
  });
  const f = useFeldfehler();
  const feld = (name: keyof OnboardingStammdaten) =>
    f.leeren(name, (w: string) => setForm((alt) => ({ ...alt, [name]: w })));

  return (
    <>
      <FormGruppe titel="Person">
        <FormFeld label="Vorname" wert={form.first_name} onAendern={feld("first_name")} inhalt="vorname" fehler={f.fuer("first_name")} />
        <FormFeld label="Nachname" wert={form.last_name} onAendern={feld("last_name")} inhalt="nachname" fehler={f.fuer("last_name")} />
        <FormFeld label="Titel" wert={form.title} onAendern={feld("title")} platzhalter="optional" inhalt="titel" />
        <FormDatum
          label="Geburtsdatum"
          wert={form.birthday}
          onAendern={feld("birthday")}
          min={new Date(1900, 0, 1)}
          max={new Date()}
          start={new Date(1970, 0, 1)}
          fehler={f.fuer("birthday")}
        />
      </FormGruppe>
      <Chipwahl
        label="Geschlecht"
        optionen={GESCHLECHTER}
        wert={form.gender || null}
        onWahl={f.leeren("gender", (g: Geschlecht) => setForm((alt) => ({ ...alt, gender: g })))}
        fehler={f.fuer("gender")}
      />
      <FormGruppe titel="Adresse">
        <FormFeld label="Straße" wert={form.street} onAendern={feld("street")} inhalt="strasse" fehler={f.fuer("street")} />
        <FormFeld label="PLZ" wert={form.postcode} onAendern={feld("postcode")} inhalt="plz" fehler={f.fuer("postcode")} />
        <FormFeld label="Ort" wert={form.city} onAendern={feld("city")} inhalt="ort" fehler={f.fuer("city")} />
      </FormGruppe>
      <FormGruppe titel="Kontakt">
        <FormFeld label="Telefon" wert={form.phone} onAendern={feld("phone")} inhalt="telefon" fehler={f.fuer("phone")} />
        <FormFeld
          label="Mobil"
          wert={form.mobile}
          onAendern={feld("mobile")}
          inhalt="telefon"
          beschreibung="Telefon oder Mobil genügt."
        />
        <FormFeld label="E-Mail" wert={s.email ?? ""} onAendern={() => {}} editierbar={false} />
      </FormGruppe>
      <Text style={stil.leise}>Die E-Mail-Adresse ist dein Login. Ändern kann sie der Vorstand.</Text>
      <Aktionen
        zurueck={zurueck}
        speichern={async () => {
          const r = f.merke(await speichereOnboardingStammdaten(form));
          return r.ok ? weiter() : r;
        }}
      />
    </>
  );
}

/** Satzung und Beitragsordnung werden akzeptiert, die Datenschutzerklaerung zur Kenntnis genommen. */
function zustimmungstext(code: string, titel: string): string {
  return code === "datenschutz"
    ? `Ich habe die ${titel} zur Kenntnis genommen.`
    : `Ich akzeptiere die ${titel}.`;
}

function SchrittRechtliches({ daten, weiter, zurueck }: SchrittEigenschaften) {
  const { farben } = useTheme();
  const [haken, setHaken] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(daten.dokumente.map((d) => [d.code, d.zugestimmt_am !== null])),
  );

  return (
    <>
      <FormGruppe>
        {daten.dokumente.map((d) => {
          // Dieselben Adressen wie im Web: /satzung, /beitragsordnung, /datenschutz.
          const link = webLink(`/${d.code}`);
          return (
            <View key={d.code}>
              <FormSchalter
                label={zustimmungstext(d.code, d.title)}
                beschreibung={`Fassung ${d.version} vom ${isoZuDeutsch(d.valid_from)}${d.zugestimmt_am ? " · bereits zugestimmt" : ""}`}
                an={haken[d.code] ?? false}
                deaktiviert={d.zugestimmt_am !== null}
                onWechsel={(an) => setHaken((h) => ({ ...h, [d.code]: an }))}
              />
              {link && (
                <Pressable
                  onPress={() => void Linking.openURL(link)}
                  accessibilityRole="link"
                  style={{ paddingHorizontal: 16, paddingBottom: 12, marginTop: -4 }}
                >
                  <Text style={{ fontSize: 14, fontFamily: "Barlow_700Bold", color: farben.blueInk }}>{d.title} lesen ›</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </FormGruppe>
      <Aktionen
        zurueck={zurueck}
        speichern={async () => {
          if (daten.dokumente.some((d) => !haken[d.code])) {
            return { ok: false, meldung: "Bitte stimme allen drei Texten zu." };
          }
          const offen = daten.dokumente.filter((d) => d.zugestimmt_am === null).map((d) => d.code);
          const r = await akzeptiereDokumente(offen);
          return r.ok ? weiter() : r;
        }}
      />
    </>
  );
}

function SchrittErziehungsberechtigte({ daten, weiter, zurueck }: SchrittEigenschaften) {
  const e = daten.erziehungsberechtigte;
  const [name, setName] = useState(e.name ?? "");
  const [email, setEmail] = useState(e.email ?? "");
  const [telefon, setTelefon] = useState(e.phone ?? "");
  const [zustimmung, setZustimmung] = useState(e.zustimmung_am !== null);
  const f = useFeldfehler();

  return (
    <>
      <FormGruppe>
        <FormFeld label="Name" wert={name} onAendern={f.leeren("name", setName)} inhalt="name" fehler={f.fuer("name")} />
        <FormFeld label="E-Mail" wert={email} onAendern={f.leeren("email", setEmail)} inhalt="email" fehler={f.fuer("email")} />
        <FormFeld
          label="Telefon"
          wert={telefon}
          onAendern={f.leeren("email", setTelefon)}
          inhalt="telefon"
          beschreibung="E-Mail oder Telefon genügt."
        />
      </FormGruppe>
      <FormGruppe>
        <FormSchalter
          label="Zustimmung zur Mitgliedschaft"
          beschreibung={`Die erziehungsberechtigte Person ist damit einverstanden, dass ${daten.stammdaten.first_name} Mitglied im Verein ist.`}
          an={zustimmung}
          onWechsel={setZustimmung}
        />
      </FormGruppe>
      <Aktionen
        zurueck={zurueck}
        speichern={async () => {
          const r = f.merke(await speichereErziehungsberechtigte({ name, email, phone: telefon, zustimmung }));
          return r.ok ? weiter() : r;
        }}
      />
    </>
  );
}

function SchrittNotfallkontakt({ daten, weiter, zurueck, ueberspringen }: SchrittEigenschaften) {
  const n = daten.notfallkontakt;
  const e = daten.erziehungsberechtigte;
  // Bei Minderjaehrigen mit den Erziehungsberechtigten vorbelegt, solange noch nichts eingetragen ist.
  const vorbelegen = daten.minderjaehrig && !n.name && !n.phone;
  const [name, setName] = useState((vorbelegen ? e.name : n.name) ?? "");
  const [telefon, setTelefon] = useState((vorbelegen ? e.phone : n.phone) ?? "");
  const f = useFeldfehler();
  const [verhaeltnis, setVerhaeltnis] = useState(
    (vorbelegen && e.name ? "Erziehungsberechtigte" : n.relation) ?? "",
  );

  return (
    <>
      <FormGruppe>
        <FormFeld label="Name" wert={name} onAendern={f.leeren("name", setName)} inhalt="name" fehler={f.fuer("name")} />
        <FormFeld label="Telefon" wert={telefon} onAendern={setTelefon} inhalt="telefon" />
        <FormFeld label="Verhältnis" wert={verhaeltnis} onAendern={setVerhaeltnis} platzhalter="etwa Mutter, Partner" />
      </FormGruppe>
      <Aktionen
        zurueck={zurueck}
        ueberspringen={ueberspringen}
        speichern={async () => {
          const r = f.merke(await speichereOnboardingNotfallkontakt({ name, phone: telefon, relation: verhaeltnis }));
          return r.ok ? weiter() : r;
        }}
      />
    </>
  );
}

function SchrittSepa({ daten, weiter, zurueck }: SchrittEigenschaften) {
  const { stil, farben } = useTheme();
  const m = daten.mandat;
  const [kontoinhaber, setKontoinhaber] = useState(m.kontoinhaber_vorschlag ?? "");
  const [iban, setIban] = useState("");
  const [bestaetigt, setBestaetigt] = useState(false);

  if (m.vorhanden) {
    return (
      <>
        <Text style={stil.hinweisErfolg}>
          Für dich liegt ein SEPA-Mandat vor (Mandatsreferenz {m.referenz}). Ändern kann es der Vorstand.
        </Text>
        <Aktionen speichern={weiter} weiterText="Konto freischalten" zurueck={zurueck} />
      </>
    );
  }

  if (!m.moeglich) {
    return (
      <>
        <Text style={stil.hinweisFehler}>
          Die Gläubigerdaten des Vereins fehlen noch, deshalb lässt sich das Mandat gerade nicht erteilen.
          Bitte wende dich an den Vorstand.
        </Text>
        <Aktionen speichern={weiter} gesperrt zurueck={zurueck} />
      </>
    );
  }

  const text = m.text ?? mandatstext({ glaeubigerName: m.glaeubiger_name, glaeubigerId: m.glaeubiger_id, referenz: m.referenz });

  return (
    <>
      <View style={{ backgroundColor: farben.surf2, borderRadius: radius.karte, padding: 16 }}>
        <Text style={[stil.text, { fontSize: 14, lineHeight: 20 }]} selectable>{text}</Text>
      </View>
      <FormGruppe>
        <FormFeld
          label="Kontoinhaber"
          wert={kontoinhaber}
          onAendern={setKontoinhaber}
          inhalt="name"
          beschreibung={daten.minderjaehrig ? "Bei Kindern ist der Kontoinhaber ein Elternteil." : undefined}
        />
        <FormFeld label="IBAN" wert={iban} onAendern={setIban} inhalt="iban" platzhalter="DE…" />
      </FormGruppe>
      <FormGruppe>
        <FormSchalter
          label="Ich erteile dieses Mandat"
          beschreibung="Als Kontoinhaber oder mit dessen Einverständnis."
          an={bestaetigt}
          onWechsel={setBestaetigt}
        />
      </FormGruppe>
      <Aktionen
        zurueck={zurueck}
        weiterText="Mandat erteilen"
        speichern={async () => {
          const r = await erteileMandat({ iban, kontoinhaber, bestaetigt });
          return r.ok ? weiter() : { ok: false, meldung: r.meldung };
        }}
      />
    </>
  );
}

function SchrittEinwilligungen({ daten, weiter, zurueck, ueberspringen }: SchrittEigenschaften) {
  const { stil } = useTheme();
  const [wahl, setWahl] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(daten.merkmale.map((m) => [m.code, m.gesetzt])),
  );

  return (
    <>
      {daten.merkmale.length === 0 ? (
        <Text style={stil.leise}>Der Verein fragt gerade keine Einwilligungen ab.</Text>
      ) : (
        <FormGruppe>
          {daten.merkmale.map((m) => (
            <FormSchalter
              key={m.code}
              label={m.name}
              beschreibung={m.description}
              an={wahl[m.code] ?? false}
              onWechsel={(an) => setWahl((w) => ({ ...w, [m.code]: an }))}
            />
          ))}
        </FormGruppe>
      )}
      <Aktionen
        zurueck={zurueck}
        ueberspringen={ueberspringen}
        speichern={async () => {
          // Nur was sich geaendert hat; ein boolesches Merkmal ist "ja", sobald die Zeile existiert.
          for (const m of daten.merkmale) {
            const neu = wahl[m.code] ?? false;
            if (neu === m.gesetzt) continue;
            const r = neu ? await setzeMerkmal(m.code, "true") : await entferneMerkmal(m.code);
            if (!r.ok) return r;
          }
          return weiter();
        }}
      />
    </>
  );
}

function SchrittTennis({ daten, weiter, zurueck, ueberspringen }: SchrittEigenschaften) {
  const t = daten.tennis;
  const [lk, setLk] = useState(t.tennis_lk ?? "");
  const [nuliga, setNuliga] = useState(t.nuliga_id ?? "");
  const [interesse, setInteresse] = useState(t.mannschaft_interesse);

  return (
    <>
      <FormGruppe>
        <FormFeld label="LK" wert={lk} onAendern={setLk} platzhalter="etwa 18,4" tastatur="numbers-and-punctuation" />
        <FormFeld label="nuLiga-ID" wert={nuliga} onAendern={setNuliga} gross="none" />
        <FormSchalter label="Interesse an einer Mannschaft" an={interesse} onWechsel={setInteresse} />
      </FormGruppe>
      <Aktionen
        zurueck={zurueck}
        ueberspringen={ueberspringen}
        speichern={async () => {
          const r = await speichereTennis({ lk, nuligaId: nuliga, mannschaftInteresse: interesse });
          return r.ok ? weiter() : r;
        }}
      />
    </>
  );
}

/**
 * Die Werte von booking_mail. Sie stehen in member_attribute_options
 * (Migration 20260808100100); ohne Wert gilt "Nur Wichtiges".
 */
const BUCHUNGSMAILS = [
  { wert: "alle", label: "Alle" },
  { wert: "wichtige", label: "Nur Wichtiges" },
  { wert: "keine", label: "Keine" },
] as const;
type Buchungsmail = (typeof BUCHUNGSMAILS)[number]["wert"];

function SchrittEinstellungen({ daten, weiter, zurueck, ueberspringen, letzter }: SchrittEigenschaften) {
  const { stil } = useTheme();
  const gespeichert = (daten.einstellungen.booking_mail ?? "wichtige") as Buchungsmail;
  const [mails, setMails] = useState<Buchungsmail>(gespeichert);
  const [push, setPush] = useState(false);
  const [pushLaeuft, setPushLaeuft] = useState(false);
  const [pushMeldung, setPushMeldung] = useState<string | null>(null);

  useEffect(() => {
    istAngemeldet().then(setPush).catch(() => setPush(false));
  }, []);

  async function pushUmschalten(an: boolean) {
    setPushLaeuft(true);
    const r = an ? await registriereGeraet() : await meldeGeraetAb();
    setPushLaeuft(false);
    setPushMeldung(r.meldung || null);
    if (r.ok) setPush(an);
  }

  return (
    <>
      <Chipwahl
        label="E-Mails zu deinen Buchungen"
        optionen={BUCHUNGSMAILS.map((b) => ({ wert: b.wert, label: b.label }))}
        wert={mails}
        onWahl={setMails}
      />
      <Text style={stil.leise}>In der App siehst du Änderungen an deinen Buchungen in jedem Fall.</Text>
      <FormGruppe>
        <FormSchalter
          label="Mitteilungen aufs Handy"
          beschreibung={pushMeldung ?? "Das Gerät fragt einmal nach deiner Erlaubnis."}
          an={push}
          deaktiviert={pushLaeuft}
          onWechsel={(an) => void pushUmschalten(an)}
        />
      </FormGruppe>
      <Aktionen
        zurueck={zurueck}
        ueberspringen={ueberspringen}
        weiterText={letzter ? "Fertig" : "Weiter"}
        speichern={async () => {
          if (mails !== gespeichert || daten.einstellungen.booking_mail === null) {
            const r = await setzeMerkmal("booking_mail", mails);
            if (!r.ok) return r;
          }
          return weiter();
        }}
      />
    </>
  );
}
