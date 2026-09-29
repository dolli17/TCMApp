/**
 * Aufnahmeantraege (Nachbau von apps/web/src/app/admin/mitglieder/antraege)
 *
 * Filter Offen · Alle · Erledigt, darunter die Liste. Nur offene Antraege
 * oeffnen das Blatt; erledigte stehen zur Ansicht da. Nach dem Schliessen
 * wird neu geladen - waehrend das Blatt offen ist, soll die Meldung mit der
 * Mitgliedsnummer stehen bleiben.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Bildschirm } from "@/components/Bildschirm";
import { Chipwahl, Meldung } from "@/components/verwaltung/Formular";
import { LeereZeile, ListenGruppe, Listenzeile, type HinweisTon } from "@/components/verwaltung/Liste";
import { VerwaltungsKopf } from "@/components/verwaltung/VerwaltungsKopf";
import { AntragsBlatt } from "@/components/verwaltung/mitglieder/AntragsBlatt";
import { MitgliederSegmente } from "@/components/verwaltung/mitglieder/MitgliederSegmente";
import { useLaden } from "@/lib/laden";
import { useTheme } from "@/lib/theme";
import { zeitstempel } from "@/lib/verwaltung/gemeinsam";
import { ANTRAGS_FILTER, ladeAntraege, type Antrag, type AntragsFilter } from "@/lib/verwaltung/mitglieder";

const STATUS_TEXT: Record<string, string> = {
  new: "offen",
  accepted: "aufgenommen",
  declined: "abgelehnt",
  spam: "Spam",
};

export default function AntraegeSeite() {
  const { stil } = useTheme();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<AntragsFilter>(
    ANTRAGS_FILTER.find((f) => f.wert === params.filter)?.wert ?? "offen",
  );
  const [offen, setOffen] = useState<Antrag | null>(null);
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);

  const laden = useCallback(() => ladeAntraege(filter), [filter]);
  const zustand = useLaden(laden);
  const holen = useRef(zustand.erneutHolen);
  holen.current = zustand.erneutHolen;
  const erstes = useRef(true);
  useEffect(() => {
    if (erstes.current) {
      erstes.current = false;
      return;
    }
    void holen.current();
  }, [filter]);

  const d = zustand.daten;
  const antraege = d?.antraege ?? [];

  return (
    <>
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
      >
        <VerwaltungsKopf
          unterzeile={
            filter === "offen" && antraege.length === 0
              ? "Zurzeit liegt nichts vor."
              : `${antraege.length} Anträge in dieser Ansicht.`
          }
        >
          <MitgliederSegmente aktiv="/verwaltung/mitglieder/antraege" antraege={d?.offene ?? null} />
        </VerwaltungsKopf>

        <Chipwahl
          optionen={ANTRAGS_FILTER.map((f) => ({ wert: f.wert, label: f.label }))}
          wert={filter}
          onWahl={(w) => {
            setMeldung(null);
            setFilter(w);
          }}
        />
        <Meldung meldung={meldung} />

        {d && (
          <ListenGruppe>
            {antraege.length === 0 ? (
              <LeereZeile text="Keine Anträge in dieser Ansicht." />
            ) : (
              antraege.map((a) => {
                const neu = a.status === "new";
                const dublette = a.possible_duplicate && neu;
                const ton: HinweisTon = dublette ? "rot" : neu ? "gold" : a.status === "accepted" ? "gruen" : "leise";
                return (
                  <Listenzeile
                    key={a.id}
                    avatar={{ kurz: (a.first_name[0] ?? "") + (a.last_name[0] ?? ""), id: a.id }}
                    titel={`${a.last_name}, ${a.first_name}`}
                    kontext={`${zeitstempel(a.submitted_at)} · ${a.email}`}
                    hinweis={dublette ? "Dublette?" : (STATUS_TEXT[a.status] ?? a.status)}
                    hinweisTon={ton}
                    onPress={neu ? () => {
                      setMeldung(null);
                      setOffen(a);
                    } : undefined}
                  />
                );
              })
            )}
          </ListenGruppe>
        )}

        <Text style={[stil.leise, { marginHorizontal: 4 }]}>
          Das öffentliche Formular steht unter /antrag. Wer dort einen Antrag stellt, taucht hier auf – angelegt
          wird erst mit der Aufnahme.
        </Text>
      </Bildschirm>

      {offen && d && (
        <AntragsBlatt
          antrag={offen}
          beitragsarten={d.beitragsarten}
          onSchliessen={() => {
            setOffen(null);
            void zustand.erneutHolen();
          }}
          onErledigt={(text) => setMeldung({ ok: true, text })}
        />
      )}
    </>
  );
}
