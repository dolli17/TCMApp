/**
 * Ein Lastschriftlauf (Nachbau von
 * apps/web/src/app/admin/kasse/lastschriften/[id]/page.tsx)
 *
 * Die eigene Adresse ist Absicht: ein Lauf ist ein Vorgang ueber mehrere Tage,
 * die Uebersicht verlinkt direkt hierher.
 */

import { Stack, useLocalSearchParams } from "expo-router";
import { Bildschirm } from "@/components/Bildschirm";
import { LeereZeile, ListenGruppe } from "@/components/verwaltung/Liste";
import { LastschriftLauf } from "@/components/verwaltung/kasse/LastschriftLauf";
import { useLaden } from "@/lib/laden";
import { ladeLauf } from "@/lib/verwaltung/kasse";

export default function LaufSeite() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const zustand = useLaden(() => ladeLauf(String(id)));
  const d = zustand.daten;

  return (
    <>
      <Stack.Screen options={{ title: d?.lauf?.title ?? "Lastschriftlauf" }} />
      <Bildschirm
        laedt={zustand.laedt}
        aktualisiert={zustand.aktualisiert}
        onAktualisieren={zustand.neuLaden}
        fehler={zustand.fehler}
      >
        {d && !d.lauf && (
          <ListenGruppe>
            <LeereZeile text="Diesen Lastschriftlauf gibt es nicht." />
          </ListenGruppe>
        )}
        {d?.lauf && (
          <LastschriftLauf
            lauf={d.lauf}
            kandidaten={d.kandidaten}
            posten={d.posten}
            jeArt={d.jeArt}
            faelligAb={d.faelligAb}
            heute={d.heute}
            onGeaendert={zustand.erneutHolen}
          />
        )}
      </Bildschirm>
    </>
  );
}
