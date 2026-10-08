/**
 * Ein Lastschriftlauf von der Auswahl bis zu den Ruecklaeufern (Nachbau von
 * apps/web/src/components/LastschriftLauf.tsx)
 *
 * Oben der naechste Schritt auf brand, darunter der Weg des Geldes, dann je
 * Zahler eine Zeile - eine Lastschrift je Zahler, wie sie auf seinem
 * Kontoauszug steht.
 *
 * Ob ein Zahler mitgehen darf, sagt allein die Datenbank
 * (debit_batch_candidates). Die Seite zeigt ihren Grund woertlich an und
 * rechnet keine Frist nach. Nach dem Erzeugen ist der Lauf zu: die Datei ist
 * ein Buchungsbeleg und darf sich nicht mehr aendern.
 *
 * Abweichung vom Web: "Datei erzeugen" und "Lauf abschliessen" fragen vorher
 * nach - beides laesst sich nicht zuruecknehmen.
 */

import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  CHARGE_KIND_LABEL, debitFlow, formatCents, isoDateLabel, sortChargeKinds,
} from "@tcm/core";
import {
  Chipwahl, FormBlatt, FormFeld, FormGruppe, Karte, Knopf, Meldung, bestaetige, useAktion,
} from "@/components/verwaltung/Formular";
import { Geldweg } from "@/components/verwaltung/Geldweg";
import {
  Abschnitt, Gruppenkopf, Kennzahl, Kennzahlen, LeereZeile, ListenGruppe, Listenzeile, Statusmarke,
} from "@/components/verwaltung/Liste";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { ArtMarken } from "@/components/verwaltung/kasse/ArtMarke";
import { teileLastschriftdatei } from "@/components/verwaltung/kasse/dateiTeilen";
import { BetragMitMarke, Unterzeile, zahlwort } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import {
  dateiErzeugen, laufAbschliessen, laufEingereicht, postenAufnehmen, ruecklaeuferErfassen,
  type ArtSumme, type KandidatZeile, type LaufKopf, type PostenZeile,
} from "@/lib/verwaltung/kasse";
import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";

/** Ein Lauf hat schnell einige hundert Zahler; erst ein Ausschnitt. */
const AUSSCHNITT = 25;

