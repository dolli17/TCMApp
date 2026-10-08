/**
 * Die Jahresbeitraege eines Jahres (Nachbau des Abschnitts "beitraege" aus
 * apps/web/src/app/admin/kasse/page.tsx samt BeitragslaufKarte). Frueher hiess
 * das "Beitragslauf" - das Wort "Lauf" steht jetzt nur noch fuer den
 * Lastschriftlauf; Datei- und Funktionsnamen sind geblieben.
 *
 * Oben die Vorschau als Kennzahlen, darunter die zwei Schritte: Forderungen
 * erzeugen, dann ankuendigen - der zweite steht direkt unter dem ersten, weil
 * ohne Ankuendigung nicht eingezogen werden darf. Unten die Positionen.
 *
 * Der Beitragslauf ist die folgenreichste Aktion der App; wie im Web nennt
 * die Rueckfrage Zahl und Summe, bevor etwas entsteht.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import {
  Chipwahl, FormFeld, FormGruppe, Karte, Knopf, Meldung, bestaetige, useAktion,
} from "@/components/verwaltung/Formular";
import {
  Abschnitt, Gruppenkopf, Kennzahl, Kennzahlen, LeereZeile, ListenGruppe, Listenzeile,
} from "@/components/verwaltung/Liste";
import { AnkuendigungsKarte } from "@/components/verwaltung/kasse/AnkuendigungsKarte";
import { BetragMitMarke, Hinweis, KEIN_DATUM, zahlwort } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import { deutschZuIso, isoZuDeutsch, type Einstellung } from "@/lib/verwaltung/gemeinsam";
import {
  beitragslaufStarten, einstellungsWert, type Beitragslauf as LaufDaten,
} from "@/lib/verwaltung/kasse";

const AUSSCHNITT = 60;

export function Beitragslauf({
  jahr,
  daten,
  einstellungen,
  frist,
  onJahr,
  onGeaendert,
}: {
  jahr: number;
  daten: LaufDaten;
  einstellungen: Einstellung[];
  frist: number;
  onJahr: (jahr: number) => void;
  onGeaendert: () => void | Promise<void>;
}) {
  const { farben, stil } = useTheme();
  const [alle, setAlle] = useState(false);
  const { zeilen, anzukuendigen } = daten;
  const diesesJahr = new Date().getFullYear();

  const summe = zeilen.reduce((s, z) => s + (z.amount_cents ?? 0), 0);
  const ohneMandat = zeilen.filter((z) => !z.has_mandate);
  const schonBerechnet = zeilen.filter((z) => z.already_charged);
  const glaeubigerId = einstellungsWert(einstellungen, "sepa.creditor_id");

  const zahl = (schluessel: string, ersatz: number) =>
    Number(einstellungen.find((e) => e.key === schluessel)?.value ?? ersatz);
  // Der Vorschlag kommt aus den Einstellungen; aendern laesst er sich trotzdem.
  const faellig = `${jahr}-${String(zahl("fees.annual_run_month", 1)).padStart(2, "0")}-${String(
    zahl("fees.annual_run_day", 15),
  ).padStart(2, "0")}`;

  const jahre = [
    { wert: jahr - 1, label: `‹ ${jahr - 1}` },
    { wert: jahr, label: String(jahr) },
    { wert: jahr + 1, label: `${jahr + 1} ›` },
    ...(jahr !== diesesJahr ? [{ wert: diesesJahr, label: "Dieses Jahr" }] : []),
  ];

  const sichtbar = alle ? zeilen : zeilen.slice(0, AUSSCHNITT);

  return (
    <>
      <Abschnitt>
        <Gruppenkopf titel={`Jahresbeiträge ${jahr}`} />
        <Chipwahl optionen={jahre} wert={jahr} onWahl={onJahr} />
      </Abschnitt>

      {!glaeubigerId && (
        <Hinweis fehler>
          Die Gläubiger-Identifikationsnummer fehlt noch. Sie steht im eBuSy-Backend und muss
          unverändert übernommen werden – nur dann bleiben die Bestandsmandate gültig. Ohne sie
          lässt sich keine Lastschriftdatei erzeugen.
        </Hinweis>
      )}

      <Kennzahlen>
        <Kennzahl label="Mitglieder" wert={String(zeilen.length)} info={`mit Beitrag ${jahr}`} />
        <Kennzahl label="Summe" wert={formatCents(summe)} info="alle Beitragsarten" />
        <Kennzahl label="Ohne Mandat" wert={String(ohneMandat.length)} info="zahlen per Überweisung" />
        <Kennzahl label="Bereits berechnet" wert={String(schonBerechnet.length)} info="Forderung erzeugt" />
      </Kennzahlen>

      {ohneMandat.length > 0 && (
        <Hinweis fehler>
          <Text style={{ color: farben.red, fontFamily: "Barlow_400Regular", fontSize: 14, lineHeight: 19.5 }}>
            <Text style={{ fontFamily: "Barlow_700Bold" }}>
              {ohneMandat.length} Mitglieder haben kein gültiges SEPA-Mandat.
            </Text>{" "}
            Sie erscheinen nicht in der Lastschriftdatei und müssen separat angeschrieben werden –
            sonst rutschen sie unbemerkt durch:{" "}
            {ohneMandat.slice(0, 8).map((z) => z.member_name).join(", ")}
            {ohneMandat.length > 8 && ` und ${ohneMandat.length - 8} weitere`}.
          </Text>
        </Hinweis>
      )}

      {/* Gezaehlt wird nur, was eine Forderung ergibt: beitragsbefreite
          Mitglieder stehen mit 0,00 in der Vorschau und bekaemen nie eine. */}
      <BeitragslaufKarte
        key={`erzeugen-${jahr}`}
        jahr={jahr}
        mitglieder={zeilen.filter((z) => z.amount_cents > 0).length}
        summeCents={zeilen.filter((z) => !z.already_charged).reduce((s, z) => s + z.amount_cents, 0)}
        schonBerechnet={schonBerechnet.length}
        faelligAm={faellig}
        onGeaendert={onGeaendert}
      />

      <AnkuendigungsKarte
        key={`ankuendigen-${jahr}`}
        art="fee"
        zeitraum={String(jahr)}
        offen={anzukuendigen.anzahl}
        summeCents={anzukuendigen.summe_cents}
        fristTage={frist}
        faelligVorschlag={faellig}
        onGeaendert={onGeaendert}
      />

      <Abschnitt>
        <Gruppenkopf titel="Positionen" neben={`${zeilen.length} · ${formatCents(summe)}`} />
        <ListenGruppe>
          {zeilen.length === 0 ? (
            <LeereZeile text={`Für ${jahr} gibt es keine Positionen.`} />
          ) : (
            sichtbar.map((z) => (
              <Listenzeile
                key={z.member_id}
                titel={z.member_name}
                kontext={`${z.fee_types} · ${z.payer_name ? `Zahler ${z.payer_name}` : "zahlt selbst"} · ${
                  z.has_mandate ? "Mandat" : "kein Mandat"
                }`}
                neben={
                  !z.has_mandate ? (
                    <BetragMitMarke cents={z.amount_cents ?? 0} marke="kein Mandat" ton="rot" />
                  ) : (
                    <BetragMitMarke
                      cents={z.amount_cents ?? 0}
                      marke={z.already_charged ? "berechnet" : "offen"}
                      ton={z.already_charged ? "gruen" : "grau"}
                    />
                  )
                }
              />
            ))
          )}
          {!alle && zeilen.length > AUSSCHNITT && (
            <Listenzeile
              titel={`Alle ${zeilen.length} zeigen`}
              hinweis={`${zeilen.length - AUSSCHNITT} weitere`}
              onPress={() => setAlle(true)}
            />
          )}
        </ListenGruppe>
      </Abschnitt>

      <View>
        <Text style={[stil.leise, { fontSize: 14 }]}>
          Nach dem Erzeugen der Forderungen geht zuerst die Vorabankündigung mit Betrag und
          Fälligkeit an die Mitglieder; erst nach Ablauf der Frist darf eingezogen werden.
        </Text>
      </View>
    </>
  );
}

