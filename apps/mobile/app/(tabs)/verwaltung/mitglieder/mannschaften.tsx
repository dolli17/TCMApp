/**
 * Mannschaften (Nachbau von apps/web/src/app/admin/mitglieder/mannschaften)
 *
 * Wer spielt in welcher Mannschaft, und wer fuehrt sie. Anlegen und
 * Bearbeiten samt Aufstellung stehen je in einem Blatt; nach dem Anlegen
 * oeffnet sich gleich die Bearbeitung, damit die Aufstellung gefuellt
 * werden kann, ohne die Mannschaft erst zu suchen.
 */

import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Bildschirm } from "@/components/Bildschirm";
import { Meldung } from "@/components/verwaltung/Formular";
import { LeereZeile, ListenGruppe, Listenzeile } from "@/components/verwaltung/Liste";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { MannschaftsBlatt } from "@/components/verwaltung/mitglieder/MannschaftsBlatt";
import { MitgliederSegmente } from "@/components/verwaltung/mitglieder/MitgliederSegmente";
import { useLaden } from "@/lib/laden";
import { ladeMannschaften, zaehleOffeneAntraege } from "@/lib/verwaltung/mitglieder";

export default function MannschaftenSeite() {
  const params = useLocalSearchParams<{ bearbeiten?: string }>();
  const zustand = useLaden(async () => {
    const [mannschaften, antraege] = await Promise.all([ladeMannschaften(), zaehleOffeneAntraege().catch(() => null)]);
    return { mannschaften, antraege };
  });
  const [anlegen, setAnlegen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<string | null>(params.bearbeiten ?? null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const mannschaften = zustand.daten?.mannschaften ?? [];
  const inBearbeitung = mannschaften.find((m) => m.id === bearbeiten);

  async function geaendert(text?: string) {
    if (text) setMeldung({ ok: true, text });
    await zustand.erneutHolen();
  }

  return (
    <>
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
      >
        <VerwaltungsKopf
          unterzeile="Wer spielt in welcher Mannschaft, und wer führt sie. Ein Spieler steht in höchstens einer Mannschaft – die meisten Mitglieder in keiner."
          aktion={{
            text: "Mannschaft anlegen",
            onPress: () => {
              setMeldung(null);
              setAnlegen(true);
            },
          }}
        >
          <MitgliederSegmente aktiv="/verwaltung/mitglieder/mannschaften" antraege={zustand.daten?.antraege ?? null} />
        </VerwaltungsKopf>
        <Meldung meldung={meldung} />

        {zustand.daten && (
          <ListenGruppe>
            {mannschaften.length === 0 ? (
              <LeereZeile text="Noch keine Mannschaften angelegt." />
            ) : (
              mannschaften.map((m) => (
                <Listenzeile
                  key={m.id}
                  onPress={() => {
                    setMeldung(null);
                    setBearbeiten(m.id);
                  }}
                  symbol={m.name.replace(/[^A-ZÄÖÜ0-9]/g, "").slice(0, 3) || m.name.slice(0, 2)}
                  titel={m.name}
                  kontext={`${m.member_count} Spieler${m.captain_name ? ` · Führer: ${m.captain_name}` : ""}`}
                  hinweis={m.active ? undefined : "stillgelegt"}
                />
              ))
            )}
          </ListenGruppe>
        )}
      </Bildschirm>

      {anlegen && (
        <MannschaftsBlatt
          key="neu"
          onSchliessen={() => setAnlegen(false)}
          onGeaendert={geaendert}
          onAngelegt={(id) => {
            setAnlegen(false);
            setBearbeiten(id);
          }}
        />
      )}
      {inBearbeitung && (
        // Der key baut das Blatt beim Wechsel der Mannschaft neu auf.
        <MannschaftsBlatt
          key={inBearbeitung.id}
          vorhanden={inBearbeitung}
          onSchliessen={() => setBearbeiten(null)}
          onGeaendert={geaendert}
        />
      )}
    </>
  );
}