export function LastschriftLauf({
  lauf,
  kandidaten,
  posten,
  jeArt,
  faelligAb,
  heute,
  onGeaendert,
}: {
  lauf: LaufKopf;
  kandidaten: KandidatZeile[];
  posten: PostenZeile[];
  /** Summe je Art im Lauf (debit_batch_kinds) */
  jeArt: ArtSumme[];
  /** Der spaeteste angekuendigte Faelligkeitstag der Kandidaten, ISO */
  faelligAb: string | null;
  heute: string;
  onGeaendert: () => void | Promise<void>;
}) {
  const { farben } = useTheme();
  const { laeuft, meldung, ausfuehren } = useAktion();
  const [zurueck, setZurueck] = useState<string | null>(null);
  const [grund, setGrund] = useState("");
  const [nurOhneMandat, setNurOhneMandat] = useState(false);
  const [alle, setAlle] = useState(false);

  const entwurf = lauf.status === "draft";
  const moeglich = kandidaten.filter((k) => k.einzugsfaehig);
  const draussen = kandidaten.filter((k) => !k.einzugsfaehig);
  const summeMoeglich = moeglich.reduce((s, k) => s + k.amount_cents, 0);
  const summeAlle = lauf.total_cents + kandidaten.reduce((s, k) => s + k.amount_cents, 0);
  const zurueckgebucht = posten.filter((p) => p.result === "returned").length;

  const weg = debitFlow({
    charges: {
      payers: posten.length + kandidaten.length,
      totalCents: summeAlle,
      unannounced: 0,
      dueDate: faelligAb,
    },
    batch: {
      status: lauf.status,
      collectionDate: lauf.collection_date,
      itemCount: lauf.item_count,
      readyPayers: moeglich.length,
      returned: zurueckgebucht,
    },
    today: heute,
  });

  // Die Saetze der Datenbank, jeder einmal - sie begruenden die Sperre.
  const gruende = [...new Set(draussen.map((k) => k.grund).filter((g): g is string => Boolean(g)))];

  /** Schreibaktion mit Neuladen danach. */
  function tu(aktion: () => Promise<Ergebnis>, nachErfolg?: () => void) {
    void ausfuehren(aktion, async () => {
      nachErfolg?.();
      await onGeaendert();
    });
  }

  // Die Datei holen ist Lesen: die Meldung zeigen, aber nicht neu laden.
  function dateiHolen() {
    void ausfuehren(() => teileLastschriftdatei(lauf.storage_path));
  }

  const ohneMandat = kandidaten.filter((k) => !k.mandate_id);
  const zeigePosten = nurOhneMandat ? [] : posten;
  const alleKandidaten = nurOhneMandat ? ohneMandat : kandidaten;
  const gesamt = zeigePosten.length + alleKandidaten.length;
  const grenze = alle ? Infinity : AUSSCHNITT;
  const sichtbarePosten = zeigePosten.slice(0, grenze);
  const zeigeKandidaten = alleKandidaten.slice(0, Math.max(0, grenze - sichtbarePosten.length));
  const zurueckPosten = posten.find((p) => p.end_to_end_id === zurueck) ?? null;

  const aufnehmen = () => tu(() => postenAufnehmen(lauf.id, null));

  return (
    <>
      <VerwaltungsKopf
        marke={<Statusmarke gross text={weg.label} ton={weg.current === null ? "gruen" : "gelb"} />}
        unterzeile={`Fällig am ${isoDateLabel(lauf.collection_date)}`}
      >
        {/* Was dieser Lauf einzieht - frueher war das nirgends zu sehen */}
        {lauf.kinds ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 14, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>Zieht nur ein:</Text>
            <ArtMarken arten={lauf.kinds} />
          </View>
        ) : (
          <Text style={{ fontSize: 14, lineHeight: 19.5, color: farben.ink2, fontFamily: "Barlow_400Regular" }}>
            Zieht alle angekündigten Forderungen ein, gleich welcher Art.
          </Text>
        )}
      </VerwaltungsKopf>

      <Meldung meldung={meldung} />

      {/* --- Der naechste Schritt steht ueber allem (Regel 8) --------------- */}
      <NaechsterSchritt>
        {entwurf && posten.length === 0 && (
          <>
            <SchrittTitel>
              {moeglich.length > 0
                ? "Zahler in den Lauf aufnehmen"
                : faelligAb
                  ? `Lastschriftlauf ab ${isoDateLabel(faelligAb)}`
                  : "Noch nichts einzugsfähig"}
            </SchrittTitel>
            <SchrittText>
              Die Frist der Vorabankündigung hängt an jeder Forderung und wird in der Datenbank
              geprüft. Vorher lässt sich keine Datei erzeugen.
            </SchrittText>
            {moeglich.length > 0 && (
              <Knopf
                art="gold"
                text={`${zahlwort(moeglich.length, "Lastschrift", "Lastschriften")} über ${formatCents(summeMoeglich)} aufnehmen`}
                laeuft={laeuft}
                onPress={aufnehmen}
              />
            )}
            <GesperrterKnopf text="pain.008 erzeugen" />
            <View style={{ gap: 4 }}>
              {(moeglich.length > 0
                ? ["Im Lauf ist noch keine Lastschrift."]
                : gruende.length > 0
                  ? gruende
                  : ["Für diesen Fälligkeitstag liegt keine angekündigte Forderung vor."]
              ).map((g) => (
                <SchrittText key={g}>{`• ${g}`}</SchrittText>
              ))}
            </View>
          </>
        )}

        {entwurf && posten.length > 0 && (
          <>
            <SchrittTitel>Datei erzeugen</SchrittTitel>
            <SchrittText>
              Die Datei wird einmal erzeugt und bleibt danach unverändert – sie ist der Beleg
              dessen, was die Bank bekommt. Danach lässt sich am Lauf nichts mehr ändern.
            </SchrittText>
            <Knopf
              art="gold"
              text="pain.008 erzeugen"
              laeuftText="Wird erzeugt…"
              laeuft={laeuft}
              onPress={() =>
                bestaetige(
                  "Datei erzeugen",
                  "Danach lässt sich am Lauf nichts mehr ändern.",
                  "Erzeugen",
                  () => tu(() => dateiErzeugen(lauf.id)),
                  false,
                )
              }
            />
            {moeglich.length > 0 && (
              <AufBlauKnopf text={`Noch ${moeglich.length} Zahler aufnehmen`} deaktiviert={laeuft} onPress={aufnehmen} />
            )}
          </>
        )}

        {lauf.status === "generated" && (
          <>
            <SchrittTitel>Im Onlinebanking einreichen</SchrittTitel>
            <SchrittText>
              Hochgeladen wird die Datei im Onlinebanking; die App bekommt von dort keine
              Rückmeldung. Danach hier vermerken.
            </SchrittText>
            <Knopf
              art="gold"
              text="Im Onlinebanking eingereicht"
              laeuft={laeuft}
              onPress={() => tu(() => laufEingereicht(lauf.id, null))}
            />
          </>
        )}

        {lauf.status === "submitted" && (
          <>
            <SchrittTitel>Rückläufer eintragen</SchrittTitel>
            <SchrittText>
              Alles, was nicht als zurückgebucht vermerkt ist, gilt beim Abschließen als
              eingezogen. Eine Rücklastschrift kann bis zu acht Wochen nach dem Einzug kommen.
            </SchrittText>
            {/* Erst abschliessen, wenn nichts mehr zurueckkommt; wer zu frueh
                abhakt, haelt Geld fuer da, das noch unterwegs ist. */}
            <AufBlauKnopf
              text="Lauf abschließen"
              deaktiviert={laeuft}
              onPress={() =>
                bestaetige(
                  "Lauf abschließen",
                  "Alles, was nicht als zurückgebucht vermerkt ist, gilt danach als eingezogen.",
                  "Abschließen",
                  () => tu(() => laufAbschliessen(lauf.id)),
                )
              }
            />
          </>
        )}

        {lauf.status === "completed" && (
          <>
            <SchrittTitel>Abgeschlossen</SchrittTitel>
            <SchrittText>Der Lauf ist erledigt. Die Datei bleibt als Beleg am Lauf.</SchrittText>
          </>
        )}

        {lauf.storage_path && (
          <AufBlauKnopf text="Datei herunterladen" deaktiviert={laeuft} onPress={dateiHolen} />
        )}
      </NaechsterSchritt>

      {/* --- Der Weg des Geldes ------------------------------------------ */}
      <Karte titel="Der Weg des Geldes">
        <Geldweg schritte={weg.steps} />
      </Karte>

      {/* --- Je Zahler ------------------------------------------------------ */}
      <Abschnitt>
        <Gruppenkopf titel="Je Zahler" neben={`${posten.length + kandidaten.length} · ${formatCents(summeAlle)}`} />
        <Unterzeile>Ein Elternteil mit zwei Kindern = eine Zeile, eine Buchung.</Unterzeile>

        {kandidaten.length > 0 && (
          <Chipwahl
            optionen={[
              { wert: "alle", label: "Alle" },
              { wert: "ohne", label: `Ohne Mandat · ${ohneMandat.length}` },
            ]}
            wert={nurOhneMandat ? "ohne" : "alle"}
            onWahl={(w) => setNurOhneMandat(w === "ohne")}
          />
        )}

        <ListenGruppe>
          {posten.length + kandidaten.length === 0 ? (
            <LeereZeile text="Für diesen Fälligkeitstag liegt keine angekündigte Forderung vor." />
          ) : (
            <>
              {sichtbarePosten.map((p) => {
                // Erst nach dem Einreichen: vorher ist noch nichts unterwegs,
                // das zurueckkommen koennte.
                const kannZurueck =
                  p.result === "pending" && (lauf.status === "submitted" || lauf.status === "completed");
                return (
                  <Listenzeile
                    key={p.end_to_end_id}
                    titel={p.payer_name}
                    kontext={
                      <View style={{ gap: 2 }}>
                        <ArtMarken arten={p.kinds} />
                        <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
                          {p.mitglieder}
                          {p.positionen > 1 ? ` · ${p.positionen} Posten` : ""}
                        </Text>
                        <Text style={{ fontSize: 11.5, color: farben.muted, fontFamily: "Menlo" }} selectable>
                          {p.end_to_end_id}
                        </Text>
                        {p.result === "returned" && p.return_reason && (
                          <Text style={{ fontSize: 12.5, color: farben.red, fontFamily: "Barlow_500Medium" }}>
                            {p.return_reason}
                          </Text>
                        )}
                      </View>
                    }
                    neben={
                      p.result === "returned" ? (
                        <BetragMitMarke cents={p.amount_cents} marke="zurückgebucht" ton="rot" />
                      ) : (
                        <BetragMitMarke cents={p.amount_cents} marke={p.result === "settled" ? "eingezogen" : "im Lauf"} ton="gruen" />
                      )
                    }
                    label={kannZurueck ? `${p.payer_name}: Rücklastschrift erfassen` : undefined}
                    onPress={kannZurueck && !laeuft ? () => { setZurueck(p.end_to_end_id); setGrund(""); } : undefined}
                    pfeil={kannZurueck}
                  />
                );
              })}
              {zeigeKandidaten.map((k) => (
                <Listenzeile
                  key={k.payer_id}
                  titel={k.payer_name}
                  kontext={
                    <View style={{ gap: 2 }}>
                      <ArtMarken arten={k.kinds} />
                      <Text style={{ fontSize: 13, color: farben.muted, fontFamily: "Barlow_400Regular" }}>
                        {k.arten}
                        {k.positionen > 1 ? ` · ${k.positionen} Posten` : ""}
                      </Text>
                      {!k.einzugsfaehig && k.grund && (
                        <Text style={{ fontSize: 12.5, color: farben.red, fontFamily: "Barlow_500Medium" }}>{k.grund}</Text>
                      )}
                    </View>
                  }
                  neben={
                    k.einzugsfaehig ? (
                      <BetragMitMarke cents={k.amount_cents} marke="angekündigt" ton="gelb" />
                    ) : (
                      <BetragMitMarke cents={k.amount_cents} marke={k.mandate_id ? "gesperrt" : "kein Mandat"} ton="rot" />
                    )
                  }
                />
              ))}
              {gesamt > grenze && (
                <Listenzeile titel={`Alle ${gesamt} zeigen`} hinweis={`${gesamt - grenze} weitere`} onPress={() => setAlle(true)} />
              )}
            </>
          )}
        </ListenGruppe>
      </Abschnitt>

      {/* --- Zusammenfassung ------------------------------------------------ */}
      <Kennzahlen>
        <Kennzahl label="Zahler" wert={String(posten.length + kandidaten.length)} />
        <Kennzahl label="Summe" wert={formatCents(summeAlle)} />
        <Kennzahl label="Ohne Mandat" wert={String(ohneMandat.length)} />
        <Kennzahl label="Fällig am" wert={isoDateLabel(lauf.collection_date)} />
        {/* Aufschluesselung, sobald etwas im Lauf ist: was davon Beitrag,
            was Getraenke, was Arbeitsdienst ist */}
        {sortChargeKinds(jeArt.map((a) => a.kind)).map((k) => {
          const a = jeArt.find((x) => x.kind === k)!;
          return <Kennzahl key={k} label={CHARGE_KIND_LABEL[k]} wert={formatCents(a.summe_cents)} />;
        })}
      </Kennzahlen>

      {zurueckPosten && (
        <FormBlatt
          titel="Rücklastschrift erfassen"
          unterzeile={`${zurueckPosten.payer_name} · ${formatCents(zurueckPosten.amount_cents)}`}
          onSchliessen={() => setZurueck(null)}
        >
          {(schliessen) => (
            <>
              <Unterzeile>
                Der Grund geht unverändert an den Zahler – „Konto nicht gedeckt" und
                „Widerspruch" führen zu ganz verschiedenen nächsten Schritten.
              </Unterzeile>
              <FormGruppe>
                <FormFeld
                  label="Grund"
                  wert={grund}
                  onAendern={setGrund}
                  platzhalter="z. B. Konto nicht gedeckt"
                  autoFokus
                />
              </FormGruppe>
              <Meldung meldung={meldung && !meldung.ok ? meldung : null} />
              <Knopf
                art="gefahr"
                gross
                text="Als zurückgebucht vermerken"
                laeuft={laeuft}
                deaktiviert={grund.trim() === ""}
                onPress={() =>
                  tu(
                    () => ruecklaeuferErfassen({ kennung: zurueckPosten.end_to_end_id, grund, am: null }),
                    schliessen,
                  )
                }
              />
            </>
          )}
        </FormBlatt>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Die Karte "Naechster Schritt" auf brand (.naechster-schritt)
// ---------------------------------------------------------------------------

function NaechsterSchritt({ children }: { children: ReactNode }) {
  const { farben, stil } = useTheme();
  return (
    <View style={{ overflow: "hidden", gap: 10, padding: 20, borderRadius: 26, backgroundColor: farben.brand }}>
      <Svg width={350} height={196} viewBox="0 0 350 196" style={{ position: "absolute", right: 0, top: 0 }}>
        <Path
          d="M170 196 L225 0 M350 55 L225 196 M200 95 H350 M218 36 H350"
          stroke="rgba(255,255,255,.13)"
          strokeWidth={2}
          fill="none"
        />
      </Svg>
      <Text style={[stil.kicker, { color: "#fff", opacity: 0.85 }]}>Nächster Schritt</Text>
      {children}
    </View>
  );
}

function SchrittTitel({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      style={{ fontSize: 26, lineHeight: 29, fontFamily: "Barlow_800ExtraBold", color: "#fff", letterSpacing: -0.4 }}
    >
      {children}
    </Text>
  );
}

function SchrittText({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: 14.5, lineHeight: 20, color: "#fff", opacity: 0.9, fontFamily: "Barlow_400Regular" }}>
      {children}
    </Text>
  );
}

/** Zweitrangiger Knopf auf brand (.knopf.auf-blau). */
function AufBlauKnopf({ text, onPress, deaktiviert }: { text: string; onPress: () => void; deaktiviert?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deaktiviert}
      accessibilityRole="button"
      accessibilityState={{ disabled: deaktiviert }}
      style={({ pressed }) => ({
        minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 16,
        backgroundColor: "rgba(255,255,255,.16)", borderWidth: 1, borderColor: "rgba(255,255,255,.28)",
        opacity: deaktiviert ? 0.55 : pressed ? 0.85 : 1,
      })}
    >
      {deaktiviert ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Text style={{ color: "#fff", fontSize: 15.5, fontFamily: "Barlow_700Bold" }}>{text}</Text>
      )}
    </Pressable>
  );
}

/** Gesperrt mit Schloss; der Grund steht darunter. */
function GesperrterKnopf({ text }: { text: string }) {
  return (
    <View
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      style={{
        minHeight: 48, borderRadius: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(255,255,255,.08)", borderWidth: 1, borderColor: "rgba(255,255,255,.18)",
      }}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path
          d="M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11"
          fill="none"
          stroke="rgba(255,255,255,.6)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={{ color: "rgba(255,255,255,.6)", fontSize: 15.5, fontFamily: "Barlow_700Bold" }}>{text}</Text>
    </View>
  );
}
