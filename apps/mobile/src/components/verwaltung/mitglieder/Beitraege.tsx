/**
 * Bereich Beitragsarten je Jahr (Nachbau von
 * apps/web/src/components/BeitragsartenKarte.tsx)
 *
 * Ein Mitglied kann mehrere haben - Beitrag plus Schluesselpfand ist der
 * haeufigste Fall. Der Sonderbetrag ueberschreibt den Preis, die Notiz
 * haelt fest, warum. Entfernen erst nach dem Antippen, mit Rueckfrage.
 */

import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { formatCents } from "@tcm/core";
import {
  Chipwahl, FormAuswahl, FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, bestaetige, useAktion,
} from "@/components/verwaltung/Formular";
import { Abschnitt, Gruppenkopf, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import {
  beitragsartLoesen, beitragsartZuordnen, jahrInBerlin, ladeBeitraege, type BeitragsZeile,
} from "@/lib/verwaltung/mitglieder";

export function Beitraege({ mitgliedId, onGeaendert }: { mitgliedId: string; onGeaendert: () => Promise<void> }) {
  const { stil } = useTheme();
  const aktuell = jahrInBerlin();
  const [jahr, setJahr] = useState(aktuell);
  const zustand = useLaden(() => ladeBeitraege(mitgliedId, jahr));
  const [offen, setOffen] = useState(false);
  const { laeuft, meldung, setMeldung, ausfuehren } = useAktion();

  const zeilen: BeitragsZeile[] = zustand.daten ?? [];
  const zugeordnet = zeilen.filter((z) => z.zugeordnet);
  const verfuegbar = zeilen.filter((z) => !z.zugeordnet);
  const summe = zugeordnet.reduce((s, z) => s + (z.effektiv_cents ?? 0), 0);

  async function geaendert() {
    await Promise.all([onGeaendert(), zustand.erneutHolen()]);
  }

  function jahrWechseln(j: number) {
    setJahr(j);
    setMeldung(null);
  }

  // Neues Jahr: nach dem Rendern laden - useLaden liest die Ladefunktion
  // ueber eine Referenz, die erst dann das neue Jahr kennt.
  const holen = useRef(zustand.erneutHolen);
  holen.current = zustand.erneutHolen;
  const erstesJahr = useRef(true);
  useEffect(() => {
    if (erstesJahr.current) {
      erstesJahr.current = false;
      return;
    }
    void holen.current();
  }, [jahr]);

  return (
    <>
      <Abschnitt>
        <Gruppenkopf titel={`Beiträge ${jahr}`} />
        <Chipwahl
          optionen={[aktuell + 1, aktuell, aktuell - 1, aktuell - 2].map((j) => ({ wert: j, label: String(j) }))}
          wert={jahr}
          onWahl={jahrWechseln}
        />
        {zustand.fehler ? (
          <Text style={stil.hinweisFehler}>{zustand.fehler}</Text>
        ) : (
          <Text style={[stil.leise, { fontSize: 14 }]}>
            {zugeordnet.length === 0
              ? "Noch keine Beitragsart zugeordnet – dieses Mitglied bekäme keinen Jahresbeitrag."
              : `Zusammen ${formatCents(summe)} im Jahr.`}
          </Text>
        )}
        <Meldung meldung={meldung} />
        {zugeordnet.length > 0 && (
          <ListenGruppe>
            {zugeordnet.map((z) => {
              const betrag = z.override_amount_cents ?? z.preis_cents;
              return (
                <Listenzeile
                  key={z.fee_type_id}
                  titel={z.name}
                  kontext={
                    [
                      z.override_amount_cents !== null && z.preis_cents !== null
                        ? `Sonderbetrag statt ${formatCents(z.preis_cents)}`
                        : null,
                      z.note,
                    ].filter(Boolean).join(" · ") || undefined
                  }
                  hinweis={betrag === null ? "—" : formatCents(betrag)}
                  hinweisTon={z.override_amount_cents !== null ? "gold" : "leise"}
                  pfeil={false}
                  label={`${z.name}, antippen zum Entfernen`}
                  onPress={() =>
                    !laeuft &&
                    bestaetige(
                      "Beitragsart entfernen?",
                      `${z.name} für ${jahr} entfernen.`,
                      "Entfernen",
                      () => void ausfuehren(() => beitragsartLoesen(mitgliedId, z.fee_type_id, jahr), geaendert),
                    )
                  }
                />
              );
            })}
          </ListenGruppe>
        )}
        <Knopf
          text="Beitragsart zuordnen"
          deaktiviert={laeuft || verfuegbar.length === 0}
          onPress={() => setOffen(true)}
        />
      </Abschnitt>

      {offen && (
        <ZuordnenBlatt
          mitgliedId={mitgliedId}
          jahr={jahr}
          verfuegbar={verfuegbar}
          onSchliessen={() => setOffen(false)}
          onGespeichert={async (text) => {
            setMeldung({ ok: true, text });
            await geaendert();
          }}
        />
      )}
    </>
  );
}

function ZuordnenBlatt(props: {
  mitgliedId: string;
  jahr: number;
  verfuegbar: BeitragsZeile[];
  onSchliessen: () => void;
  onGespeichert: (meldung: string) => Promise<void>;
}) {
  const [f, setF] = useState({ fee_type: "", override: "", note: "" });
  const { laeuft, meldung, ausfuehren } = useAktion();
  return (
    <FormBlatt titel="Beitragsart zuordnen" kicker={`Beiträge ${props.jahr}`} onSchliessen={props.onSchliessen}>
      {(zu) => (
        <>
          <Meldung meldung={meldung} />
          <FormGruppe>
            <FormAuswahl
              label="Beitragsart"
              wert={f.fee_type}
              leer="Auswählen…"
              optionen={props.verfuegbar.map((z) => ({
                wert: z.fee_type_id,
                label: `${z.name}${z.preis_cents !== null ? ` (${formatCents(z.preis_cents)})` : ""}`,
              }))}
              onWahl={(w) => setF({ ...f, fee_type: w })}
            />
            <FormFeld
              label="Sonderbetrag"
              wert={f.override}
              onAendern={(w) => setF({ ...f, override: w })}
              platzhalter="z. B. 0,00"
              tastatur="decimal-pad"
              beschreibung="Leer lassen, wenn der übliche Preis gilt."
            />
            <FormFeld
              label="Notiz"
              wert={f.note}
              onAendern={(w) => setF({ ...f, note: w })}
              platzhalter="z. B. Ehrenmitglied seit 2020"
            />
          </FormGruppe>
          <View>
            <Knopf
              art="gold"
              gross
              text="Zuordnen"
              laeuftText="Wird zugeordnet…"
              laeuft={laeuft}
              onPress={() =>
                void ausfuehren(
                  () => beitragsartZuordnen(props.mitgliedId, props.jahr, f),
                  async (e) => {
                    zu();
                    await props.onGespeichert(e.meldung);
                  },
                )
              }
            />
          </View>
        </>
      )}
    </FormBlatt>
  );
}
