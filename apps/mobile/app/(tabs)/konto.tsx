import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { formatCents } from "@tcm/core";
import { abstand } from "@tcm/ui";
import { Bildschirm } from "@/components/Bildschirm";
import { MerkmaleKarte, type MerkmalZeile } from "@/components/MerkmaleKarte";
import { Stammdatenformular } from "@/components/Stammdatenformular";
import {
  abmelden, ladeArbeitsdienst, ladeMeineForderungen, ladeMeineMerkmale, ladeMeineStammdaten,
  speichereNotfallkontakt, speichereStammdaten,
  type Notfallkontakt, type Stammdaten,
} from "@/lib/daten";
import { useLaden } from "@/lib/laden";
import { istAngemeldet, meldeGeraetAb, registriereGeraet } from "@/lib/push";
import { useTheme, type ThemeWahl } from "@/lib/theme";

const ART_TEXT: Record<string, string> = {
  fee: "Mitgliedsbeitrag", drinks: "Getränke", deposit: "Pfand",
  work_duty: "Arbeitsdienst", guest: "Gastgebühr", misc: "Sonstiges",
};

/**
 * Geld und Erscheinungsbild.
 *
 * Buchungen, offene Spiele und Benachrichtigungen standen früher ebenfalls
 * hier - alles untereinander in einem einzigen ScrollView. Wer wissen wollte,
 * wann er spielt, scrollte an seinem Arbeitsdienst vorbei. Seit sie eigene
 * Bildschirme haben, bleibt hier, was zusammengehört.
 */
