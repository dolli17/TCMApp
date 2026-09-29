/**
 * Merkmale (Nachbau von apps/web/src/app/admin/system/merkmale/page.tsx)
 *
 * Alles, was der Verein am Mitglied festhalten will, ohne dass jemand Code
 * aendern muss. Die Liste nennt je Merkmal Schluessel, Art, wer es setzt und
 * wie oft es vergeben ist; ein Tippen oeffnet das Formular als Blatt. Anders
 * als im Web stehen die Werte einer Auswahl schon in der Liste.
 */

import { useState } from "react";
import { Bildschirm } from "@/components/Bildschirm";
import { Meldung } from "@/components/verwaltung/Formular";
import { LeereZeile, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { MerkmalBlatt } from "@/components/verwaltung/system/MerkmalBlatt";
import { useLaden } from "@/lib/laden";
import { ART_TEXT, ladeMerkmale, type MerkmalsDefinition } from "@/lib/verwaltung/system";

export default function MerkmaleSeite() {
  const zustand = useLaden(ladeMerkmale);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  // undefined: zu; null: neues Merkmal
  const [offen, setOffen] = useState<MerkmalsDefinition | null | undefined>(undefined);
  const merkmale = zustand.daten ?? [];

  return (
    <Bildschirm
      laedt={zustand.laedt}
      aktualisiert={zustand.aktualisiert}
      onAktualisieren={zustand.neuLaden}
      fehler={zustand.fehler}
    >
      <VerwaltungsKopf
        unterzeile="Alles, was der Verein am Mitglied festhalten will, ohne dass jemand Code ändern muss – Einwilligungen, Ehrungen, eigene Kennzeichnungen. Fachlich Wichtiges wie Trainer oder Leistungsklasse steht dagegen fest in den Stammdaten."
        aktion={{ text: "Merkmal anlegen", onPress: () => setOffen(null) }}
      />

      <Meldung meldung={meldung} />

      <ListenGruppe>
        {merkmale.length === 0 ? (
          <LeereZeile text="Noch keine Merkmale angelegt." />
        ) : (
          merkmale.map((m) => {
            const zeile = [
              m.code,
              `${ART_TEXT[m.value_kind] ?? m.value_kind}${m.multiple ? ", mehrfach" : ""}`,
              m.self_editable ? "Mitglied selbst" : "Vorstand",
              m.in_application ? "im Antrag" : null,
              m.active ? null : "stillgelegt",
            ].filter(Boolean).join(" · ");
            const werte =
              m.value_kind === "list" && m.optionen.length > 0
                ? `\nWerte: ${m.optionen.map((o) => o.label).join(", ")}`
                : "";
            return (
              <Listenzeile
                key={m.id}
                titel={m.name}
                kontext={zeile + werte}
                hinweis={`${m.anzahl_werte} vergeben`}
                label={`${m.name} bearbeiten`}
                onPress={() => {
                  setMeldung(null);
                  setOffen(m);
                }}
              />
            );
          })
        )}
      </ListenGruppe>

      {offen !== undefined && (
        <MerkmalBlatt
          // Der Schluessel baut das Formular beim Wechsel neu auf - wie im Web.
          key={offen?.code ?? "neu"}
          vorhanden={offen ?? undefined}
          onSchliessen={() => setOffen(undefined)}
          onErfolg={(text) => {
            setMeldung({ ok: true, text });
            void zustand.erneutHolen();
          }}
        />
      )}
    </Bildschirm>
  );
}