/** Der Knopf, der aus der Vorschau Forderungen macht (BeitragslaufKarte im Web). */
function BeitragslaufKarte({
  jahr,
  mitglieder,
  summeCents,
  schonBerechnet,
  faelligAm,
  onGeaendert,
}: {
  jahr: number;
  mitglieder: number;
  summeCents: number;
  schonBerechnet: number;
  faelligAm: string;
  onGeaendert: () => void | Promise<void>;
}) {
  const { stil } = useTheme();
  const [faellig, setFaellig] = useState(isoZuDeutsch(faelligAm));
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();
  const offen = mitglieder - schonBerechnet;

  return (
    <Karte
      titel="Forderungen erzeugen"
      unterzeile="Aus der Vorschau werden echte Forderungen. Eingezogen wird damit noch nichts – erst kommt die Vorabankündigung, dann der Lastschriftlauf."
    >
      <Meldung meldung={meldung} />

      {offen <= 0 ? (
        <Text style={stil.leise}>
          Für {jahr} ist alles berechnet. {schonBerechnet}{" "}
          {schonBerechnet === 1 ? "Forderung besteht" : "Forderungen bestehen"} bereits.
        </Text>
      ) : (
        <>
          <FormGruppe>
            <FormFeld
              label="Fällig am"
              wert={faellig}
              onAendern={setFaellig}
              platzhalter="TT.MM.JJJJ"
              tastatur="numbers-and-punctuation"
            />
          </FormGruppe>
          <Knopf
            text="Forderungen erzeugen"
            laeuftText="Wird erzeugt…"
            laeuft={laeuft}
            deaktiviert={faellig.trim() === ""}
            onPress={() => {
              const iso = deutschZuIso(faellig);
              if (!iso) {
                setMeldung({ ok: false, text: KEIN_DATUM });
                return;
              }
              bestaetige(
                "Forderungen erzeugen",
                `${zahlwort(offen, "Forderung", "Forderungen")} über ${formatCents(summeCents)} erzeugen?`,
                "Erzeugen",
                () => void ausfuehren(() => beitragslaufStarten({ jahr, faelligAm: iso }), onGeaendert),
              );
            }}
          />
        </>
      )}
    </Karte>
  );
}
