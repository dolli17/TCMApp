/**
 * Die Kasse (Nachbau von apps/web/src/app/admin/kasse/page.tsx)
 *
 * Alles, was Geld betrifft, an einem Ort. Die Abschnitte folgen dem Ablauf
 * eines Vereinsjahres: einmal im Januar der Beitragslauf, monatlich die
 * Getraenke, dazwischen die Forderungsliste als Antwort auf "wer schuldet uns
 * noch was".
 *
 * Forderungen, Lastschriften und Getraenkemonate stehen im Segment-Schalter;
 * Beitragslauf, Beitragsarten und Regeln sind Unterseiten derselben Route
 * (?abschnitt=lauf|arten|regeln) mit eigenem Titel und Zurueck-Pfeil - wie im
 * Web. Filter (?stand=) und Jahr (?jahr=) stehen in der Adresse.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { formatCents } from "@tcm/core";
import { Bildschirm } from "@/components/Bildschirm";
import { Segmente } from "@/components/Segmente";
import { EinstellungsGruppe } from "@/components/verwaltung/EinstellungsGruppe";
import { Chipwahl, Knopf } from "@/components/verwaltung/Formular";
import {
  Abschnitt, Gruppenkopf, Kennzahl, ListenGruppe, Listenzeile,
} from "@/components/verwaltung/Liste";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { BeitragsartenPflege } from "@/components/verwaltung/kasse/BeitragsartenPflege";
import { Beitragslauf } from "@/components/verwaltung/kasse/Beitragslauf";
import { ForderungsListe } from "@/components/verwaltung/kasse/ForderungsListe";
import { GetraenkemonatKarte } from "@/components/verwaltung/kasse/GetraenkemonatKarte";
import { LaufAnlegen } from "@/components/verwaltung/kasse/LaufAnlegen";
import { LaufListe } from "@/components/verwaltung/kasse/LaufListe";
import { Hinweis, Unterzeile } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import {
  ABSCHNITTE, SEGMENTE, ankuendigungsfrist, einstellungsWert, kassenSchluessel, ladeKasse,
  type KassenAbschnitt, type KassenDaten, type KassenKennzahlen,
} from "@/lib/verwaltung/kasse";

const STAENDE = [
  { wert: "", label: "Alle" },
  { wert: "open", label: "Offen" },
  { wert: "notified", label: "Angekündigt" },
  { wert: "submitted", label: "Eingereicht" },
  { wert: "settled", label: "Bezahlt" },
  { wert: "returned", label: "Zurückgebucht" },
] as const;

function einParam(w: string | string[] | undefined): string | undefined {
  return Array.isArray(w) ? w[0] : w;
}

export default function KasseSeite() {
  const { farben } = useTheme();
  const params = useLocalSearchParams<{ abschnitt?: string; jahr?: string; stand?: string }>();
  const abschnittParam = einParam(params.abschnitt);
  const gewaehlt: KassenAbschnitt = ABSCHNITTE.some((a) => a.wert === abschnittParam)
    ? (abschnittParam as KassenAbschnitt)
    : "forderungen";
  const unterseite = SEGMENTE.includes(gewaehlt) ? null : ABSCHNITTE.find((a) => a.wert === gewaehlt)!;
  const jahr = Number(einParam(params.jahr)) || new Date().getFullYear();
  const stand = einParam(params.stand) || null;
  const schluessel = kassenSchluessel({ abschnitt: gewaehlt, jahr, stand });

  // --- Laden -----------------------------------------------------------------
  // Eigenes Laden statt useLaden: die Ansicht wechselt mit der Adresse, und
  // eine langsame alte Antwort darf die neue nicht ueberschreiben.
  const [daten, setDaten] = useState<KassenDaten | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [aktualisiert, setAktualisiert] = useState(false);
  const zaehler = useRef(0);

  const holen = useCallback(
    async (nachladen: boolean) => {
      const nr = ++zaehler.current;
      if (nachladen) setAktualisiert(true);
      try {
        const d = await ladeKasse({ abschnitt: gewaehlt, jahr, stand });
        if (nr === zaehler.current) {
          setDaten(d);
          setFehler(null);
        }
      } catch (f) {
        if (nr === zaehler.current) setFehler(f instanceof Error ? f.message : "Unbekannter Fehler.");
      } finally {
        if (nr === zaehler.current) setAktualisiert(false);
      }
    },
    [gewaehlt, jahr, stand],
  );

  useEffect(() => {
    void holen(false);
  }, [holen]);

  // Nach der Rueckkehr von einem Lauf stimmen die Zahlen sonst nicht mehr.
  const holenRef = useRef(holen);
  holenRef.current = holen;
  const erstesMal = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (erstesMal.current) {
        erstesMal.current = false;
        return;
      }
      void holenRef.current(true);
    }, []),
  );

  const neuLaden = useCallback(() => holen(true), [holen]);
  const [laufBlatt, setLaufBlatt] = useState(false);

  const d = daten?.schluessel === schluessel ? daten : null;
  const einstellungen = daten?.einstellungen ?? [];
  const frist = ankuendigungsfrist(einstellungen);

  const geh = (abschnitt: KassenAbschnitt, extra = "") =>
    router.push(`/verwaltung/kasse?abschnitt=${abschnitt}${extra}` as Href);

  const titel = unterseite?.label ?? "Kasse";

  return (
    <>
    <Stack.Screen options={{ title: titel }} />
    <Bildschirm
      laedt={!daten && !fehler}
      aktualisiert={aktualisiert}
      onAktualisieren={() => void neuLaden()}
      fehler={fehler}
    >

      {!unterseite && (
        <>
          <VerwaltungsKopf
            unterzeile="Beiträge, Getränkeabrechnung und alles, was daraus an Forderungen entsteht."
            aktion={gewaehlt === "lastschrift" ? { text: "Lauf anlegen", onPress: () => setLaufBlatt(true) } : undefined}
          >
            {/* Ein gelber Knopf je Seite (Regel 4), passend zum Segment */}
            {gewaehlt === "forderungen" && (
              <Knopf art="gold" text="Beitragslauf" onPress={() => geh("lauf")} />
            )}
          </VerwaltungsKopf>

          <KennzahlenReihe
            kennzahlen={daten?.kennzahlen ?? null}
            onForderungen={() => router.setParams({ abschnitt: "forderungen", stand: "" })}
            onLastschrift={() => router.setParams({ abschnitt: "lastschrift", stand: "" })}
            onRuecklaeufer={() => router.setParams({ abschnitt: "forderungen", stand: "returned" })}
          />

          <Segmente
            beschriftung="Kasse"
            optionen={SEGMENTE.map((wert) => ({
              wert,
              label: wert === "getraenke" ? "Getränke" : ABSCHNITTE.find((a) => a.wert === wert)!.label,
            }))}
            wert={gewaehlt}
            onWahl={(w) => router.setParams({ abschnitt: w, stand: "" })}
          />
        </>
      )}

      {!d ? (
        !fehler && (
          <View style={{ paddingVertical: 32 }}>
            <ActivityIndicator color={farben.blue} />
          </View>
        )
      ) : (
        <>
          {gewaehlt === "forderungen" && d.forderungen && (
            <>
              {/* Was man seltener braucht, steht als Unterseite darunter */}
              <ListenGruppe>
                {(["lauf", "arten", "regeln"] as const).map((wert) => (
                  <Listenzeile
                    key={wert}
                    titel={ABSCHNITTE.find((a) => a.wert === wert)!.label}
                    onPress={() => geh(wert)}
                  />
                ))}
              </ListenGruppe>
              <Chipwahl
                optionen={STAENDE.map((s) => ({ wert: s.wert, label: s.label }))}
                wert={stand ?? ""}
                onWahl={(w) => router.setParams({ stand: w })}
              />
              <ForderungsListe forderungen={d.forderungen} onGeaendert={neuLaden} />
            </>
          )}

          {gewaehlt === "lastschrift" && d.laeufe && (
            <>
              <FehlendeAngaben
                einstellungen={d.einstellungen}
                onRegeln={() => geh("regeln")}
              />
              <Abschnitt>
                <Gruppenkopf titel="Lastschriftläufe" />
                <Unterzeile>Aus angekündigten Forderungen wird eine Datei fürs Onlinebanking.</Unterzeile>
                <LaufListe daten={d.laeufe} heute={d.heute} />
              </Abschnitt>
            </>
          )}

          {gewaehlt === "getraenke" && d.monate && (
            <GetraenkemonatKarte monate={d.monate} fristTage={frist} onGeaendert={neuLaden} />
          )}

          {gewaehlt === "lauf" && d.beitragslauf && (
            <Beitragslauf
              jahr={jahr}
              daten={d.beitragslauf}
              einstellungen={d.einstellungen}
              frist={frist}
              onJahr={(j) => router.setParams({ jahr: String(j) })}
              onGeaendert={neuLaden}
            />
          )}

          {gewaehlt === "arten" && d.arten && (
            <BeitragsartenPflege arten={d.arten} jahr={jahr} onGeaendert={neuLaden} />
          )}

          {gewaehlt === "regeln" && (
            <>
              <EinstellungsGruppe
                // Nach dem Speichern mit den neuen Werten neu aufsetzen
                key={`fees-${stempel(d, "fees.")}`}
                titel="Fälligkeit"
                text="Wann der Jahresbeitrag eingezogen wird."
                eintraege={d.einstellungen.filter((e) => e.key.startsWith("fees."))}
                onGespeichert={neuLaden}
              />
              <EinstellungsGruppe
                key={`sepa-${stempel(d, "sepa.")}`}
                titel="Lastschrift"
                text="Gläubiger-ID, Format und Vorabankündigung."
                eintraege={d.einstellungen.filter((e) => e.key.startsWith("sepa."))}
                onGespeichert={neuLaden}
              />
            </>
          )}
        </>
      )}

      {laufBlatt && (
        <LaufAnlegen fristTage={frist} onSchliessen={() => setLaufBlatt(false)} onAngelegt={neuLaden} />
      )}
    </Bildschirm>
    </>
  );
}