export default function Konto() {
  const { stil } = useTheme();

  const laden = useCallback(async () => {
    const [forderungen, dienst, stammdaten, merkmale] = await Promise.all([
      ladeMeineForderungen(),
      ladeArbeitsdienst(),
      ladeMeineStammdaten(),
      ladeMeineMerkmale(),
    ]);
    return { forderungen, dienst, stammdaten, merkmale };
  }, []);

  const zustand = useLaden(laden);
  const forderungen = zustand.daten?.forderungen ?? [];
  const dienst = zustand.daten?.dienst ?? null;
  const stammdaten = zustand.daten?.stammdaten ?? null;
  const merkmale = (zustand.daten?.merkmale ?? []) as unknown as MerkmalZeile[];

  // „returned" zählt mit: eine zurückgebuchte Lastschrift ist Geld, das der
  // Verein nicht bekommen hat - die Forderung steht wieder offen.
  const offen = forderungen
    .filter((f) => f.status === "open" || f.status === "notified" || f.status === "returned")
    .reduce((s, f) => s + f.amount_cents, 0);
  const zurueck = forderungen.filter((f) => f.status === "returned");

  return (
    <Bildschirm
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
      {/* Kennzahlen als Kachelreihe wie im Web - zwei nebeneinander, ab da umbrechend. */}
      <View style={stil.kachelReihe}>
        <View style={stil.kachel}>
          <Text style={stil.kachelTitel}>Offene Forderungen</Text>
          <Text style={stil.kachelWert}>{formatCents(offen)}</Text>
        </View>

        {dienst && (
          <View style={stil.kachel}>
            <Text style={stil.kachelTitel}>Arbeitsdienst {dienst.year}</Text>
            <Text style={stil.kachelWert}>
              {Number(dienst.completed_hours)} / {Number(dienst.required_hours)} h
            </Text>
            {Number(dienst.missing_hours) > 0 && (
              <Text style={stil.leise}>noch {Number(dienst.missing_hours)} Stunden offen</Text>
            )}
          </View>
        )}
      </View>

      <Text style={stil.abschnitt}>Meine Daten</Text>

      {stammdaten && (
        <>
          <Stammdatenformular
            titel="Person und Kontakt"
            erklaerung="Änderungen sind sofort für den Verein sichtbar."
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
            onSpeichern={(neu) =>
              speichereStammdaten(neu as Stammdaten, stammdaten)
            }
            onGespeichert={zustand.erneutHolen}
          />

          <Stammdatenformular
            titel="Notfallkontakt"
            erklaerung="Wen sollen wir anrufen, wenn auf der Anlage etwas passiert?"
            felder={[
              { name: "emergency_contact_name", label: "Name" },
              { name: "emergency_contact_phone", label: "Telefon", art: "telefon" },
              { name: "emergency_contact_relation", label: "Verhältnis" },
            ]}
            werte={stammdaten}
            onSpeichern={(neu) => speichereNotfallkontakt(neu as unknown as Notfallkontakt)}
            onGespeichert={zustand.erneutHolen}
          />
        </>
      )}

      <MerkmaleKarte zeilen={merkmale} onGeaendert={zustand.erneutHolen} />

      <Text style={stil.abschnitt}>Benachrichtigungen</Text>
      <PushSchalter />

      <Text style={stil.abschnitt}>Erscheinungsbild</Text>
      <ThemeWahlKnoepfe />

      <Text style={stil.abschnitt}>Forderungen</Text>

      {zurueck.length > 0 && (
        <Text style={stil.hinweisFehler}>
          {zurueck.length === 1
            ? "Eine Lastschrift kam zurück"
            : `${zurueck.length} Lastschriften kamen zurück`}
          {" – die Beträge sind wieder offen. Bitte melde dich beim Verein."}
        </Text>
      )}

      {forderungen.length === 0 ? (
        <Text style={stil.leise}>Keine Forderungen vorhanden.</Text>
      ) : (
        forderungen.map((f) => (
          <View key={f.id} style={stil.karte}>
            <View style={stil.zeile}>
              <Text style={[stil.text, { fontFamily: "Barlow_600SemiBold" }]}>
                {ART_TEXT[f.kind] ?? f.kind}
              </Text>
              <Text style={stil.text}>{formatCents(f.amount_cents)}</Text>
            </View>
            <Text style={stil.leise}>
              {f.description}
              {f.is_for_other ? ` · für ${f.member_name}` : ""}
            </Text>
            {/* Zurückgebucht ist kein Zustand wie die anderen: das Geld ist
                zurück, und das Mitglied muss etwas tun. */}
            {f.status === "returned" && (
              <View style={[stil.markeKlein, stil.markeKleinRot, { marginTop: 4 }]}>
                <Text style={[stil.markeKleinText, stil.markeKleinRotText]}>zurückgebucht</Text>
              </View>
            )}
          </View>
        ))
      )}

      {/*
        Der Abmeldeknopf sass frueher im Kachelmenue der Startseite. Seit die
        Fussleiste das Menue ist, gehoert er hierher - im Web steht er ebenso
        am Fuss der eigenen Seite, nicht in der Navigation.
      */}
      <Pressable
        style={[stil.knopfLeise, { marginTop: abstand.m }]}
        onPress={async () => {
          // Erst das Geraet abmelden, dann die Sitzung: danach fehlt die
          // Berechtigung, und die Marke bliebe beim Vorbesitzer stehen.
          await meldeGeraetAb().catch(() => {});
          await abmelden();
          router.replace("/anmelden");
        }}
        accessibilityRole="button"
      >
        <Text style={stil.knopfLeiseText}>Abmelden</Text>
      </Pressable>
    </Bildschirm>
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
function PushSchalter() {
  const { stil } = useTheme();
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
    <View style={{ gap: abstand.s }}>
      <View style={stil.segment} accessibilityRole="radiogroup">
        {[
          { wert: true, label: "An" },
          { wert: false, label: "Aus" },
        ].map((o) => (
          <Pressable
            key={o.label}
            style={[stil.segmentKnopf, an === o.wert && stil.segmentAktiv]}
            disabled={laeuft}
            accessibilityRole="radio"
            accessibilityState={{ selected: an === o.wert }}
            onPress={() => umschalten(o.wert)}
          >
            <Text style={[stil.segmentText, an === o.wert && stil.segmentTextAktiv]}>
              {o.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={stil.leise}>
        {meldung ?? "Änderungen an deinen Buchungen kommen dann aufs Handy."}
      </Text>
    </View>
  );
}

/** Systemeinstellung als Vorgabe, Wahl ueberlebt den Neustart. */
function ThemeWahlKnoepfe() {
  const { stil, wahl, setzeWahl } = useTheme();
  const optionen: { wert: ThemeWahl; label: string }[] = [
    { wert: "hell", label: "Hell" },
    { wert: "system", label: "System" },
    { wert: "dunkel", label: "Dunkel" },
  ];

  return (
    <View style={stil.segment} accessibilityRole="radiogroup">
      {optionen.map((o) => (
        <Pressable
          key={o.wert}
          style={[stil.segmentKnopf, wahl === o.wert && stil.segmentAktiv]}
          onPress={() => setzeWahl(o.wert)}
          accessibilityRole="radio"
          accessibilityState={{ selected: wahl === o.wert }}
        >
          <Text style={[stil.segmentText, wahl === o.wert && stil.segmentTextAktiv]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
