/**
 * Buchungsarten (Nachbau von Artenliste in
 * apps/web/src/components/PlatzVerwaltung.tsx)
 *
 * Der Code bleibt nach dem Anlegen fest - er steht in bestehenden Buchungen.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import {
  Chipwahl, FormBlatt, FormFeld, FormGruppe, FormSchalter, Knopf, Meldung, useAktion,
} from "@/components/verwaltung/Formular";
import { Abschnitt, Gruppenkopf, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { useTheme } from "@/lib/theme";
import type { Ergebnis } from "@/lib/verwaltung/gemeinsam";
import { speichereBuchungsart, type ArtFormular, type ArtZeile } from "@/lib/verwaltung/plaetze";

const LEER: ArtFormular = {
  code: "",
  name: "",
  art: "booking",
  dauer: "60",
  minSpieler: "2",
  maxSpieler: "2",
  brauchtPartner: true,
  zaehltAufKontingent: true,
  aktiv: true,
};

function alsFormular(a: ArtZeile): ArtFormular {
  return {
    code: a.code,
    name: a.name,
    art: a.applies_to,
    dauer: String(a.duration_minutes),
    minSpieler: String(a.min_players),
    maxSpieler: String(a.max_players),
    brauchtPartner: a.requires_partner,
    zaehltAufKontingent: a.counts_towards_quota,
    aktiv: a.active,
  };
}

export function ArtenListe({
  arten,
  melde,
  neuLaden,
}: {
  arten: ArtZeile[];
  melde: (e: Ergebnis) => void;
  neuLaden: () => Promise<void>;
}) {
  const { stil, farben } = useTheme();
  const [offen, setOffen] = useState<ArtZeile | null | undefined>(undefined);

  return (
    <Abschnitt>
      <Gruppenkopf titel="Buchungsarten" />
      <Text style={[stil.leise, { fontSize: 14, marginHorizontal: 4, color: farben.ink2 }]}>
        Der Code bleibt nach dem Anlegen fest – er steht in bestehenden Buchungen. Wer ihn ändern
        will, legt eine neue Art an und stellt die alte still.
      </Text>
      <ListenGruppe>
        {arten.map((a) => (
          <Listenzeile
            key={a.code}
            titel={a.name}
            kontext={`${a.code} · ${a.applies_to === "booking" ? "Buchung" : "Blockung"} · ${a.duration_minutes} min · ${a.min_players}–${a.max_players} Spieler · ${a.counts_towards_quota ? "zählt aufs Kontingent" : "zählt nicht"}`}
            hinweis={a.active ? undefined : "still"}
            onPress={() => setOffen(a)}
          />
        ))}
        <Listenzeile titel="Neue Buchungsart" onPress={() => setOffen(null)} />
      </ListenGruppe>

      {offen !== undefined && (
        <FormBlatt
          titel={offen ? `„${offen.code}" bearbeiten` : "Neue Buchungsart"}
          onSchliessen={() => setOffen(undefined)}
        >
          {(zu) => (
            <ArtBlatt
              vorhanden={offen}
              onErfolg={async (e) => {
                await neuLaden();
                melde(e);
                zu();
              }}
            />
          )}
        </FormBlatt>
      )}
    </Abschnitt>
  );
}

function ArtBlatt({
  vorhanden,
  onErfolg,
}: {
  vorhanden: ArtZeile | null;
  onErfolg: (e: Ergebnis) => Promise<void>;
}) {
  const [form, setForm] = useState<ArtFormular>(vorhanden ? alsFormular(vorhanden) : LEER);
  const { laeuft, meldung, ausfuehren } = useAktion();
  const setze = (teil: Partial<ArtFormular>) => setForm({ ...form, ...teil });

  return (
    <View style={{ gap: 14 }}>
      <FormGruppe>
        <FormFeld label="Code" wert={form.code} onAendern={(w) => setze({ code: w })} gross="none" editierbar={!vorhanden} />
        <FormFeld label="Name" wert={form.name} onAendern={(w) => setze({ name: w })} />
      </FormGruppe>

      <Chipwahl
        label="Wofür"
        optionen={[
          { wert: "booking" as const, label: "Buchung durch Mitglieder" },
          { wert: "blocking" as const, label: "Blockung durch den Vorstand" },
        ]}
        wert={form.art}
        onWahl={(w) => setze({ art: w })}
      />

      <FormGruppe>
        <FormFeld label="Dauer (min)" wert={form.dauer} onAendern={(w) => setze({ dauer: w })} tastatur="number-pad" />
        <FormFeld label="Spieler mind." wert={form.minSpieler} onAendern={(w) => setze({ minSpieler: w })} tastatur="number-pad" />
        <FormFeld label="Spieler höchst." wert={form.maxSpieler} onAendern={(w) => setze({ maxSpieler: w })} tastatur="number-pad" />
      </FormGruppe>

      <FormGruppe>
        <FormSchalter
          label="Zählt auf das Buchungskontingent"
          an={form.zaehltAufKontingent}
          onWechsel={(an) => setze({ zaehltAufKontingent: an })}
        />
        <FormSchalter
          label="Mindestens ein Mitspieler ist Pflicht"
          an={form.brauchtPartner}
          onWechsel={(an) => setze({ brauchtPartner: an })}
        />
        <FormSchalter
          label="Aktiv – wird zur Auswahl angeboten"
          an={form.aktiv}
          onWechsel={(an) => setze({ aktiv: an })}
        />
      </FormGruppe>

      <Meldung meldung={meldung} />
      <Knopf
        art="gold"
        gross
        text="Speichern"
        laeuft={laeuft}
        deaktiviert={form.code.trim() === "" || form.name.trim() === ""}
        onPress={() => void ausfuehren(() => speichereBuchungsart(form), onErfolg)}
      />
    </View>
  );
}