/** Der juengste Aenderungszeitpunkt einer Gruppe - als Schluessel fuer das Formular. */
function stempel(d: KassenDaten, praefix: string): string {
  return d.einstellungen
    .filter((e) => e.key.startsWith(praefix))
    .map((e) => e.updated_at ?? "")
    .sort()
    .pop() ?? "";
}

/**
 * Die drei Kennzahlen der Kasse (KassenKennzahlen im Web). Sie wechseln den
 * Abschnitt derselben Seite, statt eine neue zu oeffnen.
 */
function KennzahlenReihe({
  kennzahlen,
  onForderungen,
  onLastschrift,
  onRuecklaeufer,
}: {
  kennzahlen: KassenKennzahlen | null;
  onForderungen: () => void;
  onLastschrift: () => void;
  onRuecklaeufer: () => void;
}) {
  const k = kennzahlen;
  const zurueck = k?.zurueck ?? 0;
  const kachel = (onPress: () => void, inhalt: ReactNode, label: string) => (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={{ flex: 1, minWidth: 0, flexDirection: "row" }}>
      {inhalt}
    </Pressable>
  );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {kachel(
          onForderungen,
          <Kennzahl
            label="Offene Forderungen"
            wert={k?.offenCents === null || !k ? "–" : formatCents(k.offenCents)}
            info={`${k?.posten ?? 0} Posten, alle Arten`}
          />,
          "Offene Forderungen",
        )}
        {kachel(
          onLastschrift,
          <Kennzahl
            label="Laufende Läufe"
            wert={k?.laufend === null || !k ? "–" : String(k.laufend)}
            info="noch nicht abgeschlossen"
          />,
          "Laufende Läufe",
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {kachel(
          onRuecklaeufer,
          <Kennzahl
            label="Rückläufer offen"
            wert={k?.zurueck === null || !k ? "–" : String(zurueck)}
            info={zurueck === 0 ? "nichts zu klären" : "zurückgebucht, noch offen"}
          />,
          "Rückläufer offen",
        )}
        <View style={{ flex: 1 }} />
      </View>
    </View>
  );
}

/**
 * Ohne Glaeubiger-ID und Vereins-IBAN laesst sich keine Datei bauen. Das
 * steht hier, nicht erst beim Tippen auf "erzeugen".
 */
function FehlendeAngaben({
  einstellungen,
  onRegeln,
}: {
  einstellungen: KassenDaten["einstellungen"];
  onRegeln: () => void;
}) {
  const { farben } = useTheme();
  const fehlend = [
    einstellungsWert(einstellungen, "sepa.creditor_id") === "" ? "die Gläubiger-Identifikationsnummer" : null,
    einstellungsWert(einstellungen, "sepa.creditor_iban") === "" ? "die IBAN des Vereinskontos" : null,
  ].filter(Boolean);
  if (fehlend.length === 0) return null;
  return (
    <Hinweis fehler>
      <Text style={{ color: farben.red, fontSize: 14, lineHeight: 19.5, fontFamily: "Barlow_400Regular" }}>
        Es fehlt noch {fehlend.join(" und ")}. Ohne diese Angaben lässt sich keine
        Lastschriftdatei erzeugen – sie stehen unter{" "}
        <Text onPress={onRegeln} accessibilityRole="link" style={{ fontFamily: "Barlow_700Bold", textDecorationLine: "underline" }}>
          Kasse → Regeln
        </Text>
        .
      </Text>
    </Hinweis>
  );
}
