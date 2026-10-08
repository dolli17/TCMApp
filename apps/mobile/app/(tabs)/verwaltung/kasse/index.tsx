/**
 * Die Kasse (Nachbau von apps/web/src/app/admin/kasse/page.tsx)
 *
 * Alles, was Geld betrifft, an einem Ort. Die Abschnitte folgen dem Weg des
 * Geldes: unter "Abrechnen" entstehen die Forderungen (Jahresbeitraege,
 * Getraenkemonate, Arbeitsdienst, von Hand), unter "Forderungen" werden sie
 * angekuendigt und beantworten "wer schuldet uns noch was", unter
 * "Lastschriften" werden sie eingezogen.
 *
 * Forderungen, Abrechnen und Lastschriften stehen im Segment-Schalter;
 * Jahresbeitraege, Beitragsarten und Regeln sind Unterseiten derselben Route
 * (?abschnitt=beitraege|arten|regeln) mit eigenem Titel - wie im Web. Alte
 * Adressen (?abschnitt=lauf, ?abschnitt=getraenke) fuehren weiter an die
 * neue Stelle. Filter (?stand=, ?art=) und Jahr (?jahr=) stehen in der Adresse.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Stack, router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { CHARGE_KINDS, CHARGE_KIND_LABEL, formatCents } from "@tcm/core";
import { Bildschirm } from "@/components/Bildschirm";
import { Segmente } from "@/components/Segmente";
import { EinstellungsGruppe } from "@/components/verwaltung/EinstellungsGruppe";
import { Chipwahl } from "@/components/verwaltung/Formular";
import {
  Abschnitt, Gruppenkopf, Kennzahl, ListenGruppe, Listenzeile,
} from "@/components/verwaltung/Liste";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { AnkuendigungNachArt } from "@/components/verwaltung/kasse/AnkuendigungNachArt";
import { BeitragsartenPflege } from "@/components/verwaltung/kasse/BeitragsartenPflege";
import { Beitragslauf } from "@/components/verwaltung/kasse/Beitragslauf";
import { ForderungAnlegen } from "@/components/verwaltung/kasse/ForderungAnlegen";
import { ForderungsListe } from "@/components/verwaltung/kasse/ForderungsListe";
import { GetraenkemonatKarte } from "@/components/verwaltung/kasse/GetraenkemonatKarte";
import { LaufAnlegen } from "@/components/verwaltung/kasse/LaufAnlegen";
import { LaufListe } from "@/components/verwaltung/kasse/LaufListe";
import { Hinweis, Unterzeile } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import {
  ABSCHNITTE, SEGMENTE, abschnittAus, ankuendigungsfrist, artAus, einstellungsWert, kassenSchluessel, ladeKasse,
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
  const params = useLocalSearchParams<{ abschnitt?: string; jahr?: string; stand?: string; art?: string }>();
  // Alte Werte (lauf, getraenke) kommen ueber appPfad() aus Web-Links herein.
  const gewaehlt: KassenAbschnitt = abschnittAus(einParam(params.abschnitt));
  const unterseite = SEGMENTE.includes(gewaehlt) ? null : ABSCHNITTE.find((a) => a.wert === gewaehlt)!;
  const jahr = Number(einParam(params.jahr)) || new Date().getFullYear();
  const stand = einParam(params.stand) || null;
  const art = artAus(einParam(params.art));
  const schluessel = kassenSchluessel({ abschnitt: gewaehlt, jahr, stand, art });

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
        const d = await ladeKasse({ abschnitt: gewaehlt, jahr, stand, art });
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
    [gewaehlt, jahr, stand, art],
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
  const [forderungBlatt, setForderungBlatt] = useState(false);

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
          {/* Ein gelber Knopf je Seite (Regel 4), passend zum Segment */}
          <VerwaltungsKopf
            unterzeile="Abrechnen, ankündigen, einziehen – Beiträge, Getränke, Arbeitsdienst und Gastgebühren."
            aktion={
              gewaehlt === "lastschrift"
                ? { text: "Lauf anlegen", onPress: () => setLaufBlatt(true) }
                : gewaehlt === "abrechnen"
                  ? { text: "Forderung anlegen", onPress: () => setForderungBlatt(true) }
                  : undefined
            }
          />

          <KennzahlenReihe
            kennzahlen={daten?.kennzahlen ?? null}
            onForderungen={() => router.setParams({ abschnitt: "forderungen", stand: "", art: "" })}
            onLastschrift={() => router.setParams({ abschnitt: "lastschrift", stand: "", art: "" })}
            onRuecklaeufer={() => router.setParams({ abschnitt: "forderungen", stand: "returned", art: "" })}
          />

          <Segmente
            beschriftung="Kasse"
            optionen={SEGMENTE.map((wert) => ({
              wert,
              label: ABSCHNITTE.find((a) => a.wert === wert)!.label,
            }))}
            wert={gewaehlt}
            onWahl={(w) => router.setParams({ abschnitt: w, stand: "", art: "" })}
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
          {gewaehlt === "abrechnen" && (
            <>
              <Abschnitt>
                <Gruppenkopf titel="Woraus Forderungen entstehen" />
                <ListenGruppe>
                  <Listenzeile
                    titel={`Jahresbeiträge ${jahr}`}
                    kontext="Einmal im Jahr · Vorschau, Forderungen erzeugen, ankündigen"
                    onPress={() => geh("beitraege")}
                  />
                  <Listenzeile
                    href="/verwaltung/arbeitsdienst"
                    titel={`Arbeitsdienst ${jahr}`}
                    kontext="Nach Saisonende · nicht geleistete Stunden abrechnen"
                  />
                  <Listenzeile
                    titel="Gastgebühren"
                    kontext={(() => {
                      const g = d.ankuendbar?.find((z) => z.art === "guest");
                      return g && g.anzahl > 0
                        ? `Entstehen beim Buchen mit Gast · ${g.anzahl} offen über ${formatCents(g.summe_cents)}`
                        : "Entstehen beim Buchen mit Gast · nichts offen";
                    })()}
                    onPress={() => router.setParams({ abschnitt: "forderungen", stand: "", art: "guest" })}
                  />
                </ListenGruppe>
              </Abschnitt>

              {d.monate && <GetraenkemonatKarte monate={d.monate} fristTage={frist} onGeaendert={neuLaden} />}

              {/* Was man seltener braucht, steht als Unterseite darunter */}
              <ListenGruppe>
                {(["arten", "regeln"] as const).map((wert) => (
                  <Listenzeile
                    key={wert}
                    titel={ABSCHNITTE.find((a) => a.wert === wert)!.label}
                    onPress={() => geh(wert)}
                  />
                ))}
              </ListenGruppe>
            </>
          )}

          {gewaehlt === "forderungen" && d.forderungen && (
            <>
              {d.ankuendbar && (
                <AnkuendigungNachArt zeilen={d.ankuendbar} fristTage={frist} onGeaendert={neuLaden} />
              )}
              {/* Die Art als eigener Filter: "welche Getraenke sind noch offen?"
                  liess sich vorher nur ueber die Beschreibung beantworten. */}
              <Chipwahl
                optionen={[
                  { wert: "", label: "Alle Arten" },
                  ...CHARGE_KINDS.map((k) => ({ wert: k as string, label: CHARGE_KIND_LABEL[k] })),
                ]}
                wert={art ?? ""}
                onWahl={(w) => router.setParams({ art: w })}
              />
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

          {gewaehlt === "beitraege" && d.beitragslauf && (
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
      {forderungBlatt && (
        <ForderungAnlegen
          mitglieder={d?.mitglieder ?? []}
          onSchliessen={() => setForderungBlatt(false)}
          onAngelegt={neuLaden}
        />
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
