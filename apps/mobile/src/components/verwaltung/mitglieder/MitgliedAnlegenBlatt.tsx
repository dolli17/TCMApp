/**
 * Neues Mitglied anlegen (Nachbau von
 * apps/web/src/components/MitgliedAnlegenFenster.tsx)
 *
 * Nach dem Anlegen geht es direkt auf das neue Mitglied: danach fehlen fast
 * immer noch Beitragsart, Zahler oder Notfallkontakt.
 */

import { useState } from "react";
import { router, type Href } from "expo-router";
import {
  FormAuswahl, FormBlatt, FormFeld, FormGruppe, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { heuteInBerlin, isoZuDeutsch } from "@/lib/verwaltung/gemeinsam";
import { mitgliedAnlegen, type NeuesMitglied } from "@/lib/verwaltung/mitglieder";
import { ANREDE, GESCHLECHT } from "@/components/verwaltung/mitglieder/optionen";

export function MitgliedAnlegenBlatt({ onSchliessen }: { onSchliessen: () => void }) {
  const [f, setF] = useState<NeuesMitglied>({
    first_name: "", last_name: "", started_on: isoZuDeutsch(heuteInBerlin()),
  });
  const { laeuft, meldung, ausfuehren } = useAktion();
  const feld = (name: keyof NeuesMitglied) => ({
    wert: f[name] ?? "",
    onAendern: (w: string) => setF((alt) => ({ ...alt, [name]: w })),
  });

  return (
    <FormBlatt
      titel="Mitglied anlegen"
      unterzeile="Mitgliedsnummer und Eintritt werden gesetzt, wenn du nichts angibst."
      onSchliessen={onSchliessen}
    >
      {(zu) => (
        <>
          <Meldung meldung={meldung} />
          <FormGruppe titel="Person">
            <FormFeld label="Vorname" gross="words" {...feld("first_name")} />
            <FormFeld label="Nachname" gross="words" {...feld("last_name")} />
            <FormAuswahl label="Anrede" wert={f.salutation ?? ""} optionen={ANREDE} leer="—" onWahl={(w) => setF({ ...f, salutation: w })} />
            <FormAuswahl label="Geschlecht" wert={f.gender ?? ""} optionen={GESCHLECHT} leer="—" onWahl={(w) => setF({ ...f, gender: w })} />
            <FormFeld label="Geburtstag" platzhalter="TT.MM.JJJJ" tastatur="numbers-and-punctuation" {...feld("birthday")} />
          </FormGruppe>
          <FormGruppe titel="Kontakt">
            <FormFeld label="E-Mail" tastatur="email-address" gross="none" {...feld("email")} />
            <FormFeld label="Telefon" tastatur="phone-pad" {...feld("phone")} />
            <FormFeld label="Mobil" tastatur="phone-pad" {...feld("mobile")} />
            <FormFeld label="Straße" platzhalter="Straße und Hausnummer" {...feld("street")} />
            <FormFeld label="PLZ" tastatur="number-pad" {...feld("postcode")} />
            <FormFeld label="Ort" gross="words" {...feld("city")} />
          </FormGruppe>
          <FormGruppe titel="Mitgliedschaft">
            <FormFeld label="Nummer" platzhalter="automatisch" gross="none" {...feld("number")} />
            <FormFeld label="Eintritt" platzhalter="TT.MM.JJJJ" tastatur="numbers-and-punctuation" {...feld("started_on")} />
          </FormGruppe>
          <Knopf
            art="gold"
            gross
            text="Anlegen"
            laeuftText="Wird angelegt…"
            laeuft={laeuft}
            onPress={() =>
              void ausfuehren(
                () => mitgliedAnlegen(f),
                (e) => {
                  if (!e.daten) return;
                  zu();
                  router.push(`/verwaltung/mitglieder/${e.daten}` as Href);
                },
              )
            }
          />
        </>
      )}
    </FormBlatt>
  );
}
