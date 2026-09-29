/**
 * Alle Forderungen mit den beiden Handgriffen, die es dazu gibt (Nachbau von
 * apps/web/src/components/ForderungsListe.tsx).
 *
 * "Bezahlt" ist der Weg fuer Ueberweiser: ohne ihn haetten Mitglieder ohne
 * Mandat eine ewig offene Forderung. "Erlassen" loescht nicht, sondern
 * markiert - die Forderung soll nachvollziehbar bleiben. Beide Handgriffe
 * stehen im Blatt der Forderung (Regel 4).
 *
 * Abweichung vom Web: bis zu 500 Zeilen sind am Telefon zu viel auf einmal;
 * die Liste zeigt erst einen Ausschnitt, der Rest kommt auf Wunsch dazu.
 */

import { useState } from "react";
import { View } from "react-native";
import { formatCents } from "@tcm/core";
import {
  FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, Wertzeile, useAktion,
} from "@/components/verwaltung/Formular";
import { LeereZeile, ListenGruppe, Listenzeile, type MarkenTon } from "@/components/verwaltung/Liste";
import { BetragMitMarke, Unterzeile } from "@/components/verwaltung/kasse/Teile";
import { useTheme } from "@/lib/theme";
import { isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import {
  forderungAbhaken, forderungErlassen, type ForderungZeile,
} from "@/lib/verwaltung/kasse";

export const ART: Record<ForderungZeile["kind"], string> = {
  fee: "Beitrag",
  drinks: "Getränke",
  deposit: "Pfand",
  work_duty: "Arbeitsdienst",
  guest: "Gastgebühr",
  misc: "Sonstiges",
};

const STAND: Record<ForderungZeile["status"], string> = {
  open: "offen",
  notified: "angekündigt",
  submitted: "eingereicht",
  settled: "bezahlt",
  returned: "zurückgebucht",
  waived: "erlassen",
};

const STAND_TON: Partial<Record<ForderungZeile["status"], MarkenTon>> = {
  open: "gelb", notified: "gelb", settled: "gruen", returned: "rot",
};

const AUSSCHNITT = 60;

/** Nur offene, angekuendigte und zurueckgebuchte lassen sich noch abhaken oder erlassen. */
const offen = (f: ForderungZeile) => f.status === "open" || f.status === "notified" || f.status === "returned";

export function ForderungsListe({
  forderungen,
  onGeaendert,
}: {
  forderungen: ForderungZeile[];
  onGeaendert: () => void | Promise<void>;
}) {
  const { farben } = useTheme();
  const { laeuft, meldung, ausfuehren } = useAktion();
  const [gewaehlt, setGewaehlt] = useState<ForderungZeile | null>(null);
  const [erlassen, setErlassen] = useState(false);
  const [grund, setGrund] = useState("");
  const [alle, setAlle] = useState(false);

  const sichtbar = alle ? forderungen : forderungen.slice(0, AUSSCHNITT);

  function handgriff(aktion: () => ReturnType<typeof forderungAbhaken>, schliessen: () => void) {
    void ausfuehren(aktion, async () => {
      schliessen();
      await onGeaendert();
    });
  }

  return (
    <>
      <Meldung meldung={meldung} />

      <ListenGruppe>
        {forderungen.length === 0 ? (
          <LeereZeile text="Keine Forderungen in dieser Ansicht." />
        ) : (
          sichtbar.map((f) => (
            <Listenzeile
              key={f.id}
              titel={f.member_name}
              kontext={[
                f.description,
                f.payer_id === f.member_id ? null : `Zahler ${f.payer_name}`,
                f.due_date ? `fällig ${isoZuDeutsch(f.due_date)}` : null,
              ].filter(Boolean).join(" · ")}
              neben={
                !f.hat_mandat && offen(f) ? (
                  <BetragMitMarke cents={f.amount_cents} marke="kein Mandat" ton="rot" />
                ) : (
                  <BetragMitMarke cents={f.amount_cents} marke={STAND[f.status]} ton={STAND_TON[f.status] ?? "grau"} />
                )
              }
              onPress={offen(f) ? () => { setGewaehlt(f); setErlassen(false); setGrund(""); } : undefined}
              pfeil={offen(f)}
            />
          ))
        )}
        {!alle && forderungen.length > AUSSCHNITT && (
          <Listenzeile
            titel={`Alle ${forderungen.length} zeigen`}
            hinweis={`${forderungen.length - AUSSCHNITT} weitere`}
            onPress={() => setAlle(true)}
          />
        )}
      </ListenGruppe>

      {gewaehlt && (
        <FormBlatt titel={gewaehlt.member_name} unterzeile={gewaehlt.description} onSchliessen={() => setGewaehlt(null)}>
          {(schliessen) => (
            <>
              <View style={{ backgroundColor: farben.surf2, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 16 }}>
                <Wertzeile name="Betrag" wert={formatCents(gewaehlt.amount_cents)} />
                <Wertzeile name="Art" wert={ART[gewaehlt.kind]} />
                <Wertzeile name="Zeitraum" wert={gewaehlt.period_label ?? "—"} />
                <Wertzeile name="Zahler" wert={gewaehlt.payer_id === gewaehlt.member_id ? "selbst" : gewaehlt.payer_name} />
                <Wertzeile name="Mandat" wert={gewaehlt.hat_mandat ? "liegt vor" : "fehlt"} />
                <Wertzeile name="Stand" wert={STAND[gewaehlt.status]} />
              </View>

              <Meldung meldung={meldung && !meldung.ok ? meldung : null} />

              {!erlassen ? (
                <ListenGruppe>
                  <Listenzeile
                    titel="Als bezahlt vermerken"
                    kontext="Für Überweiser: die Forderung ist beglichen."
                    pfeil={false}
                    onPress={laeuft ? undefined : () => handgriff(() => forderungAbhaken(gewaehlt.id, "per Ueberweisung"), schliessen)}
                  />
                  <Listenzeile titel="Erlassen" gefahr pfeil={false} onPress={() => setErlassen(true)} />
                </ListenGruppe>
              ) : (
                <>
                  <Unterzeile>
                    Die Forderung bleibt als Beleg stehen und wird nicht mehr eingezogen. Der Grund ist
                    später die einzige Erklärung, die noch da ist.
                  </Unterzeile>
                  <FormGruppe>
                    <FormFeld
                      label="Grund"
                      wert={grund}
                      onAendern={setGrund}
                      platzhalter="z. B. Austritt zum Jahresanfang"
                      autoFokus
                    />
                  </FormGruppe>
                  <Knopf
                    art="gefahr"
                    gross
                    text="Wirklich erlassen"
                    laeuft={laeuft}
                    deaktiviert={grund.trim() === ""}
                    onPress={() => handgriff(() => forderungErlassen(gewaehlt.id, grund), schliessen)}
                  />
                  <Knopf art="leise" text="Abbrechen" onPress={() => setErlassen(false)} />
                </>
              )}
            </>
          )}
        </FormBlatt>
      )}
    </>
  );
}
